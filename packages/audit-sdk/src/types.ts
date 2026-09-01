// Shared types for StarkAudit
// These mirror the on-chain structs in audit_registry.cairo

export interface NoteOpening {
  channel_key: bigint
  token: bigint      // ContractAddress as bigint
  index: bigint
  amount: bigint     // u128
  salt: bigint       // >=2 for encrypted, =1 for open note
  owner_private_key: bigint // viewing key k
}

export interface AuditWitness {
  note: NoteOpening
  threshold: bigint
  threshold_salt: bigint
  auditor_salt: bigint
  counterparty: bigint  // poseidon(recipient_address) or invoice_id
  period: bigint        // e.g. 20260901n for YYYYMMDD
}

export interface ProofBundle {
  nullifier: bigint
  note_id: bigint
  audit_commitment: bigint
  dup_commit: bigint
  enc_amount: bigint
  proof: bigint[]       // Stwo proof bytes as felt252 array
  public_inputs: bigint[]
}

export interface AuditResult {
  nullifier: bigint
  pass: boolean
  is_duplicate: boolean
  unverified_binding: boolean
  offchain_verified: boolean
  submitted_at: number
}

// Domain separator tags — MUST match starkware-libs/starknet-privacy constants.cairo
// [VERIFY] These are placeholders — confirm from source before using in circuit
export const TAGS = {
  // TODO: replace with values from packages/privacy/src/constants.cairo
  NULLIFIER_TAG: 0n,          // [VERIFY]
  ENC_AMOUNT_TAG: 0n,         // [VERIFY]
  NOTE_ID_TAG: 0n,            // [VERIFY]
  // StarkAudit domain separators (choose distinct felts, not colliding with above)
  PRIVATE_AUDIT_TAG: BigInt("0x7374617263617564697431"), // "starkaudit1" as felt
  DUP_TAG:           BigInt("0x7374617263617564697432"), // "starkaudit2" as felt
  THRESHOLD_TAG:     BigInt("0x7374617263617564697433"), // "starkaudit3" as felt
} as const
