"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ExternalLink, Loader2, RefreshCw, ShieldX, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { sameAddress, shortHash, voyagerTx } from "@/lib/starknet";
import { getProvider } from "@/lib/starknet";
import { type ProofRecord } from "@/lib/registry";
import {
  fetchChainActivity,
  isValidStarknetAddress,
  loadExtraAddresses,
  loadPayments,
  saveExtraAddresses,
  type ChainPrivateTx,
  type PoolDeposit,
} from "@/lib/payments";
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
  // On-chain activity from STRK Transfer events — the source of truth for
  // shielding AND transfer history (shows everything an owned wallet did, even
  // txs the wallet never returned a hash for). Transfer amounts stay
  // "Private": they are encrypted on-chain, so the chain row only proves the
  // payment happened. Fetched on mount, manual refresh, address changes, and
  // every payments-changed signal from the Payments panel.
  const [deposits, setDeposits] = useState<PoolDeposit[]>([]);
  const [chainTxs, setChainTxs] = useState<ChainPrivateTx[]>([]);
  const [depositsLoaded, setDepositsLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Extra addresses the user controls from the same private key (a relayer or
  // backend account, a second account contract in their wallet, …). The chain
  // scan runs over the connected wallet PLUS these, so shields and private
  // transfers sent from any owned account appear here.
  const [extraAddresses, setExtraAddresses] = useState<string[]>(() =>
    typeof window !== "undefined" ? loadExtraAddresses() : [],
  );
  const [addressDraft, setAddressDraft] = useState("");
  const [addressError, setAddressError] = useState<string | undefined>(undefined);
  const [showAddresses, setShowAddresses] = useState(false);

  const cancelledRef = useRef(false);
  const extrasRef = useRef(extraAddresses);

  // Keep the owned-address list the scan reads in line with the rendered one.
  useEffect(() => {
    extrasRef.current = extraAddresses;
  }, [extraAddresses]);

  const loadChain = useCallback((list?: string[]) => {
    const owned = list ?? extrasRef.current;
    setDepositsLoaded(false);
    try {
      void fetchChainActivity(getProvider(), address, owned)
        .then(({ shields, privateTxs }) => {
          if (!cancelledRef.current) {
            setDeposits(shields);
            setChainTxs(privateTxs);
            setDepositsLoaded(true);
          }
        })
        .catch(() => {
          // RPC failure — local entries still render.
          if (!cancelledRef.current) setDepositsLoaded(true);
        });
    } catch {
      // Missing RPC URL — local entries still render.
      if (!cancelledRef.current) setDepositsLoaded(true);
    }
  }, [address]);

  useEffect(() => {
    cancelledRef.current = false;
    // Initial history + chain reads are deferred (not synchronous setState
    // inside the effect body); the interval and events keep them fresh.
    const refreshHistory = () => setHistory(loadPayments(address));
    const t0 = window.setTimeout(refreshHistory, 0);
    const t1 = window.setTimeout(() => loadChain(), 0);
    const t = setInterval(refreshHistory, 15000);
    // PaymentsPanel dispatches this after every save (submit, confirm,
    // recovery) and after a wallet timeout (delayed rescan signal), so new
    // rows — including chain activity the wallet never returned a hash for —
    // appear without a manual refresh.
    const onChanged = () => {
      refreshHistory();
      loadChain();
    };
    window.addEventListener("starkaudit:payments-changed", onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      cancelledRef.current = true;
      clearTimeout(t0);
      clearTimeout(t1);
      clearInterval(t);
      window.removeEventListener("starkaudit:payments-changed", onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [address, loadChain]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh();
    setHistory(loadPayments(address));
    try {
      const { shields, privateTxs } = await fetchChainActivity(getProvider(), address, extrasRef.current);
      setDeposits(shields);
      setChainTxs(privateTxs);
    } catch {
      // keep previous chain rows on RPC failure
    }
    await new Promise((r) => setTimeout(r, 500));
    setIsRefreshing(false);
  };
const addOwnedAddress = () => {
    const v = addressDraft.trim().toLowerCase();
    if (!isValidStarknetAddress(v)) {
      setAddressError("Enter a valid 0x Starknet address (1–64 hex characters).");
      return;
    }
    if (sameAddress(v, address)) {
      setAddressError("That's the connected wallet address — already scanned.");
      return;
    }
    if (extraAddresses.some((a) => sameAddress(a, v))) {
      setAddressError("That address is already listed.");
      return;
    }
    const next = [...extraAddresses, v];
    setExtraAddresses(next);
    saveExtraAddresses(next);
    setAddressDraft("");
    setAddressError(undefined);
    loadChain(next);
  };

  const removeOwnedAddress = (a: string) => {
    const next = extraAddresses.filter((x) => !sameAddress(x, a));
    setExtraAddresses(next);
    saveExtraAddresses(next);
    loadChain(next);
  };

  const renderHeaderActions = () => (
    <div className="flex items-center gap-2">
      <Popover open={showAddresses} onOpenChange={setShowAddresses}>
        <PopoverTrigger render={<Button variant="outline" size="sm" />} className="gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Addresses
          {extraAddresses.length > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 text-[10px] font-semibold text-primary">
              {extraAddresses.length}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Owned addresses</PopoverTitle>
            <PopoverDescription>
              Extra accounts from the same private key (e.g. your relayer). Their public STRK legs
              are scanned too, so shields and private transfers sent from any owned address appear
              here.
            </PopoverDescription>
          </PopoverHeader>
          {extraAddresses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No extra addresses yet.</p>
          ) : (
            extraAddresses.map((a) => (
              <div
                key={a}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5"
              >
                <span className="truncate font-mono text-xs text-muted-foreground">{shortHash(a)}</span>
                <button
                  onClick={() => removeOwnedAddress(a)}
                  aria-label={`Remove ${a}`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
          <div className="flex gap-2">
            <Input
              value={addressDraft}
              onChange={(e) => setAddressDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addOwnedAddress();
              }}
              placeholder="0x…"
              className="font-mono text-xs"
            />
            <Button size="sm" variant="outline" onClick={addOwnedAddress}>
              Add
            </Button>
          </div>
          {addressError && <p className="text-xs text-destructive">{addressError}</p>}
          <p className="text-xs text-muted-foreground">
            Amounts and recipients of private transfers stay encrypted on-chain; only transfers sent
            from a listed address are shown.
          </p>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0 gap-1.5">
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>
  );

  const rows = useMemo<ActivityRow[]>(() => {
    const myProofs = proofs.filter((p) => sameAddress(p.business, address));
    const headBlock = myProofs.reduce((m, p) => Math.max(m, p.blockNumber), 0);
    const chainHead = chainTxs.reduce(
      (m, t) => Math.max(m, t.blockNumber),
      deposits.reduce((m, d) => Math.max(m, d.blockNumber), headBlock),
    );

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

    // On-chain private pool interactions that have NO local entry (the wallet
    // never returned a hash — timeouts — or another device made them). These
    // are the transfer counterparts of the shield rows above: the tx provably
    // called the pool and was not a shield, but amounts/recipients are
    // encrypted, so they render as amount-Private. Local entries (which know
    // the typed amount/recipient) always win for the same tx.
    const localTxHashes = new Set(
      history.filter((e) => e.txHash).map((e) => e.txHash.toLowerCase()),
    );
    const chainTransferRows: ActivityRow[] = chainTxs
      .filter((t) => !localTxHashes.has(t.txHash.toLowerCase()))
      .map((t) => ({
        key: `chaintx-${t.txHash}`,
        whenLabel: `Block ${t.blockNumber.toLocaleString()}`,
        sortTs: headApproxTs(t.blockNumber, chainHead),
        type: "Private payment",
        amount: null,
        statusLabel:
          t.status === "confirmed" ? "Confirmed" : t.status === "failed" ? "Reverted" : "Confirming…",
        statusClass:
          t.status === "confirmed"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            : t.status === "failed"
              ? "bg-red-500/15 text-red-700 dark:text-red-400"
              : "bg-blue-500/15 text-blue-700 dark:text-blue-400",
        detail: shortHash(t.txHash),
        link: voyagerTx(t.txHash),
      }));

    return [...paymentRowsFiltered, ...depositRows, ...chainTransferRows, ...proofRows].sort((a, b) => b.sortTs - a.sortTs);
  }, [proofs, history, deposits, chainTxs, address]);

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
          {renderHeaderActions()}
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
        {renderHeaderActions()}
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
