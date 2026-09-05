"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Copy, FlaskConical, ListFilter, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { hash } from "starknet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import CopyText from "@/components/ui/copy";
import { shortHash, voyagerTx } from "@/lib/starknet";

interface ThresholdsPanelProps {
  threshold: { commitment: string; version: string } | null;
  loading: boolean;
  error?: string;
  windowSeconds: string | null;
  windowLoading: boolean;
  txPending: boolean;
  txHash?: string;
  txError?: string;
  onRefresh: () => void;
  onSetThreshold: (commitmentHex: string) => void;
  onSetWindow: (seconds: string) => void;
  onFlagException: (nullifierHex: string) => void;
}

// poseidon(THRESHOLD_TAG, threshold_wei, auditor_salt) — must match
// scripts/registry_setup.ts + packages/audit-sdk/src/types.ts THRESHOLD_TAG.
const THRESHOLD_TAG = BigInt("0x7374617263617564697433");
const FELT_RE = /^0x[0-9a-fA-F]{1,64}$/;

function parseStrkToWei(input: string): bigint | null {
  const v = input.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18) || "0");
}

function formatWindow(seconds: string | null): string {
  if (seconds === null) return "Unknown — on-chain view unavailable";
  try {
    const s = BigInt(seconds);
    if (s % 86400n === 0n) return `${(s / 86400n).toString()} days (${s.toString()}s)`;
    if (s % 3600n === 0n) return `${(s / 3600n).toString()} hours (${s.toString()}s)`;
    return `${s.toString()} seconds`;
  } catch {
    return seconds;
  }
}

/**
 * Auditor test suite — T1 Materiality + T2 Duplicate.
 * Only hashes, versions, window seconds and nullifier keys leave the browser.
 * The numeric threshold is hashed locally; calldata is public so the raw
 * value must never be submitted on-chain.
 */
export function ThresholdsPanel({
  threshold,
  loading,
  error,
  windowSeconds,
  windowLoading,
  txPending,
  txHash,
  txError,
  onRefresh,
  onSetThreshold,
  onSetWindow,
  onFlagException,
}: ThresholdsPanelProps) {
  const [thresholdStrk, setThresholdStrk] = useState("1");
  const [salt, setSalt] = useState("0xcafebabe");
  const [thresholdFormError, setThresholdFormError] = useState<string | undefined>(undefined);
  const [windowInput, setWindowInput] = useState("604800");
  const [windowFormError, setWindowFormError] = useState<string | undefined>(undefined);
  const [nullifier, setNullifier] = useState("");
  const [nullifierError, setNullifierError] = useState<string | undefined>(undefined);

  const previewCommitment = useMemo(() => {
    const wei = parseStrkToWei(thresholdStrk);
    const saltV = salt.trim();
    if (wei === null || !FELT_RE.test(saltV)) return null;
    try {
      const h = hash.computePoseidonHashOnElements([THRESHOLD_TAG, wei, BigInt(saltV)]);
      return `0x${BigInt(h).toString(16)}`;
    } catch {
      return null;
    }
  }, [thresholdStrk, salt]);

  const submitThreshold = () => {
    if (!previewCommitment) {
      setThresholdFormError("Enter a valid STRK amount (up to 18 decimals) and a felt salt (0x…).");
      return;
    }
    setThresholdFormError(undefined);
    onSetThreshold(previewCommitment);
  };

  const submitWindow = () => {
    const v = windowInput.trim();
    if (!/^\d+$/.test(v)) {
      setWindowFormError("Enter whole seconds (e.g. 604800 for 7 days).");
      return;
    }
    try {
      const n = BigInt(v);
      if (n > 365n * 86400n) {
        setWindowFormError("Window looks too large — max 1 year (31536000s).");
        return;
      }
    } catch {
      setWindowFormError("Enter whole seconds (e.g. 604800 for 7 days).");
      return;
    }
    setWindowFormError(undefined);
    onSetWindow(v);
  };

  const submitException = () => {
    const v = nullifier.trim();
    if (!FELT_RE.test(v)) {
      setNullifierError("Enter a valid nullifier felt (0x…).");
      return;
    }
    setNullifierError(undefined);
    onFlagException(v);
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 mb-6 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Test Suite</h2>
        <p className="text-sm text-muted-foreground">
          Two auditor-fixed tests. Values are committed as hashes — the numeric limit never goes on-chain.
        </p>
      </div>

      {(txError || (txHash && !txPending)) && (
        <div className="space-y-3">
          {txError && (
            <Alert variant="destructive">
              <AlertDescription>{txError}</AlertDescription>
            </Alert>
          )}
          {txHash && !txPending && !txError && (
            <Alert>
              <AlertTitle>Registry updated</AlertTitle>
              <AlertDescription>
                Transaction confirmed.{" "}
                <a
                  href={voyagerTx(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  View on Voyager
                </a>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* T1 */}
      <Card>
        <CardHeader>
          <CardTitle>T1 — Materiality Threshold</CardTitle>
          <CardDescription>
            Flags blinded STRK20 transfer proofs whose hidden attributes breach the committed limit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && !threshold ? (
            <Skeleton className="h-20 w-full rounded-xl" />
          ) : error && !threshold ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center px-6">
              <p className="text-sm font-medium">Failed to load threshold</p>
              <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
              <Button size="sm" variant="outline" onClick={onRefresh}>
                Try again
              </Button>
            </div>
          ) : !threshold ? (
            <EmptyState
              icon={<FlaskConical className="h-5 w-5" />}
              title="No threshold committed"
              description="The registry has not committed a test threshold yet."
            />
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 text-primary font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Active
              </span>
              <span className="flex items-center gap-1.5">
                <ListFilter className="h-3.5 w-3.5" /> Version v{threshold.version}
              </span>
              <span className="flex items-center gap-1.5 text-primary/70">
                <Lock className="h-3.5 w-3.5" /> Value committed — never published
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground uppercase text-[10px] tracking-wider">Commitment</span>
                <code className="font-mono text-[11px] text-foreground break-all">
                  {shortHash(threshold.commitment)}
                </code>
                <CopyText text={threshold.commitment} />
              </span>
            </div>
          )}

          <FieldGroup>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="threshold-strk">New threshold (STRK)</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="threshold-strk"
                    placeholder="1"
                    value={thresholdStrk}
                    onChange={(e) => setThresholdStrk(e.target.value)}
                    disabled={txPending}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </InputGroup>
                <FieldDescription>Hashed locally — the number never leaves your browser except as a hash.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="threshold-salt">Auditor salt (felt)</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="threshold-salt"
                    placeholder="0xcafebabe"
                    value={salt}
                    onChange={(e) => setSalt(e.target.value)}
                    className="font-mono"
                    disabled={txPending}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </InputGroup>
                <FieldDescription>Random per threshold; share the number + salt with the business out-of-band.</FieldDescription>
              </Field>
            </div>
            {previewCommitment && (
              <p className="text-xs text-muted-foreground">
                Commitment preview: <code className="font-mono text-foreground">{shortHash(previewCommitment)}</code>
              </p>
            )}
            {thresholdFormError && <p className="text-xs text-destructive">{thresholdFormError}</p>}
            <div>
              <Button size="sm" onClick={submitThreshold} disabled={txPending || !previewCommitment}>
                {txPending ? "Submitting…" : "Commit new threshold"}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* T2 */}
      <Card>
        <CardHeader>
          <CardTitle>T2 — Duplicate window</CardTitle>
          <CardDescription>
            Deterministic duplicate detection: same payment fingerprint twice inside the window marks the second
            proof as duplicate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Current: {windowLoading && windowSeconds === null ? "loading…" : formatWindow(windowSeconds)}
            </span>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || windowLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading || windowLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="dup-window">New window (seconds)</FieldLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { label: "1 day", value: "86400" },
                  { label: "7 days", value: "604800" },
                  { label: "30 days", value: "2592000" },
                ].map((p) => (
                  <Button
                    key={p.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={txPending}
                    onClick={() => setWindowInput(p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <InputGroup>
                <InputGroupInput
                  id="dup-window"
                  placeholder="604800"
                  value={windowInput}
                  onChange={(e) => setWindowInput(e.target.value)}
                  disabled={txPending}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </InputGroup>
              <FieldDescription>On-chain seconds between first and repeat fingerprint that counts as duplicate.</FieldDescription>
            </Field>
            {windowFormError && <p className="text-xs text-destructive">{windowFormError}</p>}
            <div>
              <Button size="sm" variant="secondary" onClick={submitWindow} disabled={txPending}>
                {txPending ? "Submitting…" : "Set window"}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      {/* Exceptions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Flag exception
          </CardTitle>
          <CardDescription>
            Manually mark a nullifier that needs review — e.g. a missing proof. Only the nullifier key is stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="exception-nullifier">Nullifier</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="exception-nullifier"
                placeholder="0x…"
                value={nullifier}
                onChange={(e) => setNullifier(e.target.value)}
                className="font-mono"
                disabled={txPending}
                spellCheck={false}
                autoComplete="off"
              />
            </InputGroup>
            {nullifierError && <p className="text-xs text-destructive pt-2">{nullifierError}</p>}
          </Field>
          <div>
            <Button size="sm" variant="outline" onClick={submitException} disabled={txPending || nullifier.trim().length < 3}>
              {txPending ? "Submitting…" : "Flag exception"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Copy className="h-3 w-3" /> Only the auditor wallet that deployed the registry can submit — otherwise
            the contract reverts NOT_AUDITOR.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
