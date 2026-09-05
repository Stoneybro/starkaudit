// StarkAudit — AuditRegistry Contract
// Stores audit proof submissions, duplicate detection, and exception flags.
// Spec: proposedspec.md §5

use starknet::ContractAddress;

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
    pub nullifier: felt252,
}

#[derive(Drop, starknet::Event)]
pub struct ThresholdUpdated {
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

// ── Interface ────────────────────────────────────────────────────────────────

#[starknet::interface]
pub trait IAuditRegistry<T> {
    fn register_business(ref self: T);
    fn register_business_for(ref self: T, addr: ContractAddress);
    fn set_auditor(ref self: T, auditor: ContractAddress);
    fn set_threshold_commitment(ref self: T, hash: felt252);
    fn set_duplicate_window(ref self: T, window_seconds: u64);
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
    fn flag_exception(ref self: T, nullifier: felt252);
    fn get_result(self: @T, nullifier: felt252) -> AuditResult;
    fn is_registered(self: @T, addr: ContractAddress) -> bool;
    fn get_threshold_commitment(self: @T) -> felt252;
    fn get_threshold_version(self: @T) -> u64;
    fn get_duplicate_window(self: @T) -> u64;
    fn get_auditor(self: @T, business: ContractAddress) -> ContractAddress;
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[starknet::contract]
pub mod AuditRegistry {
    use super::{AuditResult, IAuditRegistry, ProofSubmitted, ExceptionFlagged, ThresholdUpdated, BusinessRegistered, AuditorSet};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{Map, StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry};

    #[storage]
    struct Storage {
        auditor: ContractAddress, // global deployer, kept for admin
        businesses: Map<ContractAddress, bool>,
        auditor_of: Map<ContractAddress, ContractAddress>, // business -> chosen auditor (demo: any address)
        threshold_commitment: felt252,
        threshold_version: u64,
        duplicate_window: u64,          // seconds
        results: Map<felt252, AuditResult>,    // nullifier → AuditResult
        result_exists: Map<felt252, bool>,     // anti-replay guard
        dup_seen: Map<felt252, u64>,           // dup_commit → timestamp first seen
        dup_seen_exists: Map<felt252, bool>,   // dup_commit → ever seen (timestamp 0 is valid, so 0 is no sentinel)
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
    }

    #[constructor]
    fn constructor(ref self: ContractState, auditor: ContractAddress) {
        self.auditor.write(auditor);
        // Default: 7 days duplicate window
        self.duplicate_window.write(604800_u64);
    }

    #[abi(embed_v0)]
    impl AuditRegistryImpl of IAuditRegistry<ContractState> {
        /// Register a business address — open to anyone (business self-registers).
        /// Any wallet can call register_business() and it registers get_caller_address().
        /// The auditor-only helper register_business_for is kept for the auditor to pre-register in demos.
        fn register_business(ref self: ContractState) {
            let caller = get_caller_address();
            self.businesses.entry(caller).write(true);
            self.emit(BusinessRegistered { business: caller });
        }

        fn register_business_for(ref self: ContractState, addr: ContractAddress) {
            self._assert_auditor();
            self.businesses.entry(addr).write(true);
            self.emit(BusinessRegistered { business: addr });
        }

        /// Business sets its chosen auditor — demo-intentional open behavior:
        /// any caller may set auditor_of[caller]. No registration check on purpose,
        /// so judges can test with fresh wallets without a pre-registration step.
        fn set_auditor(ref self: ContractState, auditor: ContractAddress) {
            let caller = get_caller_address();
            self.auditor_of.entry(caller).write(auditor);
            self.emit(AuditorSet { business: caller, auditor });
        }

        /// Set threshold commitment — auditor-only, versioned.
        /// Business must know threshold out-of-band to build proofs.
        fn set_threshold_commitment(ref self: ContractState, hash: felt252) {
            self._assert_auditor();
            let version = self.threshold_version.read() + 1;
            self.threshold_version.write(version);
            self.threshold_commitment.write(hash);
            self.emit(ThresholdUpdated { version, hash });
        }

        /// Set duplicate detection window in seconds.
        fn set_duplicate_window(ref self: ContractState, window_seconds: u64) {
            self._assert_auditor();
            self.duplicate_window.write(window_seconds);
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
        /// Steps:
        ///   0. Anti-replay — one result per nullifier
        ///   1. Storage check — enc_amount vs pool payload (offchain_verified if no pool view)
        ///   2. Proof verification (offchain_verified if no on-chain verifier deployed)
        ///   3. Duplicate detection
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

            // Step 3: duplicate detection
            let now = get_block_timestamp();
            let window = self.duplicate_window.read();
            let first_seen = self.dup_seen.entry(dup_commit).read();
            let seen_before = self.dup_seen_exists.entry(dup_commit).read();
            let is_duplicate = seen_before && (now - first_seen) <= window;
            if !seen_before {
                self.dup_seen.entry(dup_commit).write(now);
                self.dup_seen_exists.entry(dup_commit).write(true);
            }

            // pass = submitter's threshold claim, overridden to false on duplicate.
            // (On-chain threshold evaluation arrives with the verifier; until then
            // the auditor re-verifies the claim off-chain against the commitments.)
            let pass = pass_claim && !is_duplicate;

            // Step 4: store + emit
            let business = get_caller_address();
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

        /// Flag an exception for a nullifier (auditor-only, manual for sprint).
        fn flag_exception(ref self: ContractState, nullifier: felt252) {
            self._assert_auditor();
            self.emit(ExceptionFlagged { nullifier });
        }

        fn get_result(self: @ContractState, nullifier: felt252) -> AuditResult {
            assert(self.result_exists.entry(nullifier).read(), 'NOT_FOUND');
            self.results.entry(nullifier).read()
        }

        fn is_registered(self: @ContractState, addr: ContractAddress) -> bool {
            self.businesses.entry(addr).read()
        }

        fn get_threshold_commitment(self: @ContractState) -> felt252 {
            self.threshold_commitment.read()
        }

        fn get_threshold_version(self: @ContractState) -> u64 {
            self.threshold_version.read()
        }

        fn get_duplicate_window(self: @ContractState) -> u64 {
            self.duplicate_window.read()
        }

        fn get_auditor(self: @ContractState, business: ContractAddress) -> ContractAddress {
            self.auditor_of.entry(business).read()
        }
    }

    // ── Internal Helpers ─────────────────────────────────────────────────────

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn _assert_auditor(self: @ContractState) {
            assert(get_caller_address() == self.auditor.read(), 'NOT_AUDITOR');
        }
    }
}
