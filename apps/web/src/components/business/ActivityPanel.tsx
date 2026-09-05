"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Loader2, RefreshCw, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { sameAddress, shortHash, voyagerTx } from "@/lib/starknet";
import { getProvider } from "@/lib/starknet";
import { type ProofRecord } from "@/lib/registry";
import { fetchShieldDeposits, loadPayments, type PoolDeposit } from "@/lib/payments";
import { formatNumber } from "@/utils/format";

type ActivityRow = {
  key: string;
  whenLabel: string;
  sortTs: number;
  type: string;
  /** User-typed amount for local rows; null for chain rows (never recorded). */
  amount: string | null;
  statusLabel: string;
  statusClass: string;
  detail?: string;
  link?: string;
};

type ActivityPanelProps = {
  address: string;
  proofs: ProofRecord[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
};

const headApproxTs = (block: number, headBlock: number) =>
  headBlock > 0 ? Date.now() - (headBlock - block) * 6000 : 0;

export function ActivityPanel({ address, proofs, loading, error, onRefresh }: ActivityPanelProps) {
  // History lives in localStorage → read it after mount to avoid hydration drift.
  const [history, setHistory] = useState<ReturnType<typeof loadPayments>>([]);
  // On-chain shield deposits from the pool contract — the source of truth for
  // shielding history. Fetched on mount + manual refresh only (a full scan is
  // too heavy for the 15s local re-read below).
  const [deposits, setDeposits] = useState<PoolDeposit[]>([]);
  const [depositsLoaded, setDepositsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setHistory(loadPayments(address));
    setDepositsLoaded(false);
    let cancelled = false;
    try {
      void fetchShieldDeposits(getProvider(), address)
        .then((d) => {
          if (!cancelled) {
            setDeposits(d);
            setDepositsLoaded(true);
          }
        })
        .catch(() => {
          // RPC failure — local entries still render.
          if (!cancelled) setDepositsLoaded(true);
        });
    } catch {
      // Missing RPC URL — local entries still render.
      setDepositsLoaded(true);
    }
    const t = setInterval(() => setHistory(loadPayments(address)), 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [address]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh();
    setHistory(loadPayments(address));
    try {
      setDeposits(await fetchShieldDeposits(getProvider(), address));
    } catch {
      // keep previous deposits on RPC failure
    }
    await new Promise((r) => setTimeout(r, 500));
    setIsRefreshing(false);
  };

  const rows = useMemo<ActivityRow[]>(() => {
    const myProofs = proofs.filter((p) => sameAddress(p.business, address));
    const headBlock = myProofs.reduce((m, p) => Math.max(m, p.blockNumber), 0);
    const chainHead = deposits.reduce((m, d) => Math.max(m, d.blockNumber), headBlock);

    const proofRows: ActivityRow[] = myProofs.map((p) => {
      const status = p.isDuplicate
        ? { label: "Duplicate", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" }
        : p.pass
          ? { label: "Passed", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" }
          : { label: "Threshold exceeded", cls: "bg-red-500/15 text-red-700 dark:text-red-400" };
      return {
        key: `proof-${p.nullifier}`,
        whenLabel: `Block ${p.blockNumber.toLocaleString()}`,
        sortTs: headApproxTs(p.blockNumber, chainHead),
        type: "Audit record",
        amount: null,
        statusLabel: status.label,
        statusClass: status.cls,
        detail: shortHash(p.nullifier),
        link: voyagerTx(p.txHash),
      };
    });

    const paymentRows: ActivityRow[] = history.map((e) => ({
      key: `pay-${e.id}`,
      whenLabel: new Date(e.createdAt).toLocaleString(),
      sortTs: e.createdAt,
      type: e.kind === "shield" ? "Shield deposit" : "Private payment",
      amount: `${e.amount} STRK`,
      statusLabel:
        e.status === "confirmed" ? "Confirmed" : e.status === "failed" ? "Reverted" : "Confirming…",
      statusClass:
        e.status === "confirmed"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : e.status === "failed"
            ? "bg-red-500/15 text-red-700 dark:text-red-400"
            : "bg-blue-500/15 text-blue-700 dark:text-blue-400",
      detail: e.recipient ? `to ${shortHash(e.recipient)}` : undefined,
      link: voyagerTx(e.txHash),
    }));

    // On-chain shields. A local shield entry for the same tx is dropped in
    // favour of the chain row (confirmed status + exact on-chain amount).
    // Local-only shields (still confirming) still render.
    const chainedShieldHashes = new Set(deposits.map((d) => d.txHash.toLowerCase()));
    const paymentRowsFiltered = paymentRows.filter(
      (r, i) =>
        history[i]?.kind !== "shield" ||
        !history[i]?.txHash ||
        !chainedShieldHashes.has(history[i].txHash.toLowerCase()),
    );
    const depositRows: ActivityRow[] = deposits.map((d) => ({
      key: `deposit-${d.txHash}`,
      whenLabel: `Block ${d.blockNumber.toLocaleString()}`,
      sortTs: headApproxTs(d.blockNumber, chainHead),
      type: "Shield deposit",
      amount: `${formatNumber(d.amountRaw)} STRK`,
      statusLabel: "Confirmed",
      statusClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      detail: undefined,
      link: d.txHash ? voyagerTx(d.txHash) : undefined,
    }));

    return [...paymentRowsFiltered, ...depositRows, ...proofRows].sort((a, b) => b.sortTs - a.sortTs);
  }, [proofs, history, deposits, address]);

  if ((loading || !depositsLoaded) && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading activity…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
        <ShieldX className="h-10 w-10 text-destructive/50" />
        <p className="text-sm font-medium">Failed to load activity</p>
        <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
        <Button size="sm" variant="outline" onClick={handleRefresh}>
          Try again
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight">Activity</h2>
            <p className="text-sm text-muted-foreground">
              Your payments and audit records in one place.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No activity yet"
          description="Shield STRK and make your first private payment — it will show up here. Amounts you typed stay on this device."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Activity</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} record{rows.length !== 1 ? "s" : ""} — payments and audit outcomes.
            Amounts you typed stay on this device.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">When</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.whenLabel}</td>
                <td className="px-4 py-3 text-sm font-medium">{r.type}</td>
                <td className="px-4 py-3 text-sm tabular-nums">
                  {r.amount ?? <span className="text-muted-foreground">Private</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={r.statusClass}>
                    {r.statusLabel}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.link && (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
                    >
                      {r.detail ?? "View"} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Audit records are outcomes published to the registry — pass, duplicate, or threshold breach.
        They never contain amounts or counterparties.
      </p>
    </div>
  );
}
