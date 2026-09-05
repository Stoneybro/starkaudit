"use client";

import React, { useMemo, useState } from "react";
import { Settings, Clock, CheckCircle2, Lock, ListFilter, Info, RefreshCw, ShieldAlert } from "lucide-react";
import { hash } from "starknet";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CopyText from "@/components/ui/copy";
import { shortHash, voyagerTx } from "@/lib/starknet";
import { randomFeltHex } from "@/lib/distribution";

interface ThresholdsPanelProps {
  businesses: string[];
  selectedBusiness: string | null;
  onSelectBusiness: (business: string) => void;
  threshold: { commitment: string; version: string } | null;
  loading: boolean;
  error?: string;
  windowSeconds: string | null;
  windowLoading: boolean;
  txPending: boolean;
  txHash?: string;
  txError?: string;
  onRefresh: () => void;
  onSetThreshold: (business: string, commitmentHex: string, thresholdWeiHex: string, saltHex: string) => void;
  onSetWindow: (business: string, seconds: string) => void;
  onFlagException: (business: string, nullifierHex: string) => void;
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
  if (seconds === null) return "Unknown";
  try {
    const s = BigInt(seconds);
    if (s % 86400n === 0n) return `${(s / 86400n).toString()} days (${s.toString()}s)`;
    if (s % 3600n === 0n) return `${(s / 3600n).toString()} hours (${s.toString()}s)`;
    return `${s.toString()} seconds`;
  } catch {
    return seconds;
  }
}

function isThresholdCommitted(threshold: { commitment: string } | null): boolean {
  if (!threshold) return false;
  try {
    return BigInt(threshold.commitment) !== 0n;
  } catch {
    return threshold.commitment !== "0x0";
  }
}

/**
 * Auditor test suite — ported from web-ui TestRules + TestConfigurator.
 * Same card layout and configure dialog; wired to the real registry:
 * T1 commits a poseidon threshold hash, T2 sets the duplicate window.
 * Numeric values never go on-chain — only hashes, versions and seconds.
 */
export function ThresholdsPanel({
  businesses,
  selectedBusiness,
  onSelectBusiness,
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
  const [configuring, setConfiguring] = useState<"t1" | "t2" | "exceptions" | null>(null);

  const t1Active = isThresholdCommitted(threshold);
  const t2Active = windowSeconds !== null;
  const refreshing = loading || windowLoading;

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex items-center justify-between gap-4 mb-6 border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Test Suite</h2>
          <p className="text-sm text-muted-foreground">
            Per-business thresholds — each business’s auditor commits hashes for that business only.
          </p>
          {businesses.length > 1 && (
            <label className="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
              Business
              <select
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
                value={selectedBusiness ?? ""}
                onChange={(e) => onSelectBusiness(e.target.value)}
                disabled={txPending}
              >
                {businesses.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
          )}
          {businesses.length === 0 && (
            <p className="text-sm text-muted-foreground pt-2">
              No businesses discovered yet — register one from the Business workspace first.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

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
            <a href={voyagerTx(txHash)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              View on Voyager
            </a>
          </AlertDescription>
        </Alert>
      )}

      {!t1Active && !t2Active && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No tests are active yet. Configure at least one test below.
          </AlertDescription>
        </Alert>
      )}

      {error && !threshold ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {/* T1 — Materiality */}
          <div className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all hover:shadow-sm">
            <div className="flex-1 space-y-1.5">
              <h4 className="text-base font-semibold">Materiality</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Flags blinded transfer proofs whose hidden amount breaches the committed limit.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
                {t1Active ? (
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Inactive
                  </span>
                )}
                {t1Active && threshold && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <ListFilter className="h-3.5 w-3.5" /> Version v{threshold.version} · {shortHash(threshold.commitment)}
                    </span>
                    <CopyText text={threshold.commitment} />
                    <span className="flex items-center gap-1.5 text-primary/70">
                      <Lock className="h-3.5 w-3.5" /> Threshold committed
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 sm:min-w-[140px] pt-1">
              <Button
                variant={t1Active ? "outline" : "default"}
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setConfiguring("t1")}
                disabled={txPending}
              >
                <Settings className="h-4 w-4 mr-2" />
                {t1Active ? "Edit Config" : "Configure"}
              </Button>
            </div>
          </div>

          {/* T2 — Duplicate */}
          <div className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all hover:shadow-sm">
            <div className="flex-1 space-y-1.5">
              <h4 className="text-base font-semibold">Duplicate</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Flags a repeat payment fingerprint seen inside the detection window.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
                {t2Active ? (
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Inactive
                  </span>
                )}
                {t2Active && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <ListFilter className="h-3.5 w-3.5" /> Window: {formatWindow(windowSeconds)}
                    </span>
                    <span className="flex items-center gap-1.5 text-primary/70">
                      <Lock className="h-3.5 w-3.5" /> Enforced on-chain
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 sm:min-w-[140px] pt-1">
              <Button
                variant={t2Active ? "outline" : "default"}
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setConfiguring("t2")}
                disabled={txPending}
              >
                <Settings className="h-4 w-4 mr-2" />
                {t2Active ? "Edit Config" : "Configure"}
              </Button>
            </div>
          </div>

          {/* Exceptions */}
          <div className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all hover:shadow-sm">
            <div className="flex-1 space-y-1.5">
              <h4 className="text-base font-semibold">Exceptions</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Manually flag a nullifier for review — e.g. a missing proof. Only the nullifier key is stored.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5 text-primary/70">
                  <ShieldAlert className="h-3.5 w-3.5" /> Auditor-only
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 sm:min-w-[140px] pt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setConfiguring("exceptions")}
                disabled={txPending}
              >
                <Settings className="h-4 w-4 mr-2" />
                Flag nullifier
              </Button>
            </div>
          </div>
        </div>
      )}

      {configuring === "t1" && (
        <ThresholdDialog
          onClose={() => setConfiguring(null)}
          pending={txPending || !selectedBusiness}
          onSave={(commitment, thresholdWeiHex, saltHex) => {
            if (selectedBusiness) onSetThreshold(selectedBusiness, commitment, thresholdWeiHex, saltHex);
            setConfiguring(null);
          }}
        />
      )}
      {configuring === "t2" && (
        <WindowDialog
          key={windowSeconds ?? "unknown"}
          initialSeconds={windowSeconds ?? "604800"}
          onClose={() => setConfiguring(null)}
          pending={txPending || !selectedBusiness}
          onSave={(seconds) => {
            if (selectedBusiness) onSetWindow(selectedBusiness, seconds);
            setConfiguring(null);
          }}
        />
      )}
      {configuring === "exceptions" && (
        <ExceptionDialog
          initialBusiness={selectedBusiness ?? ""}
          onClose={() => setConfiguring(null)}
          pending={txPending}
          onSave={(business, nullifier) => {
            onFlagException(business, nullifier);
            setConfiguring(null);
          }}
        />
      )}
    </div>
  );
}

function ThresholdDialog({
  onClose,
  onConfigured,
  onSave,
  pending,
}: {
  onClose: () => void;
  onConfigured?: () => void;
  onSave: (commitment: string, thresholdWeiHex: string, saltHex: string) => void;
  pending: boolean;
}) {
  const [threshold, setThreshold] = useState("1");
  const [salt, setSalt] = useState(() => randomFeltHex());
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const preview = useMemo(() => {
    const wei = parseStrkToWei(threshold);
    const saltV = salt.trim();
    if (wei === null || !FELT_RE.test(saltV)) return null;
    try {
      return `0x${BigInt(hash.computePoseidonHashOnElements([THRESHOLD_TAG, wei, BigInt(saltV)])).toString(16)}`;
    } catch {
      return null;
    }
  }, [threshold, salt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const wei = parseStrkToWei(threshold);
    const saltV = salt.trim();
    if (!preview || wei === null || !FELT_RE.test(saltV)) {
      setFormError("Enter a valid STRK amount (up to 18 decimals) and a felt salt (0x…).");
      return;
    }
    onSave(preview, `0x${wei.toString(16)}`, `0x${BigInt(saltV).toString(16)}`);
    onConfigured?.();
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Configure Materiality</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Threshold (STRK)</Label>
            <Input
              required
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="e.g. 1"
              inputMode="decimal"
              autoComplete="off"
              disabled={pending}
            />
            <p className="text-[13px] text-muted-foreground">Hashed locally — the number never leaves your browser except as a hash.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Auditor salt (felt)</Label>
            <div className="flex gap-2">
              <Input
                required
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                placeholder="0x…"
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
                disabled={pending}
              />
              <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={pending} onClick={() => setSalt(randomFeltHex())}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Randomize
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">Fresh random salt per threshold — sealed to each business automatically on save.</p>
          </div>
          {preview && (
            <p className="text-[13px] text-muted-foreground">
              Commitment: <code className="font-mono text-foreground">{shortHash(preview)}</code>
            </p>
          )}
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <div className="pt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || !preview}>{pending ? "Saving…" : "Save Configuration"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WindowDialog({
  initialSeconds,
  onClose,
  onSave,
  pending,
}: {
  initialSeconds: string;
  onClose: () => void;
  onSave: (seconds: string) => void;
  pending: boolean;
}) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = seconds.trim();
    if (!/^\d+$/.test(v)) {
      setFormError("Enter whole seconds (e.g. 604800 for 7 days).");
      return;
    }
    try {
      if (BigInt(v) > 365n * 86400n) {
        setFormError("Window looks too large — max 1 year (31536000s).");
        return;
      }
    } catch {
      setFormError("Enter whole seconds (e.g. 604800 for 7 days).");
      return;
    }
    onSave(v);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Configure Duplicate</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Detection window</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "1 day", value: "86400" },
                { label: "7 days", value: "604800" },
                { label: "30 days", value: "2592000" },
              ].map((p) => (
                <Button key={p.value} type="button" variant="outline" size="sm" disabled={pending} onClick={() => setSeconds(p.value)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Window (seconds)</Label>
            <Input
              required
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              placeholder="e.g. 604800"
              inputMode="numeric"
              autoComplete="off"
              disabled={pending}
            />
            <p className="text-[13px] text-muted-foreground">On-chain seconds between first and repeat fingerprint that counts as duplicate.</p>
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <div className="pt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save Configuration"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExceptionDialog({
  initialBusiness,
  onClose,
  onSave,
  pending,
}: {
  initialBusiness: string;
  onClose: () => void;
  onSave: (business: string, nullifier: string) => void;
  pending: boolean;
}) {
  const [business, setBusiness] = useState(initialBusiness);
  const [nullifier, setNullifier] = useState("");
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!FELT_RE.test(business.trim())) {
      setFormError("Enter a valid business address (0x…).");
      return;
    }
    if (!FELT_RE.test(nullifier.trim())) {
      setFormError("Enter a valid nullifier felt (0x…).");
      return;
    }
    onSave(business.trim(), nullifier.trim());
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Flag exception</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Business</Label>
            <Input
              required
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="0x…"
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
            />
            <p className="text-[13px] text-muted-foreground">Only that business’s auditor can flag (NOT_AUDITOR otherwise).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nullifier</Label>
            <Input
              required
              value={nullifier}
              onChange={(e) => setNullifier(e.target.value)}
              placeholder="0x…"
              className="font-mono"
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
            />
            <p className="text-[13px] text-muted-foreground">Only the business + nullifier keys are stored.</p>
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <div className="pt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Flag exception"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
