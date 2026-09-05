import type { RpcProvider } from "starknet"
import { REGISTRY_ADDRESS, REGISTRY_DEPLOY_BLOCK, SELECTORS, STRK_ADDRESS } from "./starknet"

// NOTE: this data layer only reads nullifiers, commitment hashes, business
// addresses and boolean flags. Amounts and counterparties are never fetched
// and never rendered.

export type ProofRecord = {
  nullifier: string
  business: string
  pass: boolean
  isDuplicate: boolean
  unverifiedBinding: boolean
  offchainVerified: boolean
  blockNumber: number
  txHash: string
}

export type ExceptionRecord = {
  nullifier: string
  blockNumber: number
  txHash: string
}

const feltBool = (v: string): boolean => {
  try {
    return BigInt(v) === 1n
  } catch {
    return v === "0x1"
  }
}

type RawEvent = {
  keys?: string[]
  data?: string[]
  block_number?: number
  transaction_hash?: string
}

type RawEventsPage = {
  events?: RawEvent[]
  continuation_token?: string
}

export async function fetchRegistryEvents(
  provider: RpcProvider,
): Promise<{ proofs: ProofRecord[]; exceptions: ExceptionRecord[] }> {
  const proofs: ProofRecord[] = []
  const exceptions: ExceptionRecord[] = []
  let continuationToken: string | undefined = undefined

  for (let page = 0; page < 20; page++) {
    const res = (await provider.getEvents({
      address: REGISTRY_ADDRESS,
      from_block: { block_number: REGISTRY_DEPLOY_BLOCK },
      to_block: "latest",
      chunk_size: 100,
      continuation_token: continuationToken,
    })) as unknown as RawEventsPage
    for (const e of res.events ?? []) {
      const keys: string[] = e.keys ?? []
      const data: string[] = e.data ?? []
      const blockNumber = Number(e.block_number ?? 0)
      const txHash = e.transaction_hash ?? ""
      if (keys[0] === SELECTORS.proofSubmitted && data.length === 5) {
        proofs.push({
          nullifier: keys[1],
          business: data[0],
          pass: feltBool(data[1]),
          isDuplicate: feltBool(data[2]),
          unverifiedBinding: feltBool(data[3]),
          offchainVerified: feltBool(data[4]),
          blockNumber,
          txHash,
        })
      } else if (keys[0] === SELECTORS.exceptionFlagged && keys.length >= 2) {
        exceptions.push({ nullifier: keys[1], blockNumber, txHash })
      } else if (data.length === 5 && keys.length >= 2) {
        // Shape fallback if a selector ever mismatches.
        proofs.push({
          nullifier: keys[1],
          business: data[0],
          pass: feltBool(data[1]),
          isDuplicate: feltBool(data[2]),
          unverifiedBinding: feltBool(data[3]),
          offchainVerified: feltBool(data[4]),
          blockNumber,
          txHash,
        })
      }
    }
    if (!res.continuation_token) break
    continuationToken = res.continuation_token
  }

  proofs.sort((a, b) => b.blockNumber - a.blockNumber)
  exceptions.sort((a, b) => b.blockNumber - a.blockNumber)
  return { proofs, exceptions }
}

export async function getThreshold(provider: RpcProvider): Promise<{ commitment: string; version: string }> {
  const [commitment, version] = (await Promise.all([
    provider.callContract({ contractAddress: REGISTRY_ADDRESS, entrypoint: "get_threshold_commitment", calldata: [] }),
    provider.callContract({ contractAddress: REGISTRY_ADDRESS, entrypoint: "get_threshold_version", calldata: [] }),
  ])) as unknown as [string[], string[]]
  return { commitment: commitment[0] ?? "0x0", version: BigInt(version[0] ?? 0).toString() }
}

export async function getDuplicateWindow(provider: RpcProvider): Promise<string | null> {
  try {
    const res = (await provider.callContract({
      contractAddress: REGISTRY_ADDRESS,
      entrypoint: "get_duplicate_window",
      calldata: [],
    })) as unknown as string[]
    return BigInt(res[0] ?? 0).toString()
  } catch {
    // Older on-chain deployment predates the get_duplicate_window view.
    return null
  }
}

export async function isRegistered(provider: RpcProvider, address: string): Promise<boolean> {
  const res = (await provider.callContract({
    contractAddress: REGISTRY_ADDRESS,
    entrypoint: "is_registered",
    calldata: [address],
  })) as unknown as string[]
  return feltBool(res[0])
}

export async function getAuditor(provider: RpcProvider, business: string): Promise<string> {
  const res = (await provider.callContract({
    contractAddress: REGISTRY_ADDRESS,
    entrypoint: "get_auditor",
    calldata: [business],
  })) as unknown as string[]
  return res[0] ?? "0x0"
}

export type DistributionKey = { low: string; high: string } | null

/** Business X25519 distribution pubkey, or null if unset / predeploy. */
export async function getDistributionKey(provider: RpcProvider, business: string): Promise<DistributionKey> {
  try {
    const res = (await provider.callContract({
      contractAddress: REGISTRY_ADDRESS,
      entrypoint: "get_distribution_key",
      calldata: [business],
    })) as unknown as string[]
    if (res.length < 2) return null
    return { low: res[0], high: res[1] }
  } catch {
    // Unset key (NO_DIST_KEY) or older on-chain deployment.
    return null
  }
}

/** Whether a sealed package exists for (business, version). */
export async function hasThresholdPackage(
  provider: RpcProvider,
  business: string,
  version: string,
): Promise<boolean> {
  try {
    const res = (await provider.callContract({
      contractAddress: REGISTRY_ADDRESS,
      entrypoint: "has_threshold_package",
      calldata: [business, version],
    })) as unknown as string[]
    return feltBool(res[0])
  } catch {
    return false
  }
}

/** All registered businesses from BusinessRegistered events (key = business). */
export async function fetchRegisteredBusinesses(provider: RpcProvider): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  let continuationToken: string | undefined = undefined
  for (let page = 0; page < 20; page++) {
    const res = (await provider.getEvents({
      address: REGISTRY_ADDRESS,
      from_block: { block_number: REGISTRY_DEPLOY_BLOCK },
      to_block: "latest",
      chunk_size: 100,
      continuation_token: continuationToken,
    })) as unknown as RawEventsPage
    for (const e of res.events ?? []) {
      const keys: string[] = e.keys ?? []
      if (keys[0] === SELECTORS.businessRegistered && keys[1]) {
        const addr = keys[1]
        const norm = addr.toLowerCase()
        if (!seen.has(norm)) {
          seen.add(norm)
          out.push(addr)
        }
      }
    }
    if (!res.continuation_token) break
    continuationToken = res.continuation_token
  }
  return out
}

export async function getStrkBalance(provider: RpcProvider, address: string): Promise<bigint> {
  const res = (await provider.callContract({
    contractAddress: STRK_ADDRESS,
    entrypoint: "balance_of",
    calldata: [address],
  })) as unknown as string[]
  // balance_of returns u256 = low + high*2^128
  return BigInt(res[0] ?? 0) + (BigInt(res[1] ?? 0) << 128n)
}

export function formatStrk(raw: bigint): string {
  const whole = raw / 10n ** 18n
  const frac = ((raw % 10n ** 18n) / 10n ** 15n).toString().padStart(3, "0")
  return `${whole.toString()}.${frac}`
}
