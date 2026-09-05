import { hash } from "starknet"
import type { AuditWitness } from "./types.js"
import { TAGS } from "./types.js"

// starknet v10: computePoseidonHashOnElements takes bigint[] and returns hex string.
// Wrap to return bigint so the rest of the codebase stays typed consistently.
const poseidonHashMany = (inputs: bigint[]): bigint =>
  BigInt(hash.computePoseidonHashOnElements(inputs))


/**
 * Build the audit commitment (blinded — includes salt so auditor can't brute-force).
 * audit_commitment = poseidon(PRIVATE_AUDIT_TAG, amount, salt, counterparty, period)
 */
export function buildAuditCommitment(witness: AuditWitness): bigint {
  return poseidonHashMany([
    TAGS.PRIVATE_AUDIT_TAG,
    witness.note.amount,
    witness.note.salt,
    witness.counterparty,
    witness.period,
  ])
}

/**
 * Build the duplicate-detection commitment (deterministic — NO salt by design).
 * dup_commit = poseidon(DUP_TAG, counterparty, amount, period)
 *
 * PRIVACY NOTE: auditor can dictionary-attack this with known counterparty/amount/period.
 * Accepted trade-off — auditor is the engaged party. See proposal.md §9.5.
 */
export function buildDupCommit(witness: AuditWitness): bigint {
  return poseidonHashMany([
    TAGS.DUP_TAG,
    witness.counterparty,
    witness.note.amount,
    witness.period,
  ])
}

/**
 * Build the threshold commitment (committed by auditor, delivered to the
 * business backend sealed on-chain via scripts/sync_package.ts — never manual).
 * threshold_commitment = poseidon(THRESHOLD_TAG, threshold, auditor_salt)
 */
export function buildThresholdCommitment(witness: AuditWitness): bigint {
  return poseidonHashMany([
    TAGS.THRESHOLD_TAG,
    witness.threshold,
    witness.auditor_salt,
  ])
}

/**
 * Derive nullifier from note internals.
 * nullifier = poseidon(NULLIFIER_TAG, channel_key, token, index, 0, owner_private_key)
 *
 * [VERIFY] Tag and field order must match starkware-libs/starknet-privacy constants.cairo
 * Run verify_vectors.ts to confirm before using in production.
 */
export function deriveNullifier(note: AuditWitness["note"]): bigint {
  return poseidonHashMany([
    TAGS.NULLIFIER_TAG,   // [VERIFY]
    note.channel_key,
    note.token,
    note.index,
    0n,
    note.owner_private_key,
  ])
}

/**
 * Derive enc_amount from note internals.
 * enc_amount = poseidon(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt) + amount
 * On-chain packed_value stores enc_amount in low 128 bits (salt in high 128), so mask to 128 for comparison.
 *
 * [VERIFY] Tag must match starkware-libs/starknet-privacy/src/hashes.cairo
 */
export function deriveEncAmount(note: AuditWitness["note"]): bigint {
  const mask = poseidonHashMany([
    TAGS.ENC_AMOUNT_TAG,  // verified 'ENC_AMOUNT_TAG:V1' 0x454e...
    note.channel_key,
    note.token,
    note.index,
    0n,
    note.salt,
  ])
  return (mask + note.amount) & ((1n << 128n) - 1n)
}

/**
 * Derive note_id.
 * note_id = poseidon(NOTE_ID_TAG, channel_key, token, index, 0)
 *
 * [VERIFY] Tag must match starkware-libs/starknet-privacy constants.cairo
 */
export function deriveNoteId(note: AuditWitness["note"]): bigint {
  return poseidonHashMany([
    TAGS.NOTE_ID_TAG,     // [VERIFY]
    note.channel_key,
    note.token,
    note.index,
    0n,
  ])
}

/**
 * Build the full proof bundle public inputs array.
 * Order must match circuit public inputs declaration in circuits/src/materiality.cairo.
 */
export function buildPublicInputs(
  nullifier: bigint,
  note_id: bigint,
  enc_amount: bigint,
  threshold_commitment: bigint,
  audit_commitment: bigint,
  dup_commit: bigint,
): bigint[] {
  return [nullifier, note_id, enc_amount, threshold_commitment, audit_commitment, dup_commit]
}

/**
 * Check if amount passes the threshold.
 * This mirrors what the circuit asserts — use for pre-flight check before proving.
 */
export function checkMateriality(amount: bigint, threshold: bigint): boolean {
  return amount <= threshold
}
