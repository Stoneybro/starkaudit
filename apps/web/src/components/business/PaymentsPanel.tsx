"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletAccountV6 } from "starknet";
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core";
import { ShieldCheck, ExternalLink, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getProvider, voyagerTx } from "@/lib/starknet";
import {
  STRK_ADDRESS,
  isValidStarknetAddress,
  loadPayments,
  parseStrkToWei,
  pollTxStatus,
  savePayments,
  type PaymentEntry,
} from "@/lib/payments";
import { formatNumber } from "@/utils/format";

// FELT params must be canonical hex strings ("0x…", ≤63 hex digits) per the
// Wallet API spec (types-js api/components.d.ts). Decimal strings are rejected
// with INVALID_REQUEST_PAYLOAD.
function toFeltHex(v: bigint): string {
  return `0x${v.toString(16)}`;
}

// Map documented Wallet API error codes to plain-English guidance.
function friendlyWalletError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("NOT_REGISTERED")) {
    return "Your wallet isn't registered with the privacy pool yet. Registration happens through your wallet on first use — try shielding a small amount and approve the request when prompted.";
  }
  if (msg.includes("INSUFFICIENT_PRIVATE_BALANCE")) {
    return "Not enough shielded balance for this payment. Shield more STRK first.";
  }
  if (msg.includes("USER_REFUSED_OP")) {
    return "The request was rejected in your wallet.";
  }
  if (msg.includes("PRIVACY_LEAK")) {
    return "The wallet blocked this action because it would weaken your privacy (e.g. a same-block deposit-and-spend). Shield first, then pay in a separate transaction.";
  }
  if (msg.includes("Timeout")) {
    return "The wallet timed out waiting for a response, but the transaction may still have landed on-chain (check your Ready wallet history). If it did, your balances will update after confirmation — the Activity entry couldn't be saved because no hash was returned.";
  }
  return fallback;
}

type PaymentsPanelProps = {
  address: string;
  getAccount: () => WalletAccountV6 | undefined;
  /** Raw injected wallet — used only for the wallet_supportedWalletApi diagnostic. */
  walletObject?: StarknetWindowObject;
  /** Raw shielded (private STRK20) balance in wei; null when unknown/unfetched. */
  shieldedRaw: bigint | null;
  /** Fired after a payment confirms — lets the page refresh the public balance (RPC-only, no prompt). */
  onPublicBalanceChanged?: () => void;
  /** Fired after a payment confirms — lets the page re-read the shielded balance (wallet consent prompt). */
  onShieldedBalanceChanged?: () => void;
};

type FormErrors = Partial<Record<"address" | "amount" | "shieldAmount", string>>;

export function PaymentsPanel({
  address,
  getAccount,
  walletObject,
  shieldedRaw,
  onPublicBalanceChanged,
  onShieldedBalanceChanged,
}: PaymentsPanelProps) {
  const [shieldAmount, setShieldAmount] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [submitting, setSubmitting] = useState<"shield" | "transfer" | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirmedTx, setConfirmedTx] = useState<{ hash: string; kind: string } | undefined>(undefined);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [regInfo, setRegInfo] = useState<{ versions?: string[]; error?: string } | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  // Transient "Shielded"/"Sent" confirmation shown for ~2s after the wallet
  // submits the tx (before on-chain confirmation finishes polling).
  const [successFlash, setSuccessFlash] = useState<
    { kind: "shield" | "transfer"; amount: string } | undefined
  >(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard against post-unmount state updates: React Fast Refresh (dev) or
  // navigation can unmount the component while a wallet promise is still
  // pending. The stale closure's setState calls are silently dropped by
  // React, but the ref lets us skip the work and the console noise.
  const mountedRef = useRef(true);
  // Watchdog: the wallet promise can stay pending if e.g. the user approved
  // the ERC-20 approve prompt but never confirmed the second (deposit)
  // prompt, or the wallet relays the tx but never resolves the dapp promise
  // (seen as `Error: Timeout` from Ready's inpage bridge even though the tx
  // landed). After 10s show a hint + manual reset; after 30s auto-reset the
  // button so it can never stick on "Shielding…" forever. A late wallet
  // resolution is still recorded (guarded by reqId so it can't clobber a
  // newer request's button state).
  const [stalled, setStalled] = useState(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef<"shield" | "transfer" | null>(null);
  const activeReqId = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (watchdog.current) clearTimeout(watchdog.current);
      if (autoReset.current) clearTimeout(autoReset.current);
    };
  }, []);

  // Synchronous in-flight guard: React state updates async, so double-clicks
  // before re-render would otherwise fire two wallet requests. The ref is set
  // synchronously on entry and cleared in finally.
  const requestSeq = useRef(0);

  const flashSuccess = useCallback((kind: "shield" | "transfer", amount: string) => {
    setSuccessFlash({ kind, amount });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSuccessFlash(undefined), 2000);
  }, []);

  // NOT_REGISTERED: per the STRK20 spec, registration (publishing the viewing
  // key) happens inside the wallet on first use. The app never sees the viewing
  // key, so it cannot register on the user's behalf. When a wallet returns this
  // code instead, surface its reported Wallet API versions + concrete steps.
  const handleNeedsRegistration = useCallback(async () => {
    setNeedsRegistration(true);
    if (!walletObject || regInfo) return;
    try {
      const res = (await walletObject.request({ type: "wallet_supportedWalletApi" })) as unknown;
      const versions = Array.isArray(res) ? res.map((v) => String(v)) : undefined;
      setRegInfo(versions?.length ? { versions } : { error: "This wallet did not report any supported Wallet API versions." });
    } catch {
      setRegInfo({ error: "This wallet did not report its supported Wallet API versions." });
    }
  }, [walletObject, regInfo]);

  const account = getAccount();
  const strk20Capable = !!account && typeof account.strk20InvokeTransaction === "function";

  // Web-ui PaymentForm pattern: validate the private-payment amount against the
  // shielded balance. No shielded balance (0 or unknown) => transfer disabled.
  const payWei = parseStrkToWei(payAmount);
  const isInsufficient = shieldedRaw !== null && payWei !== null && payWei > shieldedRaw;
  const hasShieldedBalance = shieldedRaw !== null && shieldedRaw > 0n;
  const shieldedFormatted = shieldedRaw !== null ? formatNumber(shieldedRaw) : null;

  const runPayment = useCallback(
    async (kind: "shield" | "transfer", amountLabel: string, amountWei: bigint, recipientAddr?: string) => {
      // Reentrancy guard must run before any await — state alone is too slow
      // to stop a fast double-click from opening two wallet prompts.
      if (submittingRef.current !== null) {
        console.warn(
          `[PaymentsPanel] ${kind} ignored — request already in flight (${submittingRef.current})`,
        );
        return false;
      }
      const reqId = (requestSeq.current += 1);
      const acct = getAccount();
      if (!acct || typeof acct.strk20InvokeTransaction !== "function") {
        setError("Your wallet does not support STRK20 private actions (Wallet API ≥ 0.10.3 required).");
        return false;
      }
      setError(undefined);
      setConfirmedTx(undefined);
      setSuccessFlash(undefined);
      setStalled(false);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (watchdog.current) clearTimeout(watchdog.current);
      if (autoReset.current) clearTimeout(autoReset.current);
      submittingRef.current = kind;
      activeReqId.current = reqId;
      setSubmitting(kind);
      // If the wallet promise is still pending after 10s (e.g. second prompt
      // never approved), flag it so the UI can guide the user + offer reset.
      watchdog.current = setTimeout(() => {
        if (mountedRef.current && submittingRef.current !== null && activeReqId.current === reqId) {
          setStalled(true);
          console.warn(
            `[PaymentsPanel] ${kind} #${reqId} wallet request still pending after 10s — likely waiting on a wallet prompt`,
          );
        }
      }, 10_000);
      // Absolute backstop: never leave the button stuck. After 30s release
      // the UI so the user can retry; a late wallet resolution below still
      // saves the payment (reqId-guarded so it can't clobber the new attempt).
      autoReset.current = setTimeout(() => {
        if (mountedRef.current && submittingRef.current !== null && activeReqId.current === reqId) {
          console.warn(
            `[PaymentsPanel] ${kind} #${reqId} auto-resetting stuck button after 30s`,
          );
          submittingRef.current = null;
          setStalled(false);
          setSubmitting(null);
          setError(
            "The wallet didn't respond within 30 seconds, so the button was reset. Check your Ready wallet history — if the transaction landed, balances update after confirmation; otherwise try again.",
          );
          toast("Wallet didn't respond — button reset. Check Ready history for the tx.");
          onPublicBalanceChanged?.();
        }
      }, 30_000);
      try {
        // FELT params are hex strings per the Wallet API spec — decimal strings
        // are rejected with INVALID_REQUEST_PAYLOAD at wallet-side validation.
        const actions =
          kind === "shield"
            ? [{ type: "deposit" as const, token: STRK_ADDRESS, amount: toFeltHex(amountWei) }]
            : [{ type: "transfer" as const, token: STRK_ADDRESS, amount: toFeltHex(amountWei), recipient: toFeltHex(BigInt(recipientAddr!)) }];
        console.log(`[PaymentsPanel] ${kind} #${reqId} requesting wallet signature`, {
          amount: amountLabel,
        });
        const result = await acct.strk20InvokeTransaction(actions);
        console.log(`[PaymentsPanel] ${kind} #${reqId} wallet resolved`, result);
        const { transaction_hash } = result;
        // Submission is done (wallet approved + tx sent) — release the button
        // into a transient "Shielded"/"Sent" state; on-chain confirmation
        // continues in the background below. Only touch button state if this
        // request is still the active one (an auto-reset may have released it
        // already) AND the component is still mounted; always record the
        // payment + toast.
        const isActive = mountedRef.current && activeReqId.current === reqId;
        if (isActive) {
          submittingRef.current = null;
          setStalled(false);
          setSubmitting(null);
          flashSuccess(kind, amountLabel);
        } else {
          console.log(
            `[PaymentsPanel] ${kind} #${reqId} resolved after reset/unmount — recording payment without touching button`,
          );
        }
        const entryId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        const entry: PaymentEntry = {
          id: entryId,
          kind,
          amount: amountLabel,
          recipient: recipientAddr,
          txHash: transaction_hash,
          createdAt: Date.now(),
          status: "confirming",
        };
        savePayments(address, [entry, ...loadPayments(address).filter((e) => e.id !== entryId)]);
        toast.success(
          kind === "shield"
            ? `Successfully shielded ${amountLabel} STRK`
            : `Successfully paid ${amountLabel} STRK privately`,
          { description: "Confirming on-chain — view it in the Activity table below." },
        );
        void pollTxStatus(getProvider(), transaction_hash)
          .then((status) => {
            savePayments(
              address,
              loadPayments(address).map((e) => (e.id === entryId ? { ...e, status } : e)),
            );
            if (status === "confirmed") {
              setConfirmedTx({ hash: transaction_hash, kind: kind === "shield" ? "Shield" : "Private payment" });
              toast.success(
                kind === "shield"
                  ? `Shield confirmed — ${amountLabel} STRK is now private`
                  : `Private payment of ${amountLabel} STRK confirmed`,
              );
              onPublicBalanceChanged?.();
              onShieldedBalanceChanged?.();
            } else if (status === "failed") {
              setError("The transaction was reverted on-chain. Check your balance and try again.");
              toast.error("Transaction reverted");
            } else {
              toast("Still confirming — check the Activity table for its status.");
              // Confirmation is slow but the tx may already be visible on the
              // public RPC — refresh the public balance (no wallet prompt).
              onPublicBalanceChanged?.();
            }
          })
          .catch(() => {
            toast("Couldn't poll confirmation status — check the Activity table on Voyager.");
          });
        return true;
      } catch (e: unknown) {
        console.error(`[PaymentsPanel] ${kind} #${reqId} wallet request failed`, e);
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NOT_REGISTERED")) void handleNeedsRegistration();
        if (mountedRef.current) {
          setError(friendlyWalletError(e, "The wallet rejected or could not complete the request."));
        }
        // The tx may still have landed (Ready `Timeout` after relay) — refresh
        // the public balance (RPC-only, no wallet prompt) so a
        // confirmed-but-unrecorded shield still shows up there.
        if (msg.includes("Timeout")) onPublicBalanceChanged?.();
        // Clear submitting so the button resets on error — only if this
        // request is still active and the component is still mounted.
        if (mountedRef.current && activeReqId.current === reqId) {
          submittingRef.current = null;
          setStalled(false);
          setSubmitting(null);
        }
        return false;
      } finally {
        if (watchdog.current) clearTimeout(watchdog.current);
        if (autoReset.current) clearTimeout(autoReset.current);
      }
    },
    [getAccount, address, onPublicBalanceChanged, onShieldedBalanceChanged, flashSuccess, handleNeedsRegistration],
  );

  const resetStuck = useCallback(() => {
    if (watchdog.current) clearTimeout(watchdog.current);
    if (autoReset.current) clearTimeout(autoReset.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    console.log("[PaymentsPanel] manual reset of stuck submitting state", {
      stuck: submittingRef.current,
    });
    submittingRef.current = null;
    setStalled(false);
    setSubmitting(null);
    setError(
      "Reset the stuck Shield button. If your wallet already submitted a transaction, find its hash in the wallet activity tab — otherwise try shielding again and approve both wallet prompts.",
    );
    toast("Shield button reset — check your wallet activity for any submitted tx.");
  }, []);

  const submitShield = async () => {
    if (!strk20Capable) {
      toast.error("Wallet not STRK20-capable", {
        description: "Reconnect with a privacy-enabled wallet (Wallet API ≥ 0.10.3) to shield.",
      });
      return;
    }
    const wei = parseStrkToWei(shieldAmount);
    if (!wei || wei <= 0n) {
      setErrors((p) => ({ ...p, shieldAmount: "Amount must be greater than 0" }));
      toast.error("Invalid shield amount", {
        description: "Enter an amount greater than 0 STRK to shield.",
      });
      return;
    }
    setErrors((p) => ({ ...p, shieldAmount: undefined }));
    setError(undefined);
    const ok = await runPayment("shield", shieldAmount.trim(), wei);
    if (ok) setShieldAmount("");
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strk20Capable) {
      toast.error("Wallet not STRK20-capable", {
        description: "Reconnect with a privacy-enabled wallet (Wallet API ≥ 0.10.3) to pay privately.",
      });
      return;
    }
    const next: FormErrors = {};
    if (!isValidStarknetAddress(recipient.trim())) {
      next.address = "Invalid Starknet address";
    }
    const wei = parseStrkToWei(payAmount);
    if (!wei || wei <= 0n) {
      next.amount = "Amount must be greater than 0";
    } else if (!hasShieldedBalance) {
      next.amount = "No shielded balance — shield STRK above first";
    } else if (isInsufficient) {
      next.amount = `Insufficient shielded balance (current: ${shieldedFormatted} STRK) — shield more first`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      // Industry standard: inline errors + a summary toast so keyboard and
      // assistive-tech users get the outcome announced.
      if (next.amount && (next.amount.startsWith("No shielded") || next.amount.startsWith("Insufficient"))) {
        toast.error("Shield first to pay privately", {
          description:
            next.amount.startsWith("No shielded")
              ? "Your shielded balance is empty. Shield STRK above, then send the payment."
              : `Your shielded balance (${shieldedFormatted} STRK) is too low for this payment. Shield more STRK first.`,
        });
      } else {
        toast.error("Payment blocked — check the form", {
          description: "Fix the highlighted fields and try again.",
        });
      }
      return;
    }
    setError(undefined);
    const ok = await runPayment("transfer", payAmount.trim(), wei!, recipient.trim());
    // Web-ui pattern: clear the form only after a successful submission.
    if (ok) {
      setRecipient("");
      setPayAmount("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full pb-12 space-y-4">
      {!strk20Capable && (
        <Alert variant="destructive">
          <AlertTitle>Wallet not STRK20-capable</AlertTitle>
          <AlertDescription>
            Payments need a privacy-enabled wallet (Wallet API ≥ 0.10.3). Reconnect with a supported
            wallet to shield and pay privately.
          </AlertDescription>
        </Alert>
      )}

      {needsRegistration && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Wallet registration required</AlertTitle>
          <AlertDescription>
            <p>
              STRK20 accounts must register their viewing key with the privacy pool before they can
              shield or hold a private balance. The STRK20 spec puts this inside the wallet on first
              use — StarkAudit never sees your viewing key, so it cannot register for you.
            </p>
            {regInfo?.versions && (
              <p className="mt-2">
                Your wallet reports Wallet API version{regInfo.versions.length > 1 ? "s" : ""}:{" "}
                <span className="font-medium">{regInfo.versions.join(", ")}</span>
              </p>
            )}
            {regInfo?.error && <p className="mt-2">{regInfo.error}</p>}
            <ul className="mt-2 list-disc pl-4">
              <li>Update your wallet extension to the latest version.</li>
              <li>
                Check its settings for a STRK20 / privacy / private-accounts option and enable it.
              </li>
              <li>
                Reconnect here, then shield a small amount again and approve every prompt your wallet
                shows.
              </li>
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {confirmedTx && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>{confirmedTx.kind} confirmed</AlertTitle>
          <AlertDescription>
            <a
              href={voyagerTx(confirmedTx.hash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              View on Voyager <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {confirmedTx.kind === "Shield" &&
              " New notes mature after ~10 blocks before they can be spent."}
          </AlertDescription>
        </Alert>
      )}

      {stalled && submitting !== null && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Still waiting on your wallet…</AlertTitle>
          <AlertDescription>
            <p>
              The wallet hasn&apos;t answered after 10 seconds. A shield needs{" "}
              <strong>two approvals</strong>: 1) approve the STRK spend, then 2)
              confirm the shield deposit. If your wallet already shows one
              transaction, look for the second prompt — it may be hidden behind
              the wallet popup.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={resetStuck}>
              Reset the button
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-sm">
        <CardHeader className="px-6 pt-4 pb-4">
          <CardTitle className="text-xl">Shield STRK</CardTitle>
          <CardDescription>
            Private payments can only be sent from your shielded balance. Shield STRK here
            first — this also registers your address with the privacy pool on first use —
            then send payments from your private balance below.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-6 space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="single-shield">Shield amount</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="single-shield"
                  type="number"
                  step="0.000001"
                  min="0"
                  placeholder="0.00"
                  value={shieldAmount}
                  onChange={(e) => {
                    setShieldAmount(e.target.value);
                    if (errors.shieldAmount) setErrors((p) => ({ ...p, shieldAmount: undefined }));
                  }}
                  aria-invalid={!!errors.shieldAmount ? "true" : undefined}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>STRK</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {errors.shieldAmount ? (
                <FieldDescription className="text-destructive">
                  {errors.shieldAmount}
                </FieldDescription>
              ) : (
                <FieldDescription>
                  Converts public STRK into private notes.
                  {shieldedFormatted !== null && ` Current shielded balance: ${shieldedFormatted} STRK.`}
                </FieldDescription>
              )}
            </Field>

            <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Shielding is public by design — it names you as depositor and the amount.</p>
                <p>
                  Your wallet will prompt twice: approve the STRK spend, then confirm the
                  shield deposit.
                </p>
                {submitting === "shield" && !stalled && (
                  <p className="text-xs">
                    Waiting for wallet… approve both prompts. Proving can take ~10–30s.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={submitShield}
                disabled={!strk20Capable || submitting !== null || successFlash?.kind === "shield"}
                className="w-full sm:w-auto"
              >
                {submitting === "shield" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Shielding…
                  </>
                ) : successFlash?.kind === "shield" ? (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Shielded
                  </>
                ) : (
                  "Shield"
                )}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <form onSubmit={submitPayment}>
        <Card className="shadow-sm">
          <CardHeader className="px-6 pt-4 pb-4">
            <CardTitle className="text-xl">Create Payment</CardTitle>
            <CardDescription>
              Send a secure, STRK20-encrypted payment with an immutable audit record. Payments
              spend your shielded balance — shield STRK above first if it is empty.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 py-6 space-y-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="single-recipient">Recipient Address</FieldLabel>
                <Input
                  id="single-recipient"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    if (errors.address) setErrors((p) => ({ ...p, address: undefined }));
                  }}
                  className="font-mono"
                  aria-invalid={!!errors.address ? "true" : undefined}
                />
                {errors.address && (
                  <FieldDescription className="text-destructive">{errors.address}</FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="single-amount">Amount</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="single-amount"
                    type="number"
                    step="0.000001"
                    min="0"
                    placeholder="0.00"
                    value={payAmount}
                    onChange={(e) => {
                      setPayAmount(e.target.value);
                      if (errors.amount) setErrors((p) => ({ ...p, amount: undefined }));
                    }}
                    aria-invalid={!!errors.amount ? "true" : undefined}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>STRK</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {errors.amount ? (
                  <FieldDescription className="text-destructive">{errors.amount}</FieldDescription>
                ) : isInsufficient ? (
                  <FieldDescription className="text-destructive">
                    Insufficient balance (Current: {shieldedFormatted} STRK)
                  </FieldDescription>
                ) : !hasShieldedBalance ? (
                  <FieldDescription>
                    No shielded balance — shield STRK above to enable private payments.
                  </FieldDescription>
                ) : null}
              </Field>
            </FieldGroup>
          </CardContent>

          <CardFooter className="border-t bg-muted/20 px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Values are <strong className="font-medium text-foreground">encrypted locally</strong> via
              STRK20 before being sent onchain.
            </p>

            <Button
              type="submit"
              disabled={
                !strk20Capable ||
                submitting !== null ||
                successFlash?.kind === "transfer" ||
                isInsufficient ||
                !hasShieldedBalance
              }
              className="w-full sm:w-auto"
              title={
                !hasShieldedBalance
                  ? "Shield STRK first — private payments spend your shielded balance."
                  : undefined
              }
            >
              {submitting === "transfer" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Proving &amp; submitting…
                </>
              ) : successFlash?.kind === "transfer" ? (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Sent
                </>
              ) : (
                "Send Payment"
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}