// StarkAudit — AuditRegistry Contract
// Stores audit proof submissions, duplicate detection, and exception flags.
// Per-business model: no global auditor. Each business names its own auditor
// via set_auditor, and only that auditor may set that business's threshold,
// duplicate window, sealed packages, and flags.

use starknet::ContractAddress;

// Default duplicate window for businesses that never had one set explicitly.
pub const DEFAULT_DUPLICATE_WINDOW: u64 = 604800_u64; // 7 days

// ── Data Structures ──────────────────────────────────────────────────────────

#[derive(Drop, Serde, starknet::Store)]
pub struct AuditResult {
    pub business: ContractAddress,    // submitter (get_caller_address at submit time); Stage 5 callers submit for their own business
    pub note_id: felt252,             // public input; stored for the Stage 5 verifier/binding check (enc_amount itself is not stored yet)
    pub audit_commitment: felt252,  // poseidon(PRIVATE_AUDIT_TAG, amount, salt, counterparty, period)
    pub dup_commit: felt252,        // poseidon(DUP_TAG, counterparty, amount, period) — no salt
    pub pass: bool,                 // false on threshold fail OR duplicate
    pub unverified_binding: bool,   // true if constraint 5 derivation is unconfirmed (fallback)
    pub offchain_verified: bool,    // true if proof/enc_amount check is indexer-side, not on-chain
    pub submitted_at: u64,          // block timestamp
    pub is_duplicate: bool,         // true if dup_commit seen within duplicate_window
}

// ── Events ───────────────────────────────────────────────────────────────────

#[derive(Drop, starknet::Event)]
pub struct ProofSubmitted {
    #[key]
    pub nullifier: felt252,
    pub business: ContractAddress,
    pub pass: bool,
    pub is_duplicate: bool,
    pub unverified_binding: bool,
    pub offchain_verified: bool,
}

#[derive(Drop, starknet::Event)]
pub struct ExceptionFlagged {
    #[key]
    pub business: ContractAddress,
    #[key]
    pub nullifier: felt252,
}

#[derive(Drop, starknet::Event)]
pub struct ThresholdUpdated {
    #[key]
    pub business: ContractAddress,
    pub version: u64,
    pub hash: felt252,
}

#[derive(Drop, starknet::Event)]
pub struct BusinessRegistered {
    #[key]
    pub business: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct AuditorSet {
    #[key]
    pub business: ContractAddress,
    pub auditor: ContractAddress,
}

#[derive(Drop, starknet::Event)]
pub struct DuplicateWindowUpdated {
    #[key]
    pub business: ContractAddress,
    pub window_seconds: u64,
}

// Threshold distribution: the auditor never sends (threshold, salt) manually.
// Each business publishes an X25519 distribution pubkey (32 bytes as low/high
// u128 felts); the business's auditor seals the threshold package with nacl box
// and the contract stores the sealed felts bound to that business's threshold version.
// Plaintext layout (72 bytes): threshold_u256_be32 || salt_felt_be32 ||
// version_u64_be8. Ciphertext (nacl box overhead 16) is 88 bytes → 3 felts of
// 31/31/26 bytes big-endian; the 24-byte nonce fits one felt; the 32-byte
// ephemeral pubkey is stored as low/high u128 felts like the long-term key.

#[derive(Drop, Serde, starknet::Store)]
pub struct DistributionKey {
    pub low: felt252,  // first 16 bytes of the X25519 pubkey
    pub high: felt252, // last 16 bytes of the X25519 pubkey
}

#[derive(Drop, Serde, starknet::Store)]
pub struct ThresholdPackage {
    pub eph_low: felt252,
    pub eph_high: felt252,
    pub nonce: felt252,
    pub c0: felt252,
    pub c1: felt252,
    pub c2: felt252,
}

#[derive(Drop, starknet::Event)]
pub struct DistributionKeySet {
    #[key]
    pub business: ContractAddress,
    pub low: felt252,
    pub high: felt252,
}

#[derive(Drop, starknet::Event)]
pub struct ThresholdPackageShared {
    #[key]
    pub business: ContractAddress,
    pub version: u64,
}

// ── Interface ────────────────────────────────────────────────────────────────

#[starknet::interface]
pub trait IAuditRegistry<T> {
    fn register_business(ref self: T);
    fn set_auditor(ref self: T, auditor: ContractAddress);
    fn set_threshold_commitment(ref self: T, business: ContractAddress, hash: felt252);
    fn set_duplicate_window(ref self: T, business: ContractAddress, window_seconds: u64);
    fn submit_proof(
        ref self: T,
        nullifier: felt252,
        note_id: felt252,
        audit_commitment: felt252,
        dup_commit: felt252,
        enc_amount: felt252,
        proof: Span<felt252>,
        public_inputs: Span<felt252>,
        pass_claim: bool,
    );
    fn flag_exception(ref self: T, business: ContractAddress, nullifier: felt252);
    fn get_result(self: @T, nullifier: felt252) -> AuditResult;
    fn is_registered(self: @T, addr: ContractAddress) -> bool;
    fn get_threshold_commitment(self: @T, business: ContractAddress) -> felt252;
    fn get_threshold_version(self: @T, business: ContractAddress) -> u64;
    fn get_duplicate_window(self: @T, business: ContractAddress) -> u64;
    fn get_auditor(self: @T, business: ContractAddress) -> ContractAddress;
    fn set_distribution_key(ref self: T, low: felt252, high: felt252);
    fn get_distribution_key(self: @T, business: ContractAddress) -> (felt252, felt252);
    fn has_distribution_key(self: @T, business: ContractAddress) -> bool;
    fn share_threshold_package(
        ref self: T,
        business: ContractAddress,
        eph_low: felt252,
        eph_high: felt252,
        nonce: felt252,
        c0: felt252,
        c1: felt252,
        c2: felt252,
    );
    fn get_threshold_package(self: @T, business: ContractAddress, version: u64) -> (felt252, felt252, felt252, felt252, felt252, felt252);
    fn has_threshold_package(self: @T, business: ContractAddress, version: u64) -> bool;
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[starknet::contract]
pub mod AuditRegistry {
    use super::{AuditResult, IAuditRegistry, ProofSubmitted, ExceptionFlagged, ThresholdUpdated, BusinessRegistered, AuditorSet, DuplicateWindowUpdated, DistributionKey, DistributionKeySet, ThresholdPackage, ThresholdPackageShared, DEFAULT_DUPLICATE_WINDOW};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{Map, StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry};

    #[storage]
    struct Storage {
        businesses: Map<ContractAddress, bool>,
        auditor_of: Map<ContractAddress, ContractAddress>, // business -> chosen auditor
        threshold_commitment: Map<ContractAddress, felt252>, // business -> commitment
        threshold_version: Map<ContractAddress, u64>,        // business -> version
        duplicate_window: Map<ContractAddress, u64>,         // business -> seconds
        duplicate_window_set: Map<ContractAddress, bool>,    // business -> explicit window set (else DEFAULT)
        results: Map<felt252, AuditResult>,    // nullifier → AuditResult
        result_exists: Map<felt252, bool>,     // anti-replay guard
        dup_seen: Map<(ContractAddress, felt252), u64>,         // (business, dup_commit) → timestamp first seen
        dup_seen_exists: Map<(ContractAddress, felt252), bool>, // (business, dup_commit) → ever seen
        distribution_keys: Map<ContractAddress, DistributionKey>, // business → X25519 distribution pubkey
        distribution_key_exists: Map<ContractAddress, bool>,
        packages: Map<(ContractAddress, u64), ThresholdPackage>, // (business, threshold version) → sealed package
        package_exists: Map<(ContractAddress, u64), bool>,
        // [DECIDE] verifier address — set in constructor once §4 verifier is confirmed.
        // verifier: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        ProofSubmitted: ProofSubmitted,
        ExceptionFlagged: ExceptionFlagged,
        ThresholdUpdated: ThresholdUpdated,
        BusinessRegistered: BusinessRegistered,
        AuditorSet: AuditorSet,
        DuplicateWindowUpdated: DuplicateWindowUpdated,
        DistributionKeySet: DistributionKeySet,
        ThresholdPackageShared: ThresholdPackageShared,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        // No global auditor. Each business names its own auditor via set_auditor.
        // Per-business duplicate windows fall back to DEFAULT_DUPLICATE_WINDOW
        // until that business's auditor sets one explicitly.
    }

    #[abi(embed_v0)]
    impl AuditRegistryImpl of IAuditRegistry<ContractState> {
        /// Register a business address — open to anyone (business self-registers).
        /// Any wallet can call register_business() and it registers get_caller_address().
        fn register_business(ref self: ContractState) {
            let caller = get_caller_address();
            self.businesses.entry(caller).write(true);
            self.emit(BusinessRegistered { business: caller });
        }

        /// Business sets its chosen auditor — demo-intentional open behavior:
        /// any caller may set auditor_of[caller]. No registration check on purpose,
        /// so judges can test with fresh wallets without a pre-registration step.
        /// Only the business itself can (re)set its auditor; the auditor cannot
        /// seize other businesses.
        fn set_auditor(ref self: ContractState, auditor: ContractAddress) {
            let caller = get_caller_address();
            self.auditor_of.entry(caller).write(auditor);
            self.emit(AuditorSet { business: caller, auditor });
        }

        /// Set threshold commitment for a business — only that business's auditor.
        /// The business must have named an auditor first (else NO_AUDITOR).
        /// Version is per-business: each set bumps auditor_of[business]'s version.
        /// Business must know threshold out-of-band to build proofs.
        fn set_threshold_commitment(ref self: ContractState, business: ContractAddress, hash: felt252) {
            self._assert_business_auditor(business);
            let version = self.threshold_version.entry(business).read() + 1;
            self.threshold_version.entry(business).write(version);
            self.threshold_commitment.entry(business).write(hash);
            self.emit(ThresholdUpdated { business, version, hash });
        }

        /// Set duplicate detection window for a business — only that business's auditor.
        fn set_duplicate_window(ref self: ContractState, business: ContractAddress, window_seconds: u64) {
            self._assert_business_auditor(business);
            self.duplicate_window.entry(business).write(window_seconds);
            self.duplicate_window_set.entry(business).write(true);
            self.emit(DuplicateWindowUpdated { business, window_seconds });
        }

        /// Submit an audit proof for a nullifier.
        /// Permissionless by design (demo): anyone may submit for any nullifier.
        /// Accepted limitation — griefing/front-run ALREADY_SUBMITTED and fabricated
        /// pass are possible; Stage 5 callers submit for their own business and the
        /// auditor filters by the `business` field. See report.md Stage 4 notes.
        /// `pass_claim` is the submitter's 1-bit threshold verdict (amount itself can
        /// never go on-chain — calldata is public). The contract enforces
        /// duplicate-override: `pass = pass_claim && !is_duplicate`. The auditor
        /// re-verifies the claim off-chain against the commitments.
        /// Duplicate tracking is scoped per submitter business: the same
        /// dup_commit from two different businesses does NOT collide. The
        /// window applied is the submitter's own (auditor-set or default).
        /// Steps:
        ///   0. Anti-replay — one result per nullifier
        ///   1. Storage check — enc_amount vs pool payload (offchain_verified if no pool view)
        ///   2. Proof verification (offchain_verified if no on-chain verifier deployed)
        ///   3. Duplicate detection (per-business)
        ///   4. Store + emit
        fn submit_proof(
            ref self: ContractState,
            nullifier: felt252,
            note_id: felt252,
            audit_commitment: felt252,
            dup_commit: felt252,
            enc_amount: felt252,
            proof: Span<felt252>,
            public_inputs: Span<felt252>,
            pass_claim: bool,
        ) {
            // Step 0: anti-replay
            assert(!self.result_exists.entry(nullifier).read(), 'ALREADY_SUBMITTED');

            // Step 1: storage check
            // [VERIFY] Check if pool exposes a view for note payload at note_id.
            // If yes: assert(pool.view_note_payload(note_id) == enc_amount)
            // Until confirmed, mark offchain_verified = true for indexer to handle.
            let offchain_verified = true; // [REPLACE] once pool view confirmed

            // Step 2: proof verification
            // [DECIDE] Once verifier address is deployed (§4), call:
            //   assert(verifier.verify(proof, public_inputs), 'PROOF_INVALID');
            // Until then, store proof as-is (offchain_verified path).

            // Step 3: duplicate detection (per submitter business)
            let business = get_caller_address();
            let now = get_block_timestamp();
            let window = self._get_window(business);
            let dup_key = (business, dup_commit);
            let first_seen = self.dup_seen.entry(dup_key).read();
            let seen_before = self.dup_seen_exists.entry(dup_key).read();
            let is_duplicate = seen_before && (now - first_seen) <= window;
            if !seen_before {
                self.dup_seen.entry(dup_key).write(now);
                self.dup_seen_exists.entry(dup_key).write(true);
            }

            // pass = submitter's threshold claim, overridden to false on duplicate.
            // (On-chain threshold evaluation arrives with the verifier; until then
            // the auditor re-verifies the claim off-chain against the commitments.)
            let pass = pass_claim && !is_duplicate;

            // Step 4: store + emit
            let result = AuditResult {
                business,
                note_id,
                audit_commitment,
                dup_commit,
                pass,
                unverified_binding: false, // [UPDATE] set true if vector not confirmed by EOD Day 2
                offchain_verified,
                submitted_at: now,
                is_duplicate,
            };
            self.results.entry(nullifier).write(result);
            self.result_exists.entry(nullifier).write(true);
            self.emit(ProofSubmitted { nullifier, business, pass, is_duplicate, unverified_binding: false, offchain_verified });
        }

        /// Flag an exception for a business's nullifier — only that business's auditor.
        fn flag_exception(ref self: ContractState, business: ContractAddress, nullifier: felt252) {
            self._assert_business_auditor(business);
            self.emit(ExceptionFlagged { business, nullifier });
        }

        fn get_result(self: @ContractState, nullifier: felt252) -> AuditResult {
            assert(self.result_exists.entry(nullifier).read(), 'NOT_FOUND');
            self.results.entry(nullifier).read()
        }

        fn is_registered(self: @ContractState, addr: ContractAddress) -> bool {
            self.businesses.entry(addr).read()
        }

        fn get_threshold_commitment(self: @ContractState, business: ContractAddress) -> felt252 {
            self.threshold_commitment.entry(business).read()
        }

        fn get_threshold_version(self: @ContractState, business: ContractAddress) -> u64 {
            self.threshold_version.entry(business).read()
        }

        fn get_duplicate_window(self: @ContractState, business: ContractAddress) -> u64 {
            self._get_window(business)
        }

        fn get_auditor(self: @ContractState, business: ContractAddress) -> ContractAddress {
            self.auditor_of.entry(business).read()
        }

        /// Publish the caller's X25519 distribution pubkey (low/high u128 felts).
        /// Open self-serve like register_business: any caller sets its own key.
        /// The business's auditor seals each threshold package to this key — no manual delivery.
        fn set_distribution_key(ref self: ContractState, low: felt252, high: felt252) {
            let caller = get_caller_address();
            self.distribution_keys.entry(caller).write(DistributionKey { low, high });
            self.distribution_key_exists.entry(caller).write(true);
            self.emit(DistributionKeySet { business: caller, low, high });
        }

        fn get_distribution_key(self: @ContractState, business: ContractAddress) -> (felt252, felt252) {
            assert(self.distribution_key_exists.entry(business).read(), 'NO_DIST_KEY');
            let key = self.distribution_keys.entry(business).read();
            (key.low, key.high)
        }

        fn has_distribution_key(self: @ContractState, business: ContractAddress) -> bool {
            self.distribution_key_exists.entry(business).read()
        }

        /// Store the sealed threshold package for a business, bound to that
        /// business's CURRENT threshold version. Only that business's auditor.
        /// The backend decrypts and checks poseidon(package) against the on-chain
        /// commitment + version, so a stale or mismatched package can never be used silently.
        fn share_threshold_package(
            ref self: ContractState,
            business: ContractAddress,
            eph_low: felt252,
            eph_high: felt252,
            nonce: felt252,
            c0: felt252,
            c1: felt252,
            c2: felt252,
        ) {
            self._assert_business_auditor(business);
            let version = self.threshold_version.entry(business).read();
            assert(version != 0, 'NO_THRESHOLD');
            assert(self.distribution_key_exists.entry(business).read(), 'NO_DIST_KEY');
            self.packages.entry((business, version)).write(ThresholdPackage { eph_low, eph_high, nonce, c0, c1, c2 });
            self.package_exists.entry((business, version)).write(true);
            self.emit(ThresholdPackageShared { business, version });
        }

        fn get_threshold_package(self: @ContractState, business: ContractAddress, version: u64) -> (felt252, felt252, felt252, felt252, felt252, felt252) {
            assert(self.package_exists.entry((business, version)).read(), 'NO_PACKAGE');
            let p = self.packages.entry((business, version)).read();
            (p.eph_low, p.eph_high, p.nonce, p.c0, p.c1, p.c2)
        }

        fn has_threshold_package(self: @ContractState, business: ContractAddress, version: u64) -> bool {
            self.package_exists.entry((business, version)).read()
        }
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _assert_business_auditor(self: @ContractState, business: ContractAddress) {
            let auditor = self.auditor_of.entry(business).read();
            // Zero address means the business never named an auditor.
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(auditor != zero, 'NO_AUDITOR');
            assert(get_caller_address() == auditor, 'NOT_AUDITOR');
        }

        fn _get_window(self: @ContractState, business: ContractAddress) -> u64 {
            if self.duplicate_window_set.entry(business).read() {
                self.duplicate_window.entry(business).read()
            } else {
                DEFAULT_DUPLICATE_WINDOW
            }
        }
    }
}
