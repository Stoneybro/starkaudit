/**
 * Stage 6 — PayrollAnonymizer batch invoke (Sepolia).
 * Spends one 0.5 STRK private note: withdraws 0.5 to the helper + opens two
 * open notes (0.3 / 0.2, payee=self — single-account demo) + invokes the
 * helper, which splits, approves, and returns the credit instructions.
 * Gate: invoke Succeeded + pool CreateOpenNote events per payee (amounts public, salt=1).
 *
 * Run: node --import tsx/esm --env-file=.env ./scripts/payroll.ts
 */
import { constants } from "starknet"
import {
  buildAccount, buildProvider, buildTransfers, getProvingBlockId, waitForMaturity, Open,
} from "../packages/audit-sdk/src/connect.js"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
const VIEWING_KEY = BigInt(process.env.VIEWING_KEY!)
const POOL_ADDRESS = process.env.POOL_ADDRESS! || "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
// Env-first so a redeploy is picked up automatically; old address kept as fallback.
const PAYROLL = process.env.PAYROLL_ANONYMIZER_ADDRESS || "0x48a2b7e6566a915e34bea7a285212df5463a95a5900bd522575197191c25068"

const TOTAL = 500000000000000000n
const PAY1 = 300000000000000000n
const PAY2 = 200000000000000000n

// Alchemy Sepolia intermittently returns empty bodies (~25% flap observed).
// Retry all direct RPC calls; SDK-internal calls fail safe pre-tx (manual rerun).
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 8): Promise<T> {
  let last: any
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e: any) {
      last = e
      console.log(`Retry ${label} (${i + 1}/${attempts}): ${String(e?.message ?? e).slice(0, 100)}`)
      await new Promise(r => setTimeout(r, 4000 * (i + 1)))
    }
  }
  throw last
}

async function main() {
  const provider = buildProvider(RPC_URL)
  const account = buildAccount(provider, ACCOUNT_ADDRESS, ACCOUNT_PK)
  const chainId = constants.StarknetChainId.SN_SEPOLIA
  const transfers = buildTransfers(account, VIEWING_KEY, chainId)

  const { notes } = await transfers.discoverNotes({ tokens: [BigInt(STRK)] })
  const list: any[] = notes.get(BigInt(STRK)) ?? []
  console.log(`Discovered ${list.length} notes`)
  for (const n of list) console.log(`  id=0x${n.id.toString(16)} amount=${n.amount.toString()}`)
  const input = list.find((n: any) => BigInt(n.amount) === TOTAL)
  if (!input) throw new Error("No 0.5 STRK note available for payroll")
  console.log(`Funding note 0x${input.id.toString(16)}`)

  const provingBlockId = await withRetry("getProvingBlockId", () => getProvingBlockId(provider))
  const { callAndProof } = await transfers
    .build({ autoSetup: true })
    .with(STRK, (t: any) => t
      .inputs(input)
      .withdraw({ recipient: PAYROLL, amount: TOTAL })
      .transfer({ recipient: account.address, amount: Open })
      .transfer({ recipient: account.address, amount: Open }))
    .invoke(({ openNotes, poolAddress }: any) => {
      console.log(`openNotes: ${openNotes.map((o: any) => `0x${o.noteId.toString(16)}`).join(", ")} pool=${poolAddress}`)
      if (openNotes.length < 2) throw new Error(`Expected 2 open notes, got ${openNotes.length}`)
      return {
        contractAddress: PAYROLL,
        // Serialized Span<OpenNoteDeposit> x2: [len, note_id, token, amount, ...]
        calldata: [2n, openNotes[0].noteId, BigInt(STRK), PAY1, openNotes[1].noteId, BigInt(STRK), PAY2],
      }
    })
    .execute({ provingBlockId })

  const proofDetails = callAndProof.proof.proofFacts?.length
    ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data } : {}
  let resourceBounds: any = undefined
  try {
    const est: any = await account.estimateInvokeFee(callAndProof.call, { tip: 0n, ...proofDetails })
    const scale = (b: any) => ({ max_amount: BigInt(Math.ceil(Number(b.max_amount) * 1.3)), max_price_per_unit: BigInt(b.max_price_per_unit) })
    resourceBounds = { l1_gas: scale(est.resourceBounds.l1_gas), l2_gas: scale(est.resourceBounds.l2_gas), l1_data_gas: scale(est.resourceBounds.l1_data_gas) }
  } catch (e: any) { console.log("Estimate failed, fallback:", e.message.slice(0, 200)) }

  const tx = await withRetry("payroll execute", () =>
    account.execute(callAndProof.call, { tip: 0n, ...(resourceBounds ? { resourceBounds } : {}), ...proofDetails } as any))
  console.log(`Payroll tx ${tx.transaction_hash} https://sepolia.voyager.online/tx/${tx.transaction_hash}`)
  const rcpt: any = await withRetry("waitForTransaction", () => provider.waitForTransaction(tx.transaction_hash))
  if (rcpt.execution_status === "REVERTED") throw new Error(`Payroll reverted ${rcpt.revert_reason ?? ""}`)
  console.log(`Payroll ${rcpt.execution_status} block ${rcpt.block_number}`)

  // Verify: pool events must include both open-note credits with exact public amounts
  const events: any[] = rcpt.events ?? []
  const poolEvents = events.filter((e: any) => BigInt(e.from_address) === BigInt(POOL_ADDRESS))
  console.log(`Pool events: ${poolEvents.length}`)
  const seen = new Set<string>()
  for (const e of poolEvents) {
    const keys = (e.keys ?? []).map((k: string) => BigInt(k).toString())
    const data = (e.data ?? []).map((d: string) => BigInt(d).toString())
    console.log(`  keys=[${keys.join(",")}] data=[${data.join(",")}]`)
    for (const d of data) seen.add(d)
  }
  if (!seen.has(PAY1.toString()) || !seen.has(PAY2.toString())) {
    throw new Error("Open-note amounts 0.3/0.2 not found in pool events")
  }

  // Helper must be empty after the pool pulled its approve
  const bal: any = await withRetry("helper balance", () =>
    provider.callContract({ contractAddress: STRK, entrypoint: "balance_of", calldata: [PAYROLL] }))
  const helperBal = BigInt(bal.balance ?? bal[0] ?? 0)
  console.log(`Helper STRK balance after pull: ${helperBal}`)
  if (helperBal !== 0n) throw new Error(`Helper retained ${helperBal} — approve/pull mismatch`)

  console.log("✅ Stage 6 Gate PASSED — invoke Succeeded, 2 open notes credited, helper empty")
  await waitForMaturity(provider, rcpt.block_number)
}

main().catch(e => { console.error(e); process.exit(1) })
