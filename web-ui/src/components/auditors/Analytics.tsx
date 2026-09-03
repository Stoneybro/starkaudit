"use client";

import React, { useState } from "react";
import { Loader2, Lock, Unlock, BarChart3, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MOCK_ANALYTICS } from "@/lib/mock";

interface AnalyticsProps {
  auditRegistryAddress: `0x${string}`;
  deployedAtBlock: bigint;
  walletAddress: `0x${string}`;
}

function formatUsdc(v: number) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Analytics({}: AnalyticsProps) {
  const [decrypted, setDecrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleDecryptAll = async () => {
    setIsDecrypting(true);
    await new Promise((r) => setTimeout(r, 900));
    setDecrypted(true);
    setIsDecrypting(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setIsRefreshing(false);
  };

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-8">
      <div className="flex items-start justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Encrypted rollup totals across GL categories and recipients. <span className="text-amber-600">(mock)</span>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={handleRefresh} disabled={isRefreshing || isDecrypting} variant="outline" size="icon">
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={handleDecryptAll} disabled={isDecrypting || decrypted} className="gap-2" variant={decrypted ? "outline" : "default"}>
            {isDecrypting ? <Loader2 className="h-4 w-4 animate-spin" /> : decrypted ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {isDecrypting ? "Decrypting…" : decrypted ? "Decrypted" : "Decrypt All"}
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            GL Category Totals
          </h3>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Category</TableHead>
              <TableHead className="text-right">Total Spent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_ANALYTICS.byCategory.map((cat) => (
              <TableRow key={cat.label}>
                <TableCell className="font-medium">{cat.label}</TableCell>
                <TableCell className="text-right">
                  {decrypted ? (
                    <span className="font-mono text-emerald-600 font-medium">{formatUsdc(cat.value)}</span>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground font-normal">
                      <Lock className="h-3 w-3 mr-1" /> Encrypted
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">Total payments: {MOCK_ANALYTICS.totalPayments} • Flagged: {MOCK_ANALYTICS.flagged} • Pass rate: {MOCK_ANALYTICS.passRate}% (mock)</p>
      </section>
    </div>
  );
}
