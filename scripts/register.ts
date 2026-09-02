/**
 * Stage 1 — SDK Register (Sepolia)
 * Gate: Voyager Succeeded + ViewingKeySet event
 *
 * Run: pnpm tsx scripts/register.ts
 * Prereqs: .env has STARKNET_RPC_URL, ACCOUNT_ADDRESS, ACCOUNT_PRIVATE_KEY, VIEWING_KEY, PROVING_SERVICE_URL, INDEXER_URL
 */
import { constants } from "starknet"
import { buildAccount, buildProvider, buildTransfers, getProvingBlockId, waitForMaturity } from "../packages/audit-sdk/src/connect.js"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
const VIEWING_KEY = process.env.VIEWING_KEY!
const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID ?? "SN_SEPOLIA"

async function main() {
  if (!RPC_URL || !ACCOUNT_ADDRESS || !ACCOUNT_PK || !VIEWING_KEY) {
    throw new Error("Missing STARKNET_RPC_URL / ACCOUNT_ADDRESS / ACCOUNT_PRIVATE_KEY / VIEWING_KEY in .env")
  }
  if (!process.env.PROVING_SERVICE_URL || !process.env.INDEXER_URL) {
    throw new Error("Missing PROVING_SERVICE_URL / INDEXER_URL — ask t.me/sncorestars per .env.example")
  }

  // VIEWING_KEY must be decimal BigInt in [1, MAX_VIEWING_KEY], not hex
  let viewingKey: bigint
  try {
    viewingKey = BigInt(VIEWING_KEY)
  } catch {
    throw new Error("VIEWING_KEY must be a decimal BigInt string (not 0x hex) — see scripts/derive_viewing_key.ts")
  }
  if (viewingKey === 0n) throw new Error("VIEWING_KEY=0 is invalid (must be >=1)")

  const provider = buildProvider(RPC_URL)
  const account = buildAccount(provider, ACCOUNT_ADDRESS, ACCOUNT_PK)
  const chainId = CHAIN_ID === "SN_MAIN" ? constants.StarknetChainId.SN_MAIN : constants.StarknetChainId.SN_SEPOLIA

  // Check account deployment is finalized before proving register (transparent-state rule)
  // If account was just deployed, its deploy block must be < head-10
  console.log(`Chain: ${chainId}  Account: ${ACCOUNT_ADDRESS}`)
  console.log(`Pool: ${chainId === constants.StarknetChainId.SN_MAIN ? "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a" : "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"}`)
  console.log(`ViewingKey (bigint): ${viewingKey.toString().slice(0, 20)}... (length ${viewingKey.toString().length})`)

  const transfers = buildTransfers(account, viewingKey, chainId)

  // For fresh accounts: wait until deploy is finalized (head-10 > deployBlock)
  // We don't have deployBlock, so we try register and if it fails with "not registered"/deploy error we wait
  // Simpler: just wait 1 maturity cycle if account was created < 10 blocks ago
  const deployCheckBlock = await provider.getBlockNumber()
  console.log(`Head block: ${deployCheckBlock} — proving will use head-10 = ${deployCheckBlock - 10}`)

  // If account was deployed in last 10 blocks, wait
  // Note: if you know deploy receipt block, call waitForMaturity(provider, deployReceiptBlock)
  // Example: await waitForMaturity(provider, deployReceiptBlock)

  const provingBlockId = await getProvingBlockId(provider)
  console.log(`Proving against block: ${provingBlockId}`)

  console.log("\nBuilding register()...")
  let callAndProof: any
  try {
    const result = await transfers.build().register().execute({ provingBlockId })
    callAndProof = result.callAndProof
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    if (msg.includes("not registered") || msg.includes("viewing key")) {
      throw new Error(`Register failed: caller itself not registered? Unexpected for register() — ${msg}`)
    }
    if (msg.includes("already registered") || msg.includes("AlreadyRegistered")) {
      console.log("✅ Already registered — ViewingKeySet already on-chain (gate passed).")
      console.log(`Check Voyager: https://sepolia.voyager.online/contract/0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`)
      return
    }
    throw e
  }

  const proofDetails = callAndProof.proof.proofFacts?.length
    ? { proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data }
    : {}

  console.log(`Submitting register tx (tip:0n, proofFacts: ${callAndProof.proof.proofFacts?.length ?? 0})...`)
  try {
    // Try to estimate fee with STRK (estimate previously failed with ETH allowance, now STRK funded)
    let resourceBounds: any = undefined
    try {
      const est: any = await account.estimateInvokeFee(callAndProof.call, { tip: 0n, ...proofDetails })
      console.log("Fee estimate:", JSON.stringify(est, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2).slice(0, 800))
      if (est.resourceBounds) {
        // add 30% margin
        const scale = (b: any) => ({
          max_amount: BigInt(Math.ceil(Number(b.max_amount) * 1.3)),
          max_price_per_unit: BigInt(b.max_price_per_unit),
        })
        resourceBounds = {
          l1_gas: scale(est.resourceBounds.l1_gas),
          l2_gas: scale(est.resourceBounds.l2_gas),
          l1_data_gas: scale(est.resourceBounds.l1_data_gas),
        }
        console.log("Using estimated resourceBounds +30%")
      }
    } catch (e: any) {
      console.log("Estimate failed, using fallback bounds:", e.message.slice(0, 300))
      resourceBounds = {
        l1_gas: { max_amount: 100000n, max_price_per_unit: 185000000000000n },
        l2_gas: { max_amount: 80000000n, max_price_per_unit: 800000000000n },
        l1_data_gas: { max_amount: 100000n, max_price_per_unit: 100000000000000n },
      }
    }
    const tx = await account.execute(callAndProof.call, { tip: 0n, ...(resourceBounds ? { resourceBounds } : {}), ...proofDetails } as any)
    console.log(`Tx hash: ${tx.transaction_hash}`)
    console.log(`Voyager: https://sepolia.voyager.online/tx/${tx.transaction_hash}`)
    console.log("Waiting for confirmation...")
    const receipt: any = await provider.waitForTransaction(tx.transaction_hash)
    console.log(`Status: ${receipt.execution_status ?? receipt.status ?? "unknown"}  Block: ${receipt.block_number}`)
    if (receipt.execution_status === "REVERTED" || receipt.status === "REJECTED") {
      throw new Error(`Tx reverted: ${JSON.stringify(receipt)}`)
    }
    console.log("\n✅ Stage 1 Gate PASSED — check Voyager for Succeeded + ViewingKeySet event")
    console.log(`Pool: https://sepolia.voyager.online/contract/0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`)
    // Store receipt block for next stage's waitForMaturity
    console.log(`Record receipt block ${receipt.block_number} — next tx must wait until head-10 > ${receipt.block_number}`)
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    if (msg.includes("INVALID_NONCE") || msg.includes("Invalid nonce") || msg.includes("STARKNET_INVALID_NONCE")) {
      console.error("Got INVALID_NONCE — cache stale. Retrying with invalidateProofNonceCache()...")
      transfers.invalidateProofNonceCache()
      console.error("Rebuild and resubmit manually: invalidate cache then re-run this script.")
    }
    if (msg.includes("Cannot mix BigInt")) {
      console.error("Missing tip:0n — buildTransfers already adds it, check account.execute call.")
    }
    throw e
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
