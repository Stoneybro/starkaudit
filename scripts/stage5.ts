/**
 * Stage 5 — Pass/Fail/Duplicate end-to-end (Sepolia).
 * Three private transfers (0.5 pass, 1.5 fail, 0.5 duplicate) + submit_proof each.
 * Gate: Voyager ProofSubmitted pass:true / pass:false / pass:false+is_duplicate:true, no amount in event.
 *
 * Run: node --import tsx/esm --env-file=.env ./scripts/stage5.ts
 */
import { constants, hash } from "starknet"
import {
  buildAccount, buildProvider, buildTransfers, getProvingBlockId, waitForMaturity,
} from "../packages/audit-sdk/src/connect.js"
import {
  buildAuditCommitment, buildDupCommit, buildPublicInputs,
  deriveNullifier, deriveEncAmount, deriveNoteId,
} from "../packages/audit-sdk/src/build_witness.js"
import { TAGS } from "../packages/audit-sdk/src/types.js"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
const VIEWING_KEY = BigInt(process.env.VIEWING_KEY!)
const POOL_ADDRESS = process.env.POOL_ADDRESS! || "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
const REGISTRY = "0x1ce7138415c267093450c95241c0a02e1e5cd1b4db52452149fa05f36d6ead6"

const THRESHOLD = 1000000000000000000n // 1 STRK — must match on-chain threshold_commitment
const AUDITOR_SALT = 0xcafebabefn
const PERIOD = 20260903n
const PASS_AMOUNT = 500000000000000000n
const FAIL_AMOUNT = 1500000000000000000n

const toHex = (b: bigint) => `0x${b.toString(16)}`

async function discoverNotes(transfers: any) {
  const { notes } = await transfers.discoverNotes({ tokens: [BigInt(STRK)] })
  return notes.get(BigInt(STRK)) ?? []
}

function openingOf(note: any) {
  const channel_key = BigInt(note.witness.channelKey ?? note.witness.channel_key)
  const token = BigInt(STRK)
  const index = BigInt(note.witness.nonce ?? note.witness.index ?? 0)
  const salt = BigInt(note.witness.r ?? note.witness.salt ?? 0)
  const amount = BigInt(note.amount)
  return { channel_key, token, index, amount, salt, owner_private_key: VIEWING_KEY }
}

async function main() {
  const provider = buildProvider(RPC_URL)
  const account = buildAccount(provider, ACCOUNT_ADDRESS, ACCOUNT_PK)
  const chainId = constants.StarknetChainId.SN_SEPOLIA
  const counterparty = BigInt(hash.computePoseidonHashOnElements([BigInt(ACCOUNT_ADDRESS)]))
  console.log(`Payee=self ${ACCOUNT_ADDRESS} counterparty ${toHex(counterparty)} period ${PERIOD}`)

  // Fail fast: threshold inputs must reproduce the on-chain commitment
  const expectedTc = BigInt(hash.computePoseidonHashOnElements([TAGS.THRESHOLD_TAG, THRESHOLD, AUDITOR_SALT]))
  const onchainTc: any = await provider.callContract({ contractAddress: REGISTRY, entrypoint: "get_threshold_commitment", calldata: [] })
  if (BigInt(onchainTc[0]) !== expectedTc) throw new Error(`Threshold commitment mismatch onchain=${onchainTc[0]} expected=${toHex(expectedTc)}`)
  console.log(`Threshold commitment verified ${toHex(expectedTc)}`)

  const transfers = buildTransfers(account, VIEWING_KEY, chainId)
  const spentIds = new Set<string>()
  const pickNote = async (wantAmount?: bigint, excludeOriginals = false): Promise<any> => {
    const list: any[] = await discoverNotes(transfers)
    const avail = list.filter((n: any) => !spentIds.has(`0x${n.id.toString(16)}`))
    console.log(`Discovered ${list.length} notes, ${avail.length} unspent-by-us`)
    for (const n of avail) console.log(`  note id=0x${n.id.toString(16)} amount=${n.amount.toString()}`)
    const found = avail.find((n: any) => (wantAmount === undefined || BigInt(n.amount) === wantAmount))
    if (!found) throw new Error("No suitable note found")
    return found
  }

  const runLeg = async (label: string, inputNote: any, amount: bigint, passClaim: boolean, expectPass: boolean, expectDup: boolean) => {
    const opening = openingOf(inputNote)
    console.log(`\n=== ${label}: spend note 0x${inputNote.id.toString(16)} amount=${opening.amount} -> transfer ${amount} ===`)
    const provingBlockId = await getProvingBlockId(provider)
    const { callAndProof } = await transfers
      .build({ autoSetup: true })
      .surplusTo(account.address)
      .with(STRK, (t: any) => t.inputs(inputNote).transfer({ recipient: account.address, amount }))
      .execute({ provingBlockId })
    const proofDetails = callAndProof.proof.proofFacts?.length
      ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data } : {}
    let resourceBounds: any = undefined
    try {
      const est: any = await account.estimateInvokeFee(callAndProof.call, { tip: 0n, ...proofDetails })
      const scale = (b: any) => ({ max_amount: BigInt(Math.ceil(Number(b.max_amount) * 1.3)), max_price_per_unit: BigInt(b.max_price_per_unit) })
      resourceBounds = { l1_gas: scale(est.resourceBounds.l1_gas), l2_gas: scale(est.resourceBounds.l2_gas), l1_data_gas: scale(est.resourceBounds.l1_data_gas) }
    } catch (e: any) { console.log("Estimate failed, fallback:", e.message.slice(0, 200)) }
    const tx = await account.execute(callAndProof.call, { tip: 0n, ...(resourceBounds ? { resourceBounds } : {}), ...proofDetails } as any)
    console.log(`Transfer tx ${tx.transaction_hash} https://sepolia.voyager.online/tx/${tx.transaction_hash}`)
    const rcpt: any = await provider.waitForTransaction(tx.transaction_hash)
    if (rcpt.execution_status === "REVERTED") throw new Error(`Transfer reverted ${rcpt.revert_reason ?? ""}`)
    console.log(`Transfer ${rcpt.execution_status} block ${rcpt.block_number}`)
    spentIds.add(`0x${inputNote.id.toString(16)}`)

    // Nullifier: computed must equal on-chain (closes Stage 3 gap)
    const nullifier = deriveNullifier(opening)
    const note_id = deriveNoteId(opening)
    const enc_amount = deriveEncAmount(opening)
    console.log(`Computed nullifier ${toHex(nullifier)} note_id ${toHex(note_id)} enc ${toHex(enc_amount)}`)
    const exists: any = await provider.callContract({ contractAddress: POOL_ADDRESS, entrypoint: "nullifier_exists", calldata: [toHex(nullifier)] })
    if (exists[0] !== "0x1" && BigInt(exists[0]) !== 1n) throw new Error(`Nullifier NOT on-chain — math mismatch, aborting before submit`)
    console.log(`Nullifier verified on-chain`)

    // Witness + submit.
    // Binding derives from the SPENT note (nullifier/note_id/enc_amount above).
    // Commitments describe the AUDITED TRANSFER amount (not the consumed note's
    // full amount) so dup_commit is comparable across payments.
    const auditedNote = { ...opening, amount }
    const witness: any = { note: auditedNote, threshold: THRESHOLD, threshold_salt: AUDITOR_SALT, auditor_salt: AUDITOR_SALT, counterparty, period: PERIOD }
    const audit_commitment = buildAuditCommitment(witness)
    const dup_commit = buildDupCommit(witness)
    const public_inputs = buildPublicInputs(nullifier, note_id, enc_amount, expectedTc, audit_commitment, dup_commit)
    console.log(`audit_commitment ${toHex(audit_commitment)} dup_commit ${toHex(dup_commit)} pass_claim=${passClaim}`)
    const sub: any = await account.execute(
      { contractAddress: REGISTRY, entrypoint: "submit_proof", calldata: [toHex(nullifier), toHex(note_id), toHex(audit_commitment), toHex(dup_commit), toHex(enc_amount), "0", "0", passClaim ? "0x1" : "0x0"] },
      { tip: 0n },
    )
    console.log(`submit_proof tx ${sub.transaction_hash} https://sepolia.voyager.online/tx/${sub.transaction_hash}`)
    const subRcpt: any = await provider.waitForTransaction(sub.transaction_hash)
    if (subRcpt.execution_status === "REVERTED") throw new Error(`submit_proof reverted ${subRcpt.revert_reason ?? ""}`)

    // Verify stored result
    const res: any = await provider.callContract({ contractAddress: REGISTRY, entrypoint: "get_result", calldata: [toHex(nullifier)] })
    // AuditResult layout: business, note_id, audit_commitment, dup_commit, pass, unverified_binding, offchain_verified, submitted_at, is_duplicate
    const pass = BigInt(res[4]) === 1n, isDup = BigInt(res[8]) === 1n
    console.log(`Stored result pass=${pass} is_duplicate=${isDup} business=${res[0]}`)
    if (pass !== expectPass || isDup !== expectDup) throw new Error(`${label}: expected pass=${expectPass} dup=${expectDup}, got pass=${pass} dup=${isDup}`)
    console.log(`✅ ${label} PASSED — pass=${pass} is_duplicate=${isDup}`)
    await waitForMaturity(provider, subRcpt.block_number)
    return toHex(nullifier)
  }

  // Notes on hand (all mature): 0.5 / 1.5 / 1.5 / 0.5 — each leg spends one whole.
  // Leg 1 (pass): 0.5 transfer, fresh dup -> pass:true
  const noteA = await pickNote(PASS_AMOUNT)
  await runLeg("LEG1-PASS", noteA, PASS_AMOUNT, true, true, false)
  // Leg 2 (fail): 1.5 transfer, fresh dup, claim false -> pass:false
  const noteB = await pickNote(FAIL_AMOUNT)
  await runLeg("LEG2-FAIL", noteB, FAIL_AMOUNT, false, false, false)
  // Leg 3 (duplicate): 0.5 transfer, same payee+period as leg 1 -> same dup_commit
  const dupNote = await pickNote(PASS_AMOUNT)
  await runLeg("LEG3-DUP", dupNote, PASS_AMOUNT, true, false, true)

  console.log("\n✅✅ Stage 5 Gate PASSED — pass:true / pass:false / pass:false+is_duplicate:true")
}

main().catch(e => { console.error(e); process.exit(1) })
