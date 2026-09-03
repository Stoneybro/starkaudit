"use client"

import Link from "next/link"
import { FileSearchCorner, ShieldCheck, TriangleAlert, Copy, CheckCheck } from "lucide-react"
import { useProofFeed } from "@/hooks/useProofFeed"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ProofRow } from "@/components/proof-row"

export default function AuditorPage() {
  const { proofs, exceptions, loading, error, updatedAt, refresh } = useProofFeed()

  const fails = proofs.filter((p) => !p.pass && !p.isDuplicate)
  const duplicates = proofs.filter((p) => p.isDuplicate)
  const passes = proofs.filter((p) => p.pass && !p.isDuplicate)

  return (
    <div className="container-wide w-full pb-12 space-y-6 pt-8">
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Auditor workspace</h2>
            <p className="text-sm text-muted-foreground">
              Live <span className="font-mono">ProofSubmitted</span> feed — outcomes only, never amounts.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? "Loading\u2026" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && proofs.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader>
              <CardDescription>Total proofs</CardDescription>
              <CardTitle className="text-3xl">{proofs.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Passing</CardDescription>
              <CardTitle className="text-3xl text-emerald-600 dark:text-emerald-400">{passes.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Failing</CardDescription>
              <CardTitle className="text-3xl text-destructive">{fails.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Duplicates</CardDescription>
              <CardTitle className="text-3xl text-amber-600 dark:text-amber-400">{duplicates.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-destructive" />
            <CardTitle>Fails</CardTitle>
            <Badge variant="destructive">{fails.length}</Badge>
          </div>
          <CardDescription>Threshold-fail claims (fresh nullifiers).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {fails.length === 0 ? (
            <EmptyState
              icon={<CheckCheck className="h-5 w-5" />}
              title="No failures"
              description="Failing proofs will appear here."
            />
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {fails.map((p) => (
                <ProofRow key={p.nullifier} proof={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-amber-600" />
            <CardTitle>Duplicates</CardTitle>
            <Badge variant="warning">{duplicates.length}</Badge>
          </div>
          <CardDescription>Same payment commitment seen inside the detection window.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {duplicates.length === 0 ? (
            <EmptyState
              icon={<Copy className="h-5 w-5" />}
              title="No duplicates"
              description="Repeat payments will appear here."
            />
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {duplicates.map((p) => (
                <ProofRow key={p.nullifier} proof={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <CardTitle>Exceptions</CardTitle>
            <Badge variant="secondary">{exceptions.length}</Badge>
          </div>
          <CardDescription>Manually flagged nullifiers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {exceptions.length === 0 ? (
            <EmptyState
              icon={<FileSearchCorner className="h-5 w-5" />}
              title="No exceptions"
              description="Auditor-flagged nullifiers will appear here."
            />
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {exceptions.map((e) => (
                <div key={e.nullifier} className="flex items-center justify-between px-4 py-3">
                  <span className="font-mono text-sm">{e.nullifier.slice(0, 10)}\u2026{e.nullifier.slice(-4)}</span>
                  <span className="text-xs text-muted-foreground">block {e.blockNumber}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {updatedAt && (
        <p className="text-xs text-muted-foreground">
          Updated {new Date(updatedAt).toLocaleTimeString()} ·{" "}
          <Link href="/business" className="underline underline-offset-4">
            Business view
          </Link>
        </p>
      )}
    </div>
  )
}
