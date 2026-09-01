/**
 * StarkAudit — seed_mainnet.ts
 * Stages 5 & 8: End-to-end demo flow.
 * Run on Sepolia first (Stage 5), then switch to SN_MAIN (Stage 8).
 *
 * Flow:
 *   1. Shield (approve + deposit) — see Stage 2 in build_order.md
 *   2. Three private transfers: compliant, over-threshold, duplicate
 *   3. Build audit witness for each
 *   4. Submit proofs to AuditRegistry
 *   5. Print tx hashes for strk20.json
 *
 * Run: pnpm tsx scripts/seed_mainnet.ts
 * Prereqs: Stage 1 (register) + Stage 3 (vector confirmed) + Stage 4 (registry deployed)
 */

import { Account, RpcProvider, Contract, hash } from "starknet"
import {
  buildAuditCommitment,
  buildDupCommit,
  buildThresholdCommitment,
  deriveNullifier,
  deriveEncAmount,
  deriveNoteId,
  checkMateriality,
} from "../packages/audit-sdk/src/build_witness.js"
import { submitProof } from "../packages/audit-sdk/src/submit.js"
import type { AuditWitness } from "../packages/audit-sdk/src/types.js"
import REGISTRY_ABI from "./abi/audit_registry_abi.json" assert { type: "json" }

// ── Config ─────────────────────────────────────────────────────────────────────
const RPC_URL           = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS   = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK        = process.env.ACCOUNT_PRIVATE_KEY!
const VIEWING_KEY       = BigInt(process.env.VIEWING_KEY!)
const POOL_ADDRESS      = process.env.POOL_ADDRESS!
const REGISTRY_ADDRESS  = process.env.AUDIT_REGISTRY_ADDRESS!
const PROVING_URL       = process.env.PROVING_SERVICE_URL!   // required for private transfers

// Demo audit parameters
const THRESHOLD         = 1_000_000_000_000_000_000n  // 1 STRK
const THRESHOLD_SALT    = 0xdeadbeefn                  // replace with random
const AUDITOR_SALT      = 0xcafebaben                  // replace with random
const PERIOD            = BigInt("20260901")            // YYYYMMDD

// ── Setup ──────────────────────────────────────────────────────────────────────
async function setup() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL })
  const account  = new Account({ provider, address: ACCOUNT_ADDRESS, signer: ACCOUNT_PK, cairoVersion: "1" })
  const registry = new Contract(REGISTRY_ABI, REGISTRY_ADDRESS, account)
  return { provider, account, registry }
}

// ── Submission tail (identical for every private tx) ──────────────────────────
async function submitTx(callAndProof: any, account: Account) {
  const proofDetails = callAndProof.proof.proofFacts?.length
    ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data }
    : {}
  const tx = await account.execute(callAndProof.call, { tip: 0n, ...proofDetails })
  return tx.transaction_hash
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const { provider, account, registry } = await setup()

  console.log("StarkAudit seed script — Stages 5 & 8")
  console.log("Pool:", POOL_ADDRESS)
  console.log("Registry:", REGISTRY_ADDRESS)

  // TODO Stage 5:
  // 1. Import createPrivateTransfers from @starkware-libs/starknet-privacy-sdk
  // 2. Shield STRK (2 x private transfers below + change)
  // 3. Execute three transfers and collect nullifiers from UseNote events
  // 4. Build witnesses and submit proofs

  // ── Demo witnesses (fill after Stage 3 vector confirmed) ──────────────────
  const baseNote = {
    channel_key:       0n,  // [FILL from discoverNotes()]
    token:             0n,  // [FILL]
    index:             0n,
    amount:            0n,
    salt:              0n,
    owner_private_key: VIEWING_KEY,
  }

  // Compliant payment: 0.5 STRK (below 1 STRK threshold)
  const compliantWitness: AuditWitness = {
    note: { ...baseNote, amount: 500_000_000_000_000_000n, index: 0n },
    threshold: THRESHOLD,
    threshold_salt: THRESHOLD_SALT,
    auditor_salt: AUDITOR_SALT,
    counterparty: BigInt(hash.computePoseidonHashOnElements([BigInt("0xRECIPIENT_1")])),
    period: PERIOD,
  }

  // Over-threshold payment: 1.5 STRK (above 1 STRK threshold)
  const overWitness: AuditWitness = {
    note: { ...baseNote, amount: 1_500_000_000_000_000_000n, index: 1n },
    threshold: THRESHOLD,
    threshold_salt: THRESHOLD_SALT,
    auditor_salt: AUDITOR_SALT,
    counterparty: BigInt(hash.computePoseidonHashOnElements([BigInt("0xRECIPIENT_2")])),
    period: PERIOD,
  }

  // Duplicate: same counterparty + amount + period as compliant → dup_commit collision
  const dupWitness: AuditWitness = {
    ...compliantWitness,
    note: { ...baseNote, amount: 500_000_000_000_000_000n, index: 2n },
  }

  for (const [label, witness] of [
    ["compliant", compliantWitness],
    ["over-threshold", overWitness],
    ["duplicate", dupWitness],
  ] as const) {
    const nullifier         = deriveNullifier(witness.note)
    const enc_amount        = deriveEncAmount(witness.note)
    const note_id           = deriveNoteId(witness.note)
    const audit_commitment  = buildAuditCommitment(witness)
    const dup_commit        = buildDupCommit(witness)
    const materiality_pass  = checkMateriality(witness.note.amount, witness.threshold)

    console.log(`\n[${label}] amount=${witness.note.amount} pass=${materiality_pass}`)
    console.log(`  nullifier: 0x${nullifier.toString(16)}`)
    console.log(`  dup_commit: 0x${dup_commit.toString(16)}`)

    const txHash = await submitProof(registry, {
      nullifier,
      note_id,
      audit_commitment,
      dup_commit,
      enc_amount,
      proof: [],         // empty until on-chain verifier deployed
      public_inputs: [],
    })
    console.log(`  Registry tx: ${txHash}`)
    console.log(`  Voyager: https://sepolia.voyager.online/tx/${txHash}`)
  }

  console.log("\nDone. Copy tx hashes above to strk20.json.")
}

main().catch(e => { console.error(e); process.exit(1) })
