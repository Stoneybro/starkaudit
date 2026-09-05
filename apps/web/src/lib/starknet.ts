import { RpcProvider, constants, hash } from "starknet"

// Chain + contract wiring. Public values only — never put secrets in NEXT_PUBLIC_ vars.
export const CHAIN_ID =
  process.env.NEXT_PUBLIC_CHAIN_ID === "SN_MAIN"
    ? constants.StarknetChainId.SN_MAIN
    : constants.StarknetChainId.SN_SEPOLIA

export const IS_MAINNET = CHAIN_ID === constants.StarknetChainId.SN_MAIN

export const RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL ?? ""
export const POOL_ADDRESS = process.env.NEXT_PUBLIC_POOL_ADDRESS ?? ""
export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_AUDIT_REGISTRY ?? ""
export const REGISTRY_DEPLOY_BLOCK = Number(process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK ?? "14496137")

export const STRK_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

export function getProvider(): RpcProvider {
  if (!RPC_URL) throw new Error("Missing NEXT_PUBLIC_STARKNET_RPC_URL")
  return new RpcProvider({ nodeUrl: RPC_URL })
}

// Cairo event selectors (sn_keccak of the variant name).
export const SELECTORS = {
  proofSubmitted: hash.getSelectorFromName("ProofSubmitted"),
  exceptionFlagged: hash.getSelectorFromName("ExceptionFlagged"),
  businessRegistered: hash.getSelectorFromName("BusinessRegistered"),
  distributionKeySet: hash.getSelectorFromName("DistributionKeySet"),
  thresholdPackageShared: hash.getSelectorFromName("ThresholdPackageShared"),
} as const

export function shortHash(h: string): string {
  if (!h) return ""
  const hex = h.startsWith("0x") ? h : `0x${BigInt(h).toString(16)}`
  return hex.length > 14 ? `${hex.slice(0, 10)}\u2026${hex.slice(-4)}` : hex
}

export function sameAddress(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

export function voyagerTx(txHash: string): string {
  const base = IS_MAINNET ? "https://voyager.online/tx" : "https://sepolia.voyager.online/tx"
  return `${base}/${txHash}`
}
