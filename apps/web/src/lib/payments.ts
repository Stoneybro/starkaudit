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
  // 64 hex chars: wallets return zero-padded addresses (felt252 < 2^251, but
  // padded form is standard display). Matches AUDITOR_SCHEMA / FELT_RE.
  return /^0x[0-9a-fA-F]{1,64}$/.test(v.trim())
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
const EXTRA_ADDRESSES_KEY = "starkaudit:extraAddresses"

/**
 * Extra addresses the user controls under the same private key (a relayer or
 * backend account, a second account contract from their wallet, …). The
 * Activity chain scan runs them alongside the connected wallet address so
 * payments sent from ANY owned account appear in the table — one key can own
 * several account contracts on Starknet.
 */
export function loadExtraAddresses(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(EXTRA_ADDRESSES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed
          .filter((a): a is string => typeof a === "string" && isValidStarknetAddress(a))
          .map((a) => a.toLowerCase())
      : []
  } catch {
    return []
  }
}

export function saveExtraAddresses(list: string[]): void {
  if (typeof window === "undefined") return
  try {
    const seen = new Set<string>()
    const clean = list.filter((a) => {
      const t = a.trim().toLowerCase()
      if (!isValidStarknetAddress(t) || seen.has(t)) return false
      seen.add(t)
      return true
    })
    window.localStorage.setItem(EXTRA_ADDRESSES_KEY, JSON.stringify(clean))
  } catch {
    // storage disabled — best effort
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

/** Selector for STRK `Transfer` events. */
export const STRK_TRANSFER_SELECTOR = hash.getSelectorFromName("Transfer")

/**
 * Selector for the pool's documented `privacy::events::Deposit` struct
 * (verified against the deployed pool ABI: keys = [selector, user_addr,
 * token], data = [amount u128]). Per the STRK20 docs, per-user
 * activity is attributed from this event, never from the tx sender
 * (private txs are relayer-submitted).
 */
export const POOL_DEPOSIT_SELECTOR = hash.getSelectorFromName("Deposit")

const STRK_FELT = BigInt(STRK_ADDRESS)
const TRANSFER_FELT = BigInt(hash.getSelectorFromName("transfer"))

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
 * Read any owned address's on-chain activity — the source of truth for
 * shielding history. Local entries only exist when the wallet promise resolved
 * with a hash (wallet timeouts, cleared storage, or another device leave no
 * local trace), so the chain scan is what makes Activity complete.
 *
 * Verified live shape against Sepolia shield 0x026e96d73f8e388da4abea6605:
 * the wallet moves public STRK user → intermediate → pool, emitting plain
 * STRK `Transfer` events; the pool's own events are encrypted and carry no
 * public depositor, so the pool contract is the WRONG place to scan (an
 * earlier revision looked for a `Deposit` event there that this pool never
 * emits — that scan always returned empty). Detection per candidate tx:
 *   1. STRK `Transfer` with `from == <owned address>` (any `to`) — cheap
 *      indexed query. Every account tx appears here at minimum via its fee
 *      leg. One private key can control several account contracts, so this
 *      runs for the connected wallet AND every extra address passed in
 *      `extraAddresses`.
 *   2. The tx calldata contains the pool address, else it is unrelated
 *      (plain STRK sends, registry txs, …) and skipped.
 *   3. A contiguous [STRK, transfer-selector, 3, to, amount_lo, amount_hi]
 *      call marks a SHIELD with the exact amount (u256 lo/hi). Anything else
 *      touching the pool is a private pool interaction — in this app that is
 *      a transfer; amounts/recipients are encrypted so only the tx itself is
 *      reported (as a "Private" row, never fabricated).
 *   4. Execution status is checked per tx: reverted attempts are reported as
 *      failed, never as confirmed (fee legs exist even on reverted txs).
 *
 * Pagination walks forward from `fromBlock`, so the scan is anchored at
 * head - WINDOW (node pages are chain segments, mostly empty — a genesis
 * scan never reaches recent deposits within a sane page budget).
 */
export type ChainPrivateTx = {
  txHash: string
  blockNumber: number
  status: PaymentStatus
}

// Transaction calldata is immutable — cache the classification so repeat
// scans only pay for the event query plus previously unseen txs.
type TxClass = { kind: "shield"; amount: bigint } | { kind: "private" } | { kind: "unrelated" }
const txClassCache = new Map<string, TxClass>()

// Final statuses are final — cache them so repeat scans stay cheap.
// "confirming" is never cached: it is re-read on every scan.
const txStatusCache = new Map<string, PaymentStatus>()

export async function fetchTxStatus(provider: RpcProvider, txHash: string): Promise<PaymentStatus> {
  const key = txHash.toLowerCase()
  const cached = txStatusCache.get(key)
  if (cached === "confirmed" || cached === "failed") return cached
  try {
    const res = (await provider.getTransactionStatus(txHash)) as unknown as {
      finality_status?: string
      execution_status?: string
    }
    if (res.execution_status === "REVERTED" || res.finality_status === "REJECTED") {
      txStatusCache.set(key, "failed")
      return "failed"
    }
    if (
      res.execution_status === "SUCCEEDED" ||
      res.finality_status === "ACCEPTED_ON_L2" ||
      res.finality_status === "ACCEPTED_ON_L1"
    ) {
      txStatusCache.set(key, "confirmed")
      return "confirmed"
    }
  } catch {
    // transient RPC error — report confirming; the next scan retries.
  }
  return "confirming"
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

/** Connected wallet + extra owned accounts, deduped, preserving first casing. */
function dedupeOwned(addresses: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of addresses) {
    const t = a.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** Zero-pad a felt hex string; keep raw on failure — BigInt filtering is the real gate. */
function padOrKeep(raw: string): string {
  try {
    return padFelt(raw)
  } catch {
    return raw
  }
}

export async function fetchChainActivity(
  provider: RpcProvider,
  userAddress: string,
  extraAddresses: string[] = [],
  maxPages = 60,
): Promise<{ shields: PoolDeposit[]; privateTxs: ChainPrivateTx[] }> {
  const shields: PoolDeposit[] = []
  const privateTxs: ChainPrivateTx[] = []
  // One private key can control several account contracts (relayer, second
  // wallet account, …). The scan runs over the connected wallet plus every
  // extra address so payments sent from ANY owned account appear.
  const owned = dedupeOwned([userAddress, ...extraAddresses])
  const head = await provider.getBlockNumber()
  const fromBlock = Math.max(0, head - 1_000_000)
  // Source A — documented Deposit events naming a depositor (direct/SDK
  // deposits). Keyed by tx hash so source B below can only add txs not
  // already covered, never duplicate them.
  const depositByTx = new Map<string, { txHash: string; blockNumber: number; amount: bigint; owner: string }>()
  for (const raw of owned) {
    const padded = padOrKeep(raw)
    let continuationToken: string | undefined = undefined
    for (let page = 0; page < maxPages; page++) {
      const res = (await provider.getEvents({
        address: POOL_ADDRESS,
        from_block: { block_number: fromBlock },
        to_block: "latest",
        // `keys` is one filter group per event-key slot (AND across slots, OR
        // within a slot). key[1] is the depositor — both spellings live in the
        // SAME group; as separate groups they would filter key[2] instead and
        // match nothing.
        keys: [[POOL_DEPOSIT_SELECTOR], [raw, padded]],
        chunk_size: 1000,
        continuation_token: continuationToken,
      })) as unknown as RawPoolEventsPage
      for (const e of res.events ?? []) {
        const keys = e.keys ?? []
        const data = e.data ?? []
        if (keys.length < 3 || data.length < 1) continue
        if (!sameFelt(keys[0], POOL_DEPOSIT_SELECTOR)) continue
        if (!sameFelt(keys[1], raw)) continue
        if (!sameFelt(keys[2], STRK_ADDRESS)) continue
        let amount = 0n
        try {
          amount = BigInt(data[0])
        } catch {
          continue
        }
        if (amount <= 0n) continue
        const txHash = e.transaction_hash ?? ""
        if (!txHash) continue
        const key = txHash.toLowerCase()
        const prev = depositByTx.get(key)
        if (!prev || amount > prev.amount) {
          depositByTx.set(key, { txHash, blockNumber: Number(e.block_number ?? 0), amount, owner: raw })
        }
      }
      if (!res.continuation_token) break
      continuationToken = res.continuation_token
    }
  }
  // Source B — wallet-flow footprint (source A misses Ready shields). All txs
  // that moved any owned address's public STRK (deposit legs + fee legs).
  const candidateTx = new Map<string, { txHash: string; blockNumber: number; owner: string }>()
  for (const raw of owned) {
    const padded = padOrKeep(raw)
    let continuationToken: string | undefined = undefined
    for (let page = 0; page < maxPages; page++) {
      const res = (await provider.getEvents({
        address: STRK_ADDRESS,
        from_block: { block_number: fromBlock },
        to_block: "latest",
        // Same slot-group rule as source A: key[1] is the sender.
        keys: [[STRK_TRANSFER_SELECTOR], [raw, padded]],
        chunk_size: 1000,
        continuation_token: continuationToken,
      })) as unknown as RawPoolEventsPage
      for (const e of res.events ?? []) {
        const keys = e.keys ?? []
        if (keys.length < 2) continue
        if (!sameFelt(keys[0], STRK_TRANSFER_SELECTOR)) continue
        if (!sameFelt(keys[1], raw)) continue
        const txHash = e.transaction_hash ?? ""
        if (!txHash) continue
        const key = txHash.toLowerCase()
        if (!candidateTx.has(key)) {
          candidateTx.set(key, { txHash, blockNumber: Number(e.block_number ?? 0), owner: raw })
        }
      }
      if (!res.continuation_token) break
      continuationToken = res.continuation_token
    }
  }
  const felt = (c: string): bigint | null => {
    try {
      return BigInt(c)
    } catch {
      return null
    }
  }
  let poolFelt: bigint | null = null
  try {
    poolFelt = BigInt(POOL_ADDRESS)
  } catch {
    poolFelt = null
  }
  const classified = await mapLimit([...candidateTx.values()], 10, async ({ txHash, blockNumber, owner }) => {
    const cacheKey = txHash.toLowerCase()
    // Covered by the documented Deposit event (source A) — no calldata fetch.
    if (depositByTx.has(cacheKey)) return null
    const hit = txClassCache.get(cacheKey)
    if (hit) {
      if (hit.kind === "unrelated") return null
      if (hit.kind === "shield") return { kind: "shield" as const, txHash, blockNumber, amount: hit.amount, owner }
      return { kind: "private" as const, txHash, blockNumber, owner }
    }
    let calldata: string[] = []
    try {
      const tx = (await provider.getTransactionByHash(txHash)) as unknown as { calldata?: string[] }
      calldata = tx.calldata ?? []
    } catch {
      return null
    }
    const felts = calldata.map(felt)
    const touchesPool = poolFelt !== null && felts.some((f) => f !== null && f === poolFelt)
    if (!touchesPool) {
      txClassCache.set(cacheKey, { kind: "unrelated" })
      return null
    }
    // Find the wallet's [STRK, transfer, 3, to, lo, hi] shield call.
    let amount: bigint | null = null
    for (let i = 0; i + 5 < felts.length; i++) {
      if (felts[i] === STRK_FELT && felts[i + 1] === TRANSFER_FELT && felts[i + 2] === 3n) {
        const lo = felts[i + 4]
        const hi = felts[i + 5]
        if (lo !== null && hi !== null) amount = lo + (hi << 128n)
        break
      }
    }
    if (amount !== null && amount > 0n) {
      txClassCache.set(cacheKey, { kind: "shield", amount })
      return { kind: "shield" as const, txHash, blockNumber, amount, owner }
    }
    txClassCache.set(cacheKey, { kind: "private" })
    return { kind: "private" as const, txHash, blockNumber, owner }
  })
  const confirmed = await mapLimit(classified.filter((c) => c !== null), 10, async (c) => {
    const status = await fetchTxStatus(provider, c.txHash)
    return { ...c, status }
  })
  // Source A first: documented Deposit events (status-checked like the rest —
  // a reverted deposit must never render as confirmed).
  const depositStatuses = await mapLimit([...depositByTx.values()], 10, async (d) => ({
    ...d,
    status: await fetchTxStatus(provider, d.txHash),
  }))
  for (const d of depositStatuses) {
    if (d.status !== "confirmed") continue
    shields.push({
      depositor: d.owner,
      token: STRK_ADDRESS,
      amountRaw: d.amount,
      txHash: d.txHash,
      blockNumber: d.blockNumber,
    })
  }
  for (const c of confirmed) {
    if (c.kind === "shield") {
      // A reverted shield must never render as a confirmed deposit.
      if (c.status !== "confirmed") continue
      shields.push({
        depositor: c.owner,
        token: STRK_ADDRESS,
        amountRaw: c.amount,
        txHash: c.txHash,
        blockNumber: c.blockNumber,
      })
    } else {
      privateTxs.push({ txHash: c.txHash, blockNumber: c.blockNumber, status: c.status })
    }
  }
  shields.sort((a, b) => b.blockNumber - a.blockNumber)
  privateTxs.sort((a, b) => b.blockNumber - a.blockNumber)
  return { shields, privateTxs }
}