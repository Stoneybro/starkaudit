// StarkAudit — AuditRegistry Contract
// Stores audit proof submissions, duplicate detection, and exception flags.
// Spec: proposedspec.md §5

use starknet::ContractAddress;
use starknet::storage::Map;

// ── Data Structures ──────────────────────────────────────────────────────────

#[derive(Drop, Serde, starknet::Store)]
pub struct AuditResult {
    pub note_id: felt252,           // public input; enables storage audit of enc_amount
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

// ── Interface ────────────────────────────────────────────────────────────────

#[starknet::interface]
pub trait IAuditRegistry<T> {
    fn register_business(ref self: T, addr: ContractAddress);
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
    );
    fn flag_exception(ref self: T, nullifier: felt252);
    fn get_result(self: @T, nullifier: felt252) -> AuditResult;
    fn is_registered(self: @T, addr: ContractAddress) -> bool;
    fn get_threshold_commitment(self: @T) -> felt252;
    fn get_threshold_version(self: @T) -> u64;
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[starknet::contract]
mod AuditRegistry {
    use super::{AuditResult, IAuditRegistry, ProofSubmitted, ExceptionFlagged, ThresholdUpdated, BusinessRegistered};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::Map;

    #[storage]
    struct Storage {
        auditor: ContractAddress,
        businesses: Map<ContractAddress, bool>,
        threshold_commitment: felt252,
        threshold_version: u64,
        duplicate_window: u64,          // seconds
        results: Map<felt252, AuditResult>,    // nullifier → AuditResult
        result_exists: Map<felt252, bool>,     // anti-replay guard
        dup_seen: Map<felt252, u64>,           // dup_commit → timestamp first seen
        // [DECIDE] verifier address — set in constructor once §4 verifier is confirmed.
        // verifier: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        ProofSubmitted: ProofSubmitted,
        ExceptionFlagged: ExceptionFlagged,
        ThresholdUpdated: ThresholdUpdated,
        BusinessRegistered: BusinessRegistered,
    }

    #[constructor]
    fn constructor(ref self: ContractState, auditor: ContractAddress) {
        self.auditor.write(auditor);
        // Default: 7 days duplicate window
        self.duplicate_window.write(604800_u64);
    }

    #[abi(embed_v0)]
    impl AuditRegistryImpl of IAuditRegistry<ContractState> {
        /// Register a business address (auditor-only for demo simplicity).
        fn register_business(ref self: ContractState, addr: ContractAddress) {
            self._assert_auditor();
            self.businesses.write(addr, true);
            self.emit(BusinessRegistered { business: addr });
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
        ) {
            // Step 0: anti-replay
            assert(!self.result_exists.read(nullifier), 'ALREADY_SUBMITTED');

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
            let first_seen = self.dup_seen.read(dup_commit);
            let is_duplicate = first_seen != 0 && (now - first_seen) <= window;
            if !is_duplicate {
                self.dup_seen.write(dup_commit, now);
            }

            // pass = true only if proof verifies (currently deferred) AND not duplicate
            // For offchain_verified path, pass is set optimistically; indexer overrides.
            let pass = !is_duplicate; // [UPDATE] once verifier is wired

            // Step 4: store + emit
            let result = AuditResult {
                note_id,
                audit_commitment,
                dup_commit,
                pass,
                unverified_binding: false, // [UPDATE] set true if vector not confirmed by EOD Day 2
                offchain_verified,
                submitted_at: now,
                is_duplicate,
            };
            self.results.write(nullifier, result);
            self.result_exists.write(nullifier, true);
            self.emit(ProofSubmitted { nullifier, pass, is_duplicate, unverified_binding: false, offchain_verified });
        }

        /// Flag an exception for a nullifier (auditor-only, manual for sprint).
        fn flag_exception(ref self: ContractState, nullifier: felt252) {
            self._assert_auditor();
            self.emit(ExceptionFlagged { nullifier });
        }

        fn get_result(self: @ContractState, nullifier: felt252) -> AuditResult {
            assert(self.result_exists.read(nullifier), 'NOT_FOUND');
            self.results.read(nullifier)
        }

        fn is_registered(self: @ContractState, addr: ContractAddress) -> bool {
            self.businesses.read(addr)
        }

        fn get_threshold_commitment(self: @ContractState) -> felt252 {
            self.threshold_commitment.read()
        }

        fn get_threshold_version(self: @ContractState) -> u64 {
            self.threshold_version.read()
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
