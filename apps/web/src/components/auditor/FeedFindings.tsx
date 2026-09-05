"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, FileSearchCorner, RefreshCw, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { shortHash, voyagerTx } from "@/lib/starknet";
import type { ProofRecord } from "@/lib/registry";

interface FeedFindingsProps {
  proofs: ProofRecord[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
}

function OutcomeBadge({ pass }: { pass: boolean }) {
  return pass ? (
    <Badge className="bg-emerald-500/10 text-emerald-600 border-0">Pass</Badge>
  ) : (
    <Badge className="bg-red-500/10 text-red-600 border-0">Fail</Badge>
  );
}

/**
 * Auditor findings feed — every blinded proof record on the registry with its
 * outcome. Amounts and counterparties are not part of the event payload and
 * are never rendered; there is nothing to decrypt.
 */
export function FeedFindings({ proofs, loading, error, onRefresh }: FeedFindingsProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  if (loading && proofs.length === 0) {
    return (
      <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Findings</h2>
          <p className="text-sm text-muted-foreground">
            {error
              ? "Could not load registry events."
              : `${proofs.length} blinded proof record${proofs.length !== 1 ? "s" : ""} in the registry. Outcomes only — no amounts.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="shrink-0 gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
          <ShieldX className="h-10 w-10 text-destructive/50" />
          <p className="text-sm font-medium">Failed to load findings</p>
          <p className="text-xs text-muted-foreground max-w-sm">{error}</p>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            Try again
          </Button>
        </div>
      ) : proofs.length === 0 ? (
        <EmptyState
          icon={<FileSearchCorner className="h-5 w-5" />}
          title="No findings yet"
          description="When a blinded transfer proof is recorded onchain, it will appear here."
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nullifier</th>
                <th className="text-left px-4 py-3 font-medium">Outcome</th>
                <th className="text-left px-4 py-3 font-medium">Flags</th>
                <th className="text-left px-4 py-3 font-medium">Block</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proofs.map((f, i) => {
                const isExpanded = expanded.has(i);
                return (
                  <React.Fragment key={f.nullifier}>
                    <tr className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">{shortHash(f.nullifier)}</td>
                      <td className="px-4 py-3"><OutcomeBadge pass={f.pass} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {f.isDuplicate && (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/30">Duplicate</Badge>
                          )}
                          {f.unverifiedBinding && (
                            <Badge variant="outline" className="text-muted-foreground">Unverified binding</Badge>
                          )}
                          {f.offchainVerified && (
                            <Badge variant="outline" className="text-sky-600 border-sky-500/30">Offchain verified</Badge>
                          )}
                          {!f.isDuplicate && !f.unverifiedBinding && !f.offchainVerified && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{f.blockNumber}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => toggle(i)}
                          >
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {isExpanded ? "Collapse" : "Details"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            render={
                              <a href={voyagerTx(f.txHash)} target="_blank" rel="noopener noreferrer" />
                            }
                          >
                            Voyager <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/10">
                        <td colSpan={5} className="px-6 py-4 text-xs">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-muted-foreground uppercase text-[10px]">Nullifier</p>
                              <p className="font-mono break-all">{f.nullifier}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground uppercase text-[10px]">Transaction</p>
                              <p className="font-mono break-all">{shortHash(f.txHash)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground uppercase text-[10px]">Recorded</p>
                              <p>Block {f.blockNumber}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
