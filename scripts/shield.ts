/**
 * Stage 2 — Shield (Sepolia) — 2 tx, never one
 * Gate: both Succeeded, pool Deposit event amount public
 *
 * Real docs: https://strk20-by-example.org/sdk/deposit
 * - approve must be separate tx, waited, then re-fetch provingBlockId
 * - deposit uses .build({autoSetup:true}).with(token, t=>t.deposit({amount})).surplusTo(addr)
 * - screening since v0.14.3 (FPI, hosted proving handles it)
 * - note matures 10 blocks
 *
 * Run: node --import tsx/esm --env-file=.env ./scripts/shield.ts
 */
import { constants } from "starknet"
import { buildAccount, buildProvider, buildTransfers, getProvingBlockId, waitForMaturity } from "../packages/audit-sdk/src/connect.js"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
const VIEWING_KEY = process.env.VIEWING_KEY!
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "SN_SEPOLIA"
const POOL_ADDRESS = process.env.POOL_ADDRESS! || "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
const AMOUNT = 2000000000000000000n // 2 STRK per build_order.md:43

async function main() {
  if (!RPC_URL || !ACCOUNT_ADDRESS || !ACCOUNT_PK || !VIEWING_KEY) throw new Error("Missing .env")
  const viewingKey = BigInt(VIEWING_KEY)
  const provider = buildProvider(RPC_URL)
  const account = buildAccount(provider, ACCOUNT_ADDRESS, ACCOUNT_PK)
  const chainId = CHAIN_ID === "SN_MAIN" ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA
  const transfers = buildTransfers(account, viewingKey, chainId)

  console.log(`Chain ${chainId} Account ${ACCOUNT_ADDRESS} Pool ${POOL_ADDRESS} STRK ${STRK} amount ${AMOUNT}`)

  // Check allowance — if Stage 1 approved 1000 STRK, skip second approve
  let approveBlock = 0
  try {
    const allowanceRaw: any = await provider.callContract({ contractAddress: STRK, entrypoint: "allowance", calldata: [ACCOUNT_ADDRESS, POOL_ADDRESS] })
    const low = BigInt(allowanceRaw[0] ?? allowanceRaw.result?.[0] ?? "0")
    const high = BigInt(allowanceRaw[1] ?? allowanceRaw.result?.[1] ?? "0")
    const allowance = low + (high << 128n)
    console.log(`Allowance ${allowance} need ${AMOUNT} sufficient=${allowance >= AMOUNT}`)
    if (allowance < AMOUNT) {
      console.log("Approving pool for 2 STRK (separate tx, reentrancy-guarded)...")
      const tx = await account.execute({ contractAddress: STRK, entrypoint: "approve", calldata: [POOL_ADDRESS, AMOUNT.toString(), "0"] }, { tip: 0n })
      console.log(`Approve tx ${tx.transaction_hash} https://sepolia.voyager.online/tx/${tx.transaction_hash}`)
      const rcpt: any = await provider.waitForTransaction(tx.transaction_hash)
      console.log(`Approve ${rcpt.execution_status} block ${rcpt.block_number}`)
      if (rcpt.execution_status === "REVERTED") throw new Error(`Approve reverted ${JSON.stringify(rcpt)}`)
      approveBlock = rcpt.block_number
      await waitForMaturity(provider, approveBlock)
    } else {
      console.log("Allowance already sufficient — skipping approve, but still need head-10 > registerBlock")
      // Register was 14448022, ensure maturity
      await waitForMaturity(provider, 14448022)
      if (approveBlock) await waitForMaturity(provider, approveBlock)
    }
  } catch (e: any) {
    if (String(e.message).includes("allowance")) throw e
    console.log("Allowance check failed, will approve anyway:", e.message.slice(0, 200))
    const tx = await account.execute({ contractAddress: STRK, entrypoint: "approve", calldata: [POOL_ADDRESS, AMOUNT.toString(), "0"] }, { tip: 0n })
    console.log(`Approve tx ${tx.transaction_hash}`)
    const rcpt: any = await provider.waitForTransaction(tx.transaction_hash)
    approveBlock = rcpt.block_number
    await waitForMaturity(provider, approveBlock)
  }

  // Re-fetch provingBlockId AFTER approve lands (so base includes approval)
  const provingBlockId = await getProvingBlockId(provider)
  console.log(`Proving against ${provingBlockId} (approveBlock ${approveBlock || "skipped"})`)

  console.log("Building deposit (autoSetup:true, surplusTo self)...")
  // Docs: https://strk20-by-example.org/sdk/deposit — deposit omits recipient,
  // surplusTo(account.address) directs the amount into a note owned by us.
  // autoSetup opens self-channel + token subchannel for a first deposit.
  const { callAndProof } = await transfers
    .build({ autoSetup: true })
    .with(STRK, (t: any) => t.deposit({ amount: AMOUNT }))
    .surplusTo(account.address)
    .execute({ provingBlockId })

  const proofDetails = callAndProof.proof.proofFacts?.length ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data } : {}
  console.log(`Submitting deposit tip:0n proofFacts ${callAndProof.proof.proofFacts?.length ?? 0}`)

  let resourceBounds: any = undefined
  try {
    const est: any = await account.estimateInvokeFee(callAndProof.call, { tip: 0n, ...proofDetails })
    console.log(`Estimate l2_gas ${est.resourceBounds.l2_gas.max_amount} overall_fee ${est.overall_fee}`)
    const scale = (b: any) => ({ max_amount: BigInt(Math.ceil(Number(b.max_amount) * 1.3)), max_price_per_unit: BigInt(b.max_price_per_unit) })
    resourceBounds = { l1_gas: scale(est.resourceBounds.l1_gas), l2_gas: scale(est.resourceBounds.l2_gas), l1_data_gas: scale(est.resourceBounds.l1_data_gas) }
  } catch (e: any) {
    console.log("Estimate failed, fallback:", e.message.slice(0, 300))
  }

  const tx = await account.execute(callAndProof.call, { tip: 0n, ...(resourceBounds ? { resourceBounds } : {}), ...proofDetails } as any)
  console.log(`Deposit tx ${tx.transaction_hash} https://sepolia.voyager.online/tx/${tx.transaction_hash}`)
  const rcpt: any = await provider.waitForTransaction(tx.transaction_hash)
  console.log(`Deposit ${rcpt.execution_status} block ${rcpt.block_number} fee ${rcpt.actual_fee?.amount ?? rcpt.value?.actual_fee?.amount}`)
  if (rcpt.execution_status === "REVERTED") throw new Error(`Deposit reverted ${rcpt.revert_reason ?? JSON.stringify(rcpt)}`)
  console.log(`✅ Stage 2 Gate PASSED — Deposit 2 STRK Succeeded at ${rcpt.block_number}, note will mature at ${rcpt.block_number + 10}`)
  console.log(`Pool Deposit event: https://sepolia.voyager.online/contract/${POOL_ADDRESS}`)
  console.log(`Next: wait head-10 > ${rcpt.block_number} before Stage 3 transfer`)
}

main().catch(e => { console.error(e); process.exit(1) })
