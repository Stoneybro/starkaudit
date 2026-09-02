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

// Domain separator tags — MUST match starkware-libs/starknet-privacy/src/hashes.cairo
// Verified from https://raw.githubusercontent.com/starkware-libs/starknet-privacy/main/sdk/src/utils/hashes.ts
// and packages/privacy/src/hashes.cairo domain_separation module
export const TAGS = {
  NULLIFIER_TAG: BigInt("0x4e554c4c49464945525f5441473a5631"), // 'NULLIFIER_TAG:V1'
  ENC_AMOUNT_TAG: BigInt("0x454e435f414d4f554e545f5441473a5631"), // 'ENC_AMOUNT_TAG:V1'
  NOTE_ID_TAG: BigInt("0x4e4f54455f49445f5441473a5631"), // 'NOTE_ID_TAG:V1'
  // StarkAudit domain separators (distinct, not colliding)
  PRIVATE_AUDIT_TAG: BigInt("0x7374617263617564697431"), // "starkaudit1"
  DUP_TAG:           BigInt("0x7374617263617564697432"), // "starkaudit2"
  THRESHOLD_TAG:     BigInt("0x7374617263617564697433"), // "starkaudit3"
} as const
