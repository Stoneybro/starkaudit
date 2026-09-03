"use client";

import React, { useState } from "react";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { Loader2, Lock, Unlock, ArrowLeftRight, ShieldX, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MOCK_TRANSACTIONS } from "@/lib/mock";

interface TransactionHistoryProps {
  auditRegistryAddress?: `0x${string}`;
  walletAddress?: `0x${string}`;
}

type DecryptState = "idle" | "decrypting" | "done" | "error";
type DecryptedPayment = { amount: string };

function formatAddress(addr: string) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTimestamp(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransactionHistory({}: TransactionHistoryProps) {
  const { rows, status, error, refetch } = useTransactionHistory();
  const [decryptStates, setDecryptStates] = useState<Record<number, DecryptState>>({});
  const [decryptedPayments, setDecryptedPayments] = useState<Record<number, DecryptedPayment>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    await new Promise((r) => setTimeout(r, 500));
    setIsRefreshing(false);
  };

  const handleDecrypt = async (paymentId: number) => {
    setDecryptStates((s) => ({ ...s, [paymentId]: "decrypting" }));
    await new Promise((r) => setTimeout(r, 800));
    const mock = MOCK_TRANSACTIONS.find((t) => t.paymentId === paymentId);
    setDecryptedPayments((v) => ({ ...v, [paymentId]: { amount: mock?.amountMock ?? "1,000.00 USDC" } }));
    setDecryptStates((s) => ({ ...s, [paymentId]: "done" }));
  };

  const isLoading = status === "loading";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading payments…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
        <ShieldX className="h-10 w-10 text-destructive/50" />
        <p className="text-sm font-medium">Failed to load transactions</p>
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
            <h2 className="text-2xl font-semibold tracking-tight">Transaction History</h2>
            <p className="text-sm text-muted-foreground">
              All onchain payments recorded in your audit registry. <span className="text-amber-600">(mock)</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="shrink-0 gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <EmptyState
          icon={<ArrowLeftRight className="h-5 w-5" />}
          title="No transactions yet"
          description="Your onchain transaction history will appear here after your first payment."
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Transaction History</h2>
          <p className="text-sm text-muted-foreground">
            {rows.length} payment{rows.length !== 1 ? "s" : ""} recorded.
            Encrypted amounts can be decrypted on demand. <span className="text-amber-600">(mock)</span>
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
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const decryptState = decryptStates[row.paymentId] ?? "idle";
              const decrypted = decryptedPayments[row.paymentId];

              return (
                <tr key={row.paymentId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimestamp(row.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.recipient ? formatAddress(row.recipient) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {decrypted ? (
                      <span className="font-mono text-xs text-emerald-600">{decrypted.amount}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Encrypted
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={decryptState === "done" ? "ghost" : "outline"}
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      disabled={decryptState === "decrypting" || decryptState === "done"}
                      onClick={() => handleDecrypt(row.paymentId)}
                    >
                      {decryptState === "decrypting" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : decryptState === "done" ? (
                        <Unlock className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                      {decryptState === "decrypting" ? "Decrypting…" : decryptState === "done" ? "Decrypted" : "Decrypt"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
