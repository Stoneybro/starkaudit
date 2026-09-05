"use client";

import { BarChart3, RefreshCw, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExceptionRecord, ProofRecord } from "@/lib/registry";

interface FeedAnalyticsProps {
  proofs: ProofRecord[];
  exceptions: ExceptionRecord[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}

/**
 * Registry-wide outcome counts for the auditor. Pure tallies of public
 * event records — no encrypted rollups, no decryption step.
 */
export function FeedAnalytics({ proofs, exceptions, loading, error, onRefresh }: FeedAnalyticsProps) {
  const passed = proofs.filter((p) => p.pass).length;
  const failed = proofs.length - passed;
  const duplicates = proofs.filter((p) => p.isDuplicate).length;
  const unverified = proofs.filter((p) => p.unverifiedBinding).length;
  const offchain = proofs.filter((p) => p.offchainVerified).length;
  const passRate = proofs.length === 0 ? 0 : Math.round((passed / proofs.length) * 100);

  const rows = [
    { label: "Total proof records", value: proofs.length },
    { label: "Passed", value: passed },
    { label: "Failed", value: failed },
    { label: "Duplicates flagged", value: duplicates },
    { label: "Unverified bindings", value: unverified },
    { label: "Offchain-verified", value: offchain },
    { label: "Exceptions flagged", value: exceptions.length },
  ];

  if (loading && proofs.length === 0 && exceptions.length === 0 && !error) {
    return (
      <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-8">
      <div className="flex items-start justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Registry-wide outcome tallies across all blinded proof records.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button onClick={onRefresh} disabled={loading} variant="outline" size="icon">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
          <ShieldX className="h-10 w-10 text-destructive/50" />
          <p className="text-sm font-medium">Failed to load analytics</p>
          <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            Try again
          </Button>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              Outcome Tallies
            </h3>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Metric</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right font-mono">{row.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Total proof records: {proofs.length} • Passed: {passed} • Pass rate: {passRate}% • Exceptions: {exceptions.length}
          </p>
        </section>
      )}
    </div>
  );
}
