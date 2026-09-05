import type { RpcProvider } from "starknet"
import { hash } from "starknet"
import { POOL_ADDRESS, STRK_ADDRESS } from "./starknet"

// ---------------------------------------------------------------------------
// STRK20 payment helpers shared by PaymentsPanel and ActivityPanel.
// Amounts the user types are kept in localStorage only — they are never
// fetched from chain and never leave this device.
// ---------------------------------------------------------------------------

export function parseStrkToWei(input: string): bigint | null {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) return null
  const [whole, frac = ""] = trimmed.split(".")
  if (whole.length > 39) return null // felt252 range guard
  const fracPadded = frac.padEnd(18, "0").slice(0, 18)
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0")
}

export function isValidStarknetAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{1,63}$/.test(v.trim())
}

export type PaymentKind = "shield" | "transfer"
export type PaymentStatus = "confirming" | "confirmed" | "failed"

export type PaymentEntry = {
  id: string
  kind: PaymentKind
  amount: string // human-readable STRK, exactly as typed by the user
  recipient?: string
  txHash: string
  createdAt: number
  status: PaymentStatus
}

const storageKey = (address: string) => `starkaudit:payments:${address.toLowerCase()}`

export function loadPayments(address: string): PaymentEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(address))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PaymentEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePayments(address: string, entries: PaymentEntry[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(address), JSON.stringify(entries))
  } catch {
    // storage disabled — history is best-effort
  }
}

/**
 * Poll a transaction to finality. Returns the final status, or "confirming"
 * if the deadline passes (the entry stays pending in the Activity table).
 */
export async function pollTxStatus(
  provider: RpcProvider,
  txHash: string,
  timeoutMs = 3 * 60 * 1000,
): Promise<PaymentStatus> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    try {
      const res = (await provider.getTransactionStatus(txHash)) as unknown as {
        finality_status?: string
        execution_status?: string
      }
      // Some RPCs report confirmation via finality_status only
      // (ACCEPTED_ON_L2 / ACCEPTED_ON_L1), others via execution_status
      // (SUCCEEDED). Accept either so the poll resolves promptly.
      const fin = res.finality_status
      const exec = res.execution_status
      if (exec === "REVERTED" || fin === "REJECTED") return "failed"
      if (
        exec === "SUCCEEDED" ||
        fin === "ACCEPTED_ON_L2" ||
        fin === "ACCEPTED_ON_L1"
      ) {
        return "confirmed"
      }
    } catch {
      // transient RPC error — keep polling until the deadline
    }
  }
  return "confirming"
}

// Re-exported for convenience so panels share one source of truth.
export { STRK_ADDRESS }

/** Selector for the pool's `Deposit` event (verified against Sepolia pool). */
export const DEPOSIT_SELECTOR = hash.getSelectorFromName("Deposit")

export type PoolDeposit = {
  depositor: string
  token: string
  amountRaw: bigint
  txHash: string
  blockNumber: number
}

type RawPoolEvent = {
  keys?: string[]
  data?: string[]
  block_number?: number
  transaction_hash?: string
}

type RawPoolEventsPage = {
  events?: RawPoolEvent[]
  continuation_token?: string
}

const padFelt = (v: string): string => {
  const hex = v.startsWith("0x") ? v.slice(2) : BigInt(v).toString(16)
  return `0x${hex.padStart(64, "0")}`
}

const sameFelt = (a: string, b: string): boolean => {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

/**
 * Read shield deposits from the privacy pool contract. Per the STRK20 docs,
 * deposits stay public on-chain (depositor + token + amount), so this is the
 * source of truth for shielding history — localStorage entries only exist
 * when the wallet promise resolved with a hash (wallet timeouts, cleared
 * storage, or another device leave no local trace).
 *
 * Verified live shape: keys = [Deposit_selector, depositor, token],
 * data = [amount_wei]. Only STRK deposits are returned.
 *
 * Pagination walks forward from `fromBlock`, so the scan is anchored at
 * head - WINDOW (node pages are chain segments, mostly empty — a genesis
 * scan never reaches recent deposits within a sane page budget).
 */
export async function fetchShieldDeposits(
  provider: RpcProvider,
  userAddress: string,
  maxPages = 60,
): Promise<PoolDeposit[]> {
  const out: PoolDeposit[] = []
  const raw = userAddress.trim()
  let padded = raw
  try {
    padded = padFelt(raw)
  } catch {
    // keep raw — client-side BigInt filtering below is the real gate
  }
  const head = await provider.getBlockNumber()
  const fromBlock = Math.max(0, head - 1_000_000)
  let continuationToken: string | undefined = undefined
  for (let page = 0; page < maxPages; page++) {
    const res = (await provider.getEvents({
      address: POOL_ADDRESS,
      from_block: { block_number: fromBlock },
      to_block: "latest",
      keys: [[DEPOSIT_SELECTOR], [raw, padded]],
      chunk_size: 1000,
      continuation_token: continuationToken,
    })) as unknown as RawPoolEventsPage
    for (const e of res.events ?? []) {
      const keys = e.keys ?? []
      const data = e.data ?? []
      if (keys.length < 3 || data.length < 1) continue
      if (!sameFelt(keys[0], DEPOSIT_SELECTOR)) continue
      if (!sameFelt(keys[1], raw)) continue
      if (!sameFelt(keys[2], STRK_ADDRESS)) continue
      let amount = 0n
      try {
        amount = BigInt(data[0])
      } catch {
        continue
      }
      out.push({
        depositor: keys[1],
        token: keys[2],
        amountRaw: amount,
        txHash: e.transaction_hash ?? "",
        blockNumber: Number(e.block_number ?? 0),
      })
    }
    if (!res.continuation_token) break
    continuationToken = res.continuation_token
  }
  out.sort((a, b) => b.blockNumber - a.blockNumber)
  return out
}