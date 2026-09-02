import { randomUUID } from "crypto"

const PROVER_BASE = "https://api.starkscan.co/v1/SN_MAIN/prove"
const AUTH_HEADER = "X-Starkscan-Api-Key"

// ---------------------------------------------------------------------------
// Types — mirrored from the Starkscan STRK20 prover relay docs
// ---------------------------------------------------------------------------

export type JobStatus =
  | "queued"       // terminal: false — waiting for prover
  | "dispatched"   // terminal: false — proof running
  | "succeeded"    // terminal: true  — result.proof is ready
  | "failed"       // terminal: true  — result rejected; error.code is prover's own code
  | "unavailable"  // terminal: true  — safe to retry with SAME idempotency key
  | "unknown_delivery" // terminal: true — do NOT resubmit; contact support

export interface ProverJob {
  jobId: string
  status: JobStatus
  terminal: boolean
  attemptCount: number
  queuePosition?: number
  pollAfterSeconds?: number
  createdAt: string
  completedAt?: string
  /**
   * ⚠️  CRITICAL: Delivered ONCE then dropped from relay memory.
   * Persist the ENTIRE result object the moment you receive it.
   * For deposits: result.additional_data MUST be passed to apply_actions.
   */
  result?: ProverResult
  resultUnavailableReason?: "delivered_or_expired"
  error?: {
    source: "prover" | "relay"
    code: number | string
    message?: string
    data?: string
  }
}

export interface ProverResult {
  proof: string
  proof_facts: string
  l2_to_l1_messages: unknown[]
  /**
   * Only present for DEPOSIT transactions.
   * Must be passed to apply_actions — omitting it reverts with SCREENING_REQUIRED.
   * Expires 300 seconds after issued_at. Check before broadcasting.
   */
  additional_data?: {
    signature: {
      issued_at: number  // unix timestamp — check expiry!
      sig_r: string
      sig_s: string
    }
  }
}

// ---------------------------------------------------------------------------
// Submit a proof job
// ---------------------------------------------------------------------------

/**
 * Submit an Invoke transaction to the Starkscan prover relay.
 *
 * @param apiKey       STARKSCAN_API_KEY from env
 * @param blockNumber  Explicit finalized block number — do NOT use "latest"
 * @param transaction  The full Invoke transaction object to prove
 * @returns            The jobId to poll with pollProofJob()
 */
export async function submitProofJob(
  apiKey: string,
  blockNumber: number,
  transaction: Record<string, unknown>,
): Promise<string> {
  if (!apiKey || apiKey === "key_YOUR_STARKSCAN_API_KEY") {
    throw new Error("STARKSCAN_API_KEY is not set in .env")
  }

  const idempotencyKey = randomUUID()

  const res = await fetch(PROVER_BASE, {
    method: "POST",
    headers: {
      [AUTH_HEADER]: apiKey,
      "Idempotency-Key": idempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      block_id: { block_number: blockNumber },
      transaction,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(
      `Prover submit failed: HTTP ${res.status} — ${body}\n` +
      `If 404: relay is dormant (key not yet whitelisted or relay offline).\n` +
      `If 403: key lacks 'prove' scope — contact @starkience.`
    )
  }

  const job = await res.json() as ProverJob
  return job.jobId
}

// ---------------------------------------------------------------------------
// Poll a proof job until terminal
// ---------------------------------------------------------------------------

/**
 * Poll the prover relay until the job reaches a terminal state.
 *
 * ⚠️  Persist the returned ProverResult immediately — it is delivered ONCE.
 * ⚠️  For deposits: check result.additional_data.signature.issued_at against
 *     Date.now()/1000 — must be < 300 seconds old before broadcasting.
 *
 * @param apiKey  STARKSCAN_API_KEY
 * @param jobId   The jobId returned by submitProof()
 * @param opts    Optional timeoutMs (default 10 min) and maxPollMs (default 15s)
 */
export async function pollProof(
  apiKey: string,
  jobId: string,
  opts: { timeoutMs?: number; maxPollMs?: number } = {},
): Promise<ProverResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000   // 10 min
  const maxPollMs = opts.maxPollMs ?? 15_000            // never spin faster than 15s
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(`${PROVER_BASE}/${jobId}`, {
      headers: { [AUTH_HEADER]: apiKey },
    })

    if (!res.ok) {
      throw new Error(`Prover poll failed: HTTP ${res.status}`)
    }

    const job = await res.json() as ProverJob

    if (!job.terminal) {
      const waitMs = Math.max(
        (job.pollAfterSeconds ?? 10) * 1000,
        maxPollMs,
      )
      console.log(
        `[prover] ${job.jobId} status=${job.status} queue=${job.queuePosition ?? "?"} — waiting ${waitMs / 1000}s`
      )
      await sleep(waitMs)
      continue
    }

    // Terminal states
    if (job.status === "succeeded") {
      if (!job.result) {
        throw new Error(
          `[prover] Job succeeded but result is missing (delivered_or_expired). ` +
          `You must resubmit — the proof is gone.`
        )
      }
      return job.result
    }

    if (job.status === "unavailable") {
      throw new Error(
        `[prover] Job ${jobId} unavailable (prover error). ` +
        `Retry with the SAME idempotency key. If it persists, contact support with jobId and attemptCount=${job.attemptCount}.`
      )
    }

    if (job.status === "unknown_delivery") {
      throw new Error(
        `[prover] Job ${jobId} unknown_delivery. ` +
        `Do NOT resubmit automatically. Contact support with jobId.`
      )
    }

    // status === "failed"
    throw new Error(
      `[prover] Job ${jobId} failed. ` +
      `code=${job.error?.code} message=${job.error?.message ?? "none"} data=${job.error?.data ?? "none"}`
    )
  }

  throw new Error(`[prover] Job ${jobId} timed out after ${timeoutMs / 1000}s`)
}

// ---------------------------------------------------------------------------
// Convenience: submit and poll in one call
// ---------------------------------------------------------------------------

/**
 * Submit and poll in a single call. Returns the ProverResult.
 *
 * Usage:
 *   const result = await proveTransaction(apiKey, blockNumber, invokeTransaction)
 *   // Persist result NOW before anything else
 *   persistResult(result)
 *   // For deposits: check attestation age
 *   if (result.additional_data) {
 *     const age = Date.now() / 1000 - result.additional_data.signature.issued_at
 *     if (age > 240) throw new Error("Attestation nearly expired — re-prove")
 *   }
 */
export async function proveTransaction(
  apiKey: string,
  blockNumber: number,
  transaction: Record<string, unknown>,
  pollOpts?: { timeoutMs?: number; maxPollMs?: number },
): Promise<ProverResult> {
  console.log(`[prover] Submitting proof for block ${blockNumber}...`)
  const jobId = await submitProofJob(apiKey, blockNumber, transaction)
  console.log(`[prover] Queued: jobId=${jobId}`)
  const result = await pollProof(apiKey, jobId, pollOpts)
  console.log(`[prover] Proof received for jobId=${jobId}`)
  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
