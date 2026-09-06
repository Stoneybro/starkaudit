"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WalletAccountV6 } from "starknet";
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core";
import { ShieldCheck, Loader2 } from "lucide-react";
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

type PaymentsPanelProps = {
  address: string;
  getAccount: () => WalletAccountV6 | undefined;
  /** Raw injected wallet — kept for compatibility. */
  walletObject?: StarknetWindowObject;
  /** Raw shielded (private STRK20) balance in wei; null when unknown/unfetched. */
  shieldedRaw: bigint | null;
  /** Fired after a payment confirms — lets the page refresh the public balance (RPC-only, no prompt). */
  onPublicBalanceChanged?: () => void;
  /** Fired after a payment confirms — lets the page re-read the shielded balance (wallet consent prompt). */
  onShieldedBalanceChanged?: () => void;
  /** Fired after the audit relay succeeds — lets the page refresh the proof feed. */
  onAuditRelayed?: () => void;
};

type FormErrors = Partial<Record<"address" | "amount" | "shieldAmount", string>>;

export function PaymentsPanel({
  address,
  getAccount,
  shieldedRaw,
  onPublicBalanceChanged,
  onShieldedBalanceChanged,
  onAuditRelayed,
}: PaymentsPanelProps) {
  const [shieldAmount, setShieldAmount] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [submitting, setSubmitting] = useState<"shield" | "transfer" | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  // Transient "Shielded"/"Sent" confirmation shown on button for ~2s after wallet
  // submits the tx (before on-chain confirmation finishes polling).
  const [successFlash, setSuccessFlash] = useState<
    { kind: "shield" | "transfer"; amount: string } | undefined
  >(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard against post-unmount state updates: React Fast Refresh (dev) or
  // navigation can unmount the component while a wallet promise is still
  // pending.
  const mountedRef = useRef(true);
  const submittingRef = useRef<"shield" | "transfer" | null>(null);
  const activeReqId = useRef(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const flashSuccess = useCallback((kind: "shield" | "transfer", amount: string) => {
    setSuccessFlash({ kind, amount });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSuccessFlash(undefined), 2000);
  }, []);

  const account = getAccount();
  const strk20Capable = !!account && typeof account.strk20InvokeTransaction === "function";

  // Web-ui PaymentForm pattern: validate the private-payment amount against the
  // shielded balance. No shielded balance (0 or unknown) => transfer disabled.
  const payWei = parseStrkToWei(payAmount);
  const isInsufficient = shieldedRaw !== null && payWei !== null && payWei > shieldedRaw;
  const hasShieldedBalance = shieldedRaw !== null && shieldedRaw > 0n;
  const shieldedFormatted = shieldedRaw !== null ? formatNumber(shieldedRaw) : null;

  const notifyPaymentsChanged = useCallback(() => {
    try {
      window.dispatchEvent(new Event("starkaudit:payments-changed"));
    } catch {
      // non-browser — history re-read is best-effort
    }
  }, []);

  // ── Automatic audit relay (transfers only, background, best-effort) ──
  // The backend rebuilds the witness and relays submit_proof_for attributed
  // to this business. No wallet prompt — fire-and-forget.
  const fireAuditRelay = useCallback(
    (txHash: string, recipientAddr: string, amountWei: bigint) => {
      void fetch("/api/submit-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: address,
          recipient: recipientAddr,
          amountWei: amountWei.toString(),
          txHash,
        }),
      })
        .then((res) => res.json())
        .then((data: { success?: boolean; alreadySubmitted?: boolean; pass?: boolean | null }) => {
          if (data?.success && !data?.alreadySubmitted) {
            onAuditRelayed?.();
          }
        })
        .catch(() => {
          console.warn("[PaymentsPanel] audit relay failed silently");
        });
    },
    [address, onAuditRelayed],
  );

  // Record a landed tx: save locally (Activity picks it up immediately via
  // the payments-changed event), then poll to finality.
  const trackLandedTx = useCallback(
    (
      kind: "shield" | "transfer",
      amountLabel: string,
      amountWei: bigint,
      recipientAddr: string | undefined,
      transaction_hash: string,
    ) => {
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
      notifyPaymentsChanged();
      void pollTxStatus(getProvider(), transaction_hash)
        .then((status) => {
          savePayments(
            address,
            loadPayments(address).map((e) => (e.id === entryId ? { ...e, status } : e)),
          );
          notifyPaymentsChanged();
          if (status === "confirmed") {
            if (kind === "shield") {
              toast.success("Shield Confirmed", {
                description: `${amountLabel} STRK shielded. New notes mature after ~10 blocks before they can be spent.`,
                action: {
                  label: "View on Voyager",
                  onClick: () => window.open(voyagerTx(transaction_hash), "_blank", "noopener,noreferrer"),
                },
                duration: 6000,
              });
            } else {
              toast.success("Payment Confirmed", {
                description: `Sent ${amountLabel} STRK privately.`,
                action: {
                  label: "View on Voyager",
                  onClick: () => window.open(voyagerTx(transaction_hash), "_blank", "noopener,noreferrer"),
                },
                duration: 6000,
              });
            }
            onPublicBalanceChanged?.();
            onShieldedBalanceChanged?.();
            if (kind === "transfer" && recipientAddr && amountWei > 0n) {
              fireAuditRelay(transaction_hash, recipientAddr, amountWei);
            }
          } else if (status === "failed") {
            toast.error("Transaction failed", {
              description: `The ${kind === "shield" ? "shield" : "payment"} transaction reverted on-chain.`,
            });
          } else {
            // Confirmation is slow but the tx may already be visible on the
            // public RPC — refresh the public balance (no wallet prompt).
            onPublicBalanceChanged?.();
          }
        })
        .catch(() => {
          // Poll failed — the Activity entry keeps its "confirming" status.
        });
    },
    [address, notifyPaymentsChanged, onPublicBalanceChanged, onShieldedBalanceChanged, fireAuditRelay],
  );

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
        toast.error("Unsupported Wallet", {
          description: "STRK20 privacy requires a privacy-enabled wallet (Wallet API ≥ 0.10.3).",
        });
        return false;
      }

      if (flashTimer.current) clearTimeout(flashTimer.current);
      submittingRef.current = kind;
      activeReqId.current = reqId;
      setSubmitting(kind);

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

        const isActive = mountedRef.current && activeReqId.current === reqId;
        if (isActive) {
          submittingRef.current = null;
          setSubmitting(null);
          flashSuccess(kind, amountLabel);
        }
        trackLandedTx(kind, amountLabel, amountWei, recipientAddr, transaction_hash);
        return true;
      } catch (e: unknown) {
        console.error(`[PaymentsPanel] ${kind} #${reqId} wallet request failed`, e);
        const rawMsg = e instanceof Error ? e.message : String(e);
        if (rawMsg.includes("NOT_REGISTERED")) {
          toast.error("Viewing Key Registration Required", {
            description:
              "STRK20 accounts must register with the privacy pool. Enable privacy in your wallet settings and retry.",
            duration: 8000,
          });
        } else if (
          rawMsg.toLowerCase().includes("user abort") ||
          rawMsg.toLowerCase().includes("user rejected") ||
          rawMsg.toLowerCase().includes("user denied")
        ) {
          toast.error("Transaction cancelled", {
            description: "You rejected the transaction in your wallet.",
          });
        } else {
          const isTimeout = rawMsg.toLowerCase().includes("timeout");
          if (isTimeout) {
            onPublicBalanceChanged?.();
          }
          const cleanMsg = rawMsg.length > 120 ? `${rawMsg.slice(0, 117)}...` : rawMsg;
          toast.error("Transaction failed", {
            description: cleanMsg || "The transaction could not be submitted.",
          });
        }

        if (mountedRef.current && activeReqId.current === reqId) {
          submittingRef.current = null;
          setSubmitting(null);
        }
        return false;
      }
    },
    [getAccount, onPublicBalanceChanged, flashSuccess, trackLandedTx],
  );

  const submitShield = async () => {
    if (!strk20Capable) {
      toast.error("Unsupported Wallet", {
        description: "STRK20 privacy requires a privacy-enabled wallet (Wallet API ≥ 0.10.3).",
      });
      return;
    }
    const wei = parseStrkToWei(shieldAmount);
    if (!wei || wei <= 0n) {
      setErrors((p) => ({ ...p, shieldAmount: "Amount must be greater than 0" }));
      return;
    }
    setErrors((p) => ({ ...p, shieldAmount: undefined }));
    const ok = await runPayment("shield", shieldAmount.trim(), wei);
    if (ok) setShieldAmount("");
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strk20Capable) {
      toast.error("Unsupported Wallet", {
        description: "STRK20 privacy requires a privacy-enabled wallet (Wallet API ≥ 0.10.3).",
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
      return;
    }
    const ok = await runPayment("transfer", payAmount.trim(), wei!, recipient.trim());
    if (ok) {
      setRecipient("");
      setPayAmount("");
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full pb-12 space-y-4">
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
                {submitting === "shield" && (
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
                title={!strk20Capable ? "STRK20 privacy requires a privacy-enabled wallet (Wallet API ≥ 0.10.3)" : undefined}
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
                !strk20Capable
                  ? "STRK20 privacy requires a privacy-enabled wallet (Wallet API ≥ 0.10.3)"
                  : !hasShieldedBalance
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