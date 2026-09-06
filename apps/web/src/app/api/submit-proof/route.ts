import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, RpcProvider, hash } from "starknet";

/**
 * POST /api/submit-proof — automatic audit relay (background, no wallet prompt).
 *
 * After a business's private transfer confirms, the frontend fire-and-forgets
 * here. The route rebuilds the audit witness from the sealed threshold package
 * and submits it via `submit_proof_for`, attributed to the business — the
 * backend account must have been appointed via `set_relayer` (NOT_RELAYER /
 * NO_RELAYER otherwise). The auditor's scoped dashboard reads the record
 * identically to a self-submitted proof.
 *
 * Commitment math mirrors packages/audit-sdk/src/build_witness.ts + types.ts
 * (kept inline like lib/distribution.ts so the web app needs no workspace
 * dependency; tags are frozen domain separators).
 * Chain submission uses raw calldata like scripts/stage5.ts — no ABI import.
 *
 * Demo limitations (same as the offchain_verified path everywhere):
 * - nullifier is txHash-derived, not the real STRK20 pool nullifier.
 * - audit salt is 0n (real note salt arrives with the ZK circuit).
 * - note_id / enc_amount are 0n (no on-chain verifier deployed).
 */

type RequestBody = {
  business: string; // 0x… the payer's wallet == the registered business
  recipient: string; // 0x… Starknet address just paid
  amountWei: string; // decimal wei string, e.g. "500000000000000000"
  txHash: string; // 0x… confirmed transfer transaction hash
};

// Frozen domain separators — must match packages/audit-sdk/src/types.ts.
const PRIVATE_AUDIT_TAG = BigInt("0x7374617263617564697431"); // "starkaudit1"
const DUP_TAG = BigInt("0x7374617263617564697432"); // "starkaudit2"

const HEX_RE = /^0x[0-9a-fA-F]{1,64}$/;
const DEC_RE = /^\d+$/;

const toHex = (v: bigint): string => `0x${v.toString(16)}`;
const poseidon = (inputs: bigint[]): bigint =>
  BigInt(hash.computePoseidonHashOnElements(inputs));

function todayPeriod(): bigint {
  const now = new Date();
  return BigInt(now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate());
}

function loadThresholdPackage(): { business: string; threshold: bigint; salt: bigint } {
  // process.cwd() is apps/web in dev/standalone; the package lives at repo root.
  const pkgPath = resolve(process.cwd(), "../../threshold-package.json");
  const raw = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    business: string;
    threshold_wei: string;
    salt: string;
  };
  return { business: raw.business, threshold: BigInt(raw.threshold_wei), salt: BigInt(raw.salt) };
}

export async function POST(req: NextRequest) {
  // Minimal abuse guard: the backend key pays gas for every call, so only
  // accept same-origin browser requests (curl/manual tooling sends no Origin
  // and is still allowed for ops testing).
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { business, recipient, amountWei, txHash } = body;
  if (!business || !HEX_RE.test(business)) {
    return NextResponse.json({ error: "Invalid business address" }, { status: 400 });
  }
  if (!recipient || !HEX_RE.test(recipient)) {
    return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
  }
  if (!amountWei || !DEC_RE.test(amountWei)) {
    return NextResponse.json({ error: "Invalid amountWei" }, { status: 400 });
  }
  if (!txHash || !HEX_RE.test(txHash)) {
    return NextResponse.json({ error: "Invalid txHash" }, { status: 400 });
  }

  const rpcUrl = process.env.STARKNET_RPC_URL;
  const accountAddress = process.env.ACCOUNT_ADDRESS;
  const accountPk = process.env.ACCOUNT_PRIVATE_KEY;
  const registryAddress =
    process.env.AUDIT_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_AUDIT_REGISTRY;
  if (!rpcUrl || !accountAddress || !accountPk || !registryAddress) {
    console.error("[submit-proof] missing env (rpc/account/key/registry)");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  try {
    // The backend holds exactly one business's sealed package (demo scope).
    const pkg = loadThresholdPackage();
    if (BigInt(pkg.business) !== BigInt(business)) {
      return NextResponse.json(
        { error: "Backend does not hold this business's threshold package" },
        { status: 400 },
      );
    }

    // ── Witness (mirrors build_witness.ts) ──────────────────────────────
    const amount = BigInt(amountWei);
    const period = todayPeriod();
    const counterparty = poseidon([BigInt(recipient)]);
    // audit_commitment = poseidon(TAG, amount, salt=0n demo, counterparty, period)
    const auditCommitment = poseidon([PRIVATE_AUDIT_TAG, amount, 0n, counterparty, period]);
    // dup_commit = poseidon(DUP_TAG, counterparty, amount, period) — no salt
    const dupCommit = poseidon([DUP_TAG, counterparty, amount, period]);
    const nullifier = poseidon([PRIVATE_AUDIT_TAG, BigInt(txHash)]);
    const passClaim = amount <= pkg.threshold;

    // ── Relay as the business's appointed relayer ───────────────────────
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const account = new Account({
      provider,
      address: accountAddress,
      signer: accountPk,
      cairoVersion: "1",
    });
    // Raw calldata like scripts/stage5.ts: proof/public_inputs are empty
    // spans ("0" length), pass_claim is a felt bool.
    const res = await account.execute(
      {
        contractAddress: registryAddress,
        entrypoint: "submit_proof_for",
        calldata: [
          business,
          toHex(nullifier),
          "0x0", // note_id (demo)
          toHex(auditCommitment),
          toHex(dupCommit),
          "0x0", // enc_amount (demo)
          "0", // proof: empty span
          "0", // public_inputs: empty span
          passClaim ? "0x1" : "0x0",
        ],
      },
      { tip: 0n },
    );
    console.log("[submit-proof] relayed", {
      business: business.slice(0, 10),
      nullifier: toHex(nullifier).slice(0, 14),
      passClaim,
      tx: res.transaction_hash.slice(0, 14),
    });
    return NextResponse.json({
      success: true,
      proofTxHash: res.transaction_hash,
      pass: passClaim,
      nullifier: toHex(nullifier),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[submit-proof] error:", message.slice(0, 300));
    if (message.includes("ALREADY_SUBMITTED")) {
      return NextResponse.json({ success: true, alreadySubmitted: true, pass: null });
    }
    if (message.includes("NO_RELAYER") || message.includes("NOT_RELAYER")) {
      return NextResponse.json(
        { error: "Backend is not this business's appointed relayer (call set_relayer first)" },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Proof relay failed" }, { status: 500 });
  }
}
