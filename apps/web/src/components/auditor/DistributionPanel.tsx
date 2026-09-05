"use client";

import { CheckCircle2, Clock, KeyRound, PackageCheck, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import CopyText from "@/components/ui/copy";
import { shortHash } from "@/lib/starknet";

export type DistributionRow = {
  business: string
  hasKey: boolean
  shared: boolean
}

interface DistributionPanelProps {
  version: string | null;
  rows: DistributionRow[];
  loading: boolean;
  error?: string;
  txPending: boolean;
  sharing: string | null;
  shareError?: string;
  onRefresh: () => void;
  onShare: (business: string) => void;
  onShareAll: () => void;
}

/**
 * Sealed threshold distribution — who holds a key, who got the current
 * version's package. Same card language as the Test Suite list.
 * The auditor never handles raw business secrets here, only pubkeys and
 * sealed felts; the numeric threshold stays in the T1 dialog session.
 */
export function DistributionPanel({
  version,
  rows,
  loading,
  error,
  txPending,
  sharing,
  shareError,
  onRefresh,
  onShare,
  onShareAll,
}: DistributionPanelProps) {
  const shareable = rows.filter((r) => r.hasKey && !r.shared).length

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex items-center justify-between gap-4 mb-6 border-b border-border pb-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Distribution</h2>
          <p className="text-sm text-muted-foreground">
            Sealed threshold packages per business — no manual delivery.
            {version !== null ? ` Current version v${version}.` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || txPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={onShareAll} disabled={loading || txPending || shareable === 0}>
            <Send className="h-4 w-4 mr-2" />
            Share all{shareable > 0 ? ` (${shareable})` : ""}
          </Button>
        </div>
      </div>

      {shareError && (
        <Alert variant="destructive">
          <AlertDescription>{shareError}</AlertDescription>
        </Alert>
      )}
      {error && rows.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && rows.length === 0 ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-5 w-5" />}
          title="No businesses yet"
          description="When a business registers, it appears here once it publishes a distribution key."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((row) => {
            const busy = txPending && sharing === row.business
            return (
              <div
                key={row.business}
                className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all hover:shadow-sm"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  <h4 className="text-base font-semibold font-mono flex items-center gap-2">
                    {shortHash(row.business)}
                    <CopyText text={row.business} />
                  </h4>
                  <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
                    {row.hasKey ? (
                      <span className="flex items-center gap-1.5 text-primary font-medium">
                        <KeyRound className="h-3.5 w-3.5" /> Key published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" /> No distribution key — backend must run dist_keygen
                      </span>
                    )}
                    {row.shared ? (
                      <span className="flex items-center gap-1.5 text-primary/70">
                        <PackageCheck className="h-3.5 w-3.5" /> Package v{version} sealed
                      </span>
                    ) : (
                      row.hasKey && (
                        <span className="flex items-center gap-1.5 text-amber-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Package pending
                        </span>
                      )
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0 sm:min-w-[140px] pt-1">
                  <Button
                    variant={row.shared ? "outline" : "default"}
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={!row.hasKey || txPending}
                    onClick={() => onShare(row.business)}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {busy ? "Sealing…" : row.shared ? "Resend" : "Share"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
