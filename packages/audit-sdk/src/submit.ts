import type { Contract } from "starknet"
import type { ProofBundle } from "./types.js"

/**
 * Submit an audit proof to the AuditRegistry contract.
 * Maps to submit_proof(nullifier, note_id, audit_commitment, dup_commit, enc_amount, proof, public_inputs, pass_claim).
 *
 * If the on-chain verifier is not deployed (offchain_verified path),
 * proof and public_inputs can be empty arrays — the registry stores them for indexer verification.
 */
export async function submitProof(
  registry: Contract,
  bundle: ProofBundle,
): Promise<string> {
  const { nullifier, note_id, audit_commitment, dup_commit, enc_amount, proof, public_inputs, pass_claim } = bundle

  const tx = await registry.submit_proof(
    nullifier,
    note_id,
    audit_commitment,
    dup_commit,
    enc_amount,
    proof,       // empty [] if offchain_verified path
    public_inputs,
    pass_claim,
  )

  return tx.transaction_hash
}

/**
 * Flag an exception for a nullifier (auditor-only).
 * Used when a nullifier is known (via business declaration or channel-open timing)
 * but no proof was submitted within the window.
 */
export async function flagException(
  registry: Contract,
  nullifier: bigint,
): Promise<string> {
  const tx = await registry.flag_exception(nullifier)
  return tx.transaction_hash
}
