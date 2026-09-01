// StarkAudit — Materiality Audit Circuit
// Proves: amount <= threshold, bound to the specific note's nullifier + enc_amount.
// Spec: proposedspec.md §3
//
// Public inputs:  nullifier, note_id, enc_amount, threshold_commitment,
//                 audit_commitment, dup_commit
// Private witness: channel_key, token, index, amount, salt, owner_private_key,
//                  threshold, threshold_salt, auditor_salt, counterparty, period
//
// Constraints:
//   1. audit_commitment == poseidon(PRIVATE_AUDIT_TAG, amount, salt, counterparty, period)
//   2. dup_commit       == poseidon(DUP_TAG, counterparty, amount, period)
//   3. threshold_commitment == poseidon(THRESHOLD_TAG, threshold, auditor_salt)
//   4. amount <= threshold  (u128 range check)
//   5. nullifier == poseidon(NULLIFIER_TAG, channel_key, token, index, 0, owner_private_key)
//      enc_amount == poseidon(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt) + amount
//      note_id    == poseidon(NOTE_ID_TAG, channel_key, token, index, 0)
//
// [VERIFY] Tags (NULLIFIER_TAG, ENC_AMOUNT_TAG, NOTE_ID_TAG) must match
// starkware-libs/starknet-privacy/packages/privacy/src/constants.cairo
// Run scripts/verify_vectors.ts and confirm match before enabling constraint 5.
// Until confirmed: set unverified_binding = true in AuditRegistry.

// TODO: Implement after Stage 3 test vector is confirmed.
// The circuit is a Cairo program — it will be proved by the Stwo prover.
// For now this file is a documentation stub.

fn main() {
    // placeholder — circuit implementation goes here after vector confirmation
}
