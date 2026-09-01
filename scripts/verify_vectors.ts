/**
 * StarkAudit — verify_vectors.ts
 * Stage 3: Extract a real note from Sepolia, recompute nullifier/enc_amount/note_id
 * in TypeScript, and confirm they match what's on-chain.
 *
 * Run: pnpm tsx scripts/verify_vectors.ts
 * Prereqs: Stage 1 (register) + Stage 2 (deposit + private transfer) complete.
 *
 * Output: test-vectors/vector1.json with match: true/false
 */

import { RpcProvider, hash } from "starknet"
import { writeFileSync } from "fs"
import { resolve } from "path"

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL = process.env.STARKNET_RPC_URL!
const POOL_ADDRESS = process.env.POOL_ADDRESS!

// [VERIFY] Copy these exact values from:
// starkware-libs/starknet-privacy/packages/privacy/src/constants.cairo
// Do NOT guess — wrong tags = wrong derivations.
const NULLIFIER_TAG  = 0n  // [REPLACE]
const ENC_AMOUNT_TAG = 0n  // [REPLACE]
const NOTE_ID_TAG    = 0n  // [REPLACE]

// ── Helpers ───────────────────────────────────────────────────────────────────
const poseidon = (inputs: bigint[]): bigint =>
  BigInt(hash.computePoseidonHashOnElements(inputs))

function deriveNullifier(
  channel_key: bigint, token: bigint, index: bigint, owner_private_key: bigint
): bigint {
  return poseidon([NULLIFIER_TAG, channel_key, token, index, 0n, owner_private_key])
}

function deriveEncAmount(
  channel_key: bigint, token: bigint, index: bigint, salt: bigint, amount: bigint
): bigint {
  const mask = poseidon([ENC_AMOUNT_TAG, channel_key, token, index, 0n, salt])
  return mask + amount
}

function deriveNoteId(
  channel_key: bigint, token: bigint, index: bigint
): bigint {
  return poseidon([NOTE_ID_TAG, channel_key, token, index, 0n])
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!RPC_URL || !POOL_ADDRESS) {
    throw new Error("Missing STARKNET_RPC_URL or POOL_ADDRESS in environment")
  }

  const provider = new RpcProvider({ nodeUrl: RPC_URL })

  // TODO Stage 3: After SDK is installed and a private transfer has been made,
  // fill in the note internals below from discoverNotes() output.
  // DO NOT commit owner_private_key — keep it in .env only.
  const note = {
    channel_key:       0n, // [FILL from discoverNotes()]
    token:             0n, // [FILL]
    index:             0n, // [FILL]
    amount:            0n, // [FILL]
    salt:              0n, // [FILL] >=2 for encrypted notes
    owner_private_key: BigInt(process.env.VIEWING_KEY!), // from .env
  }

  // Onchain values from UseNote event + storage at note_id
  const onchain = {
    nullifier:  "0x", // [FILL from UseNote event after private transfer]
    enc_amount: "0x", // [FILL from pool storage at note_id]
  }

  // Compute locally
  const computed_nullifier  = deriveNullifier(note.channel_key, note.token, note.index, note.owner_private_key)
  const computed_enc_amount = deriveEncAmount(note.channel_key, note.token, note.index, note.salt, note.amount)
  const computed_note_id    = deriveNoteId(note.channel_key, note.token, note.index)

  const nullifier_match  = `0x${computed_nullifier.toString(16)}` === onchain.nullifier.toLowerCase()
  const enc_amount_match = `0x${computed_enc_amount.toString(16)}` === onchain.enc_amount.toLowerCase()
  const match = nullifier_match && enc_amount_match

  const vector = {
    _status: match ? "VERIFIED" : "MISMATCH — check NULLIFIER_TAG / ENC_AMOUNT_TAG / NOTE_ID_TAG",
    channel_key:        `0x${note.channel_key.toString(16)}`,
    token:              `0x${note.token.toString(16)}`,
    index:              note.index.toString(),
    salt:               `0x${note.salt.toString(16)}`,
    amount:             note.amount.toString(),
    owner_private_key:  "REDACTED_DO_NOT_COMMIT",
    computed_nullifier:  `0x${computed_nullifier.toString(16)}`,
    onchain_nullifier:   onchain.nullifier,
    computed_enc_amount: `0x${computed_enc_amount.toString(16)}`,
    onchain_enc_amount:  onchain.enc_amount,
    note_id:             `0x${computed_note_id.toString(16)}`,
    match,
    verified_at_block: await provider.getBlockNumber(),
  }

  const outPath = resolve("test-vectors/vector1.json")
  writeFileSync(outPath, JSON.stringify(vector, null, 2))
  console.log(match ? "✅ MATCH — tags confirmed" : "❌ MISMATCH — check tags from constants.cairo")
  console.log(`Written to ${outPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
