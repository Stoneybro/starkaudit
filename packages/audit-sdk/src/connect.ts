import { Account, RpcProvider, constants } from "starknet"
import { createPrivateTransfers } from "@starkware-libs/starknet-privacy-sdk"

const SEPOLIA_POOL = "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
const MAINNET_POOL = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a"

export function getPoolAddress(chainId: constants.StarknetChainId): string {
  return chainId === constants.StarknetChainId.SN_MAIN ? MAINNET_POOL : SEPOLIA_POOL
}

export function buildProvider(rpcUrl: string): RpcProvider {
  return new RpcProvider({ nodeUrl: rpcUrl })
}

export function buildAccount(
  provider: RpcProvider,
  address: string,
  privateKey: string
): Account {
  return new Account(
    { provider, address, signer: privateKey, cairoVersion: "1" }
  )
}

/**
 * Wait until head - lastBlock >= 10 (note maturity / sequencer acceptance rule).
 * Call after every private tx before proving the next one.
 */
export async function waitForMaturity(
  provider: RpcProvider,
  lastBlock: number,
  blockTimeMs = 5000
): Promise<void> {
  let latest = await provider.getBlockNumber()
  while (lastBlock >= latest - 10) {
    console.log(`Waiting for maturity... head=${latest} last=${lastBlock} need=${lastBlock + 10}`)
    await new Promise(r => setTimeout(r, blockTimeMs))
    latest = await provider.getBlockNumber()
  }
  console.log(`Mature at head=${latest}`)
}

/**
 * Standard submission tail — identical for every SDK operation.
 * Returns the provingBlockId to use (head - 10).
 */
export async function getProvingBlockId(provider: RpcProvider): Promise<number> {
  return (await provider.getBlockNumber()) - 10
}

export function buildTransfers(account: Account, viewingKey: bigint, chainId: constants.StarknetChainId) {
  const provingUrl = process.env.PROVING_SERVICE_URL
  const indexerUrl = process.env.INDEXER_URL
  if (!provingUrl) throw new Error("Missing PROVING_SERVICE_URL (Sepolia proving service) — see .env.example")
  if (!indexerUrl) throw new Error("Missing INDEXER_URL (discovery service) — see .env.example")
  if (viewingKey < 1n) throw new Error("VIEWING_KEY must be BigInt in [1, MAX_VIEWING_KEY] — got 0")
  return createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => viewingKey },
    provingProvider: { url: provingUrl, chainId },
    discoveryProvider: { url: indexerUrl },
    poolContractAddress: getPoolAddress(chainId),
  })
}

/**
 * Build transfers with explicit provider instances (when you need OHTTP/pinned keys).
 * Prefer buildTransfers() with plain config objects unless you need custom options.
 */
export { createPrivateTransfers }
