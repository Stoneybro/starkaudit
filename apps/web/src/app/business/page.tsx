"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Wallet } from "lucide-react"
import { useWallet } from "@/hooks/useWallet"
import { useProofFeed } from "@/hooks/useProofFeed"
import { getProvider, sameAddress, shortHash } from "@/lib/starknet"
import { formatStrk, getAuditor, getStrkBalance, isRegistered } from "@/lib/registry"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ProofRow } from "@/components/proof-row"

type BusinessInfo = {
  registered: boolean
  balance: string
  auditor: string
}

export default function BusinessPage() {
  const { address, ready, connecting, connect } = useWallet()
  const { proofs, loading: feedLoading } = useProofFeed(ready)
  const [info, setInfo] = useState<BusinessInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const provider = getProvider()
    Promise.all([
      isRegistered(provider, address),
      getStrkBalance(provider, address),
      getAuditor(provider, address),
    ]).then(
      ([registered, balance, auditor]) => {
        if (cancelled) return
        setInfo({ registered, balance: formatStrk(balance), auditor })
        setInfoLoading(false)
      },
      () => {
        if (cancelled) return
        setInfo(null)
        setInfoLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [address])

  const ownProofs = address ? proofs.filter((p) => sameAddress(p.business, address)) : []

  if (!ready) {
    return (
      <div className="container-wide w-full pb-12 pt-8">
        <EmptyState
          icon={<Wallet className="h-5 w-5" />}
          title="Connect your wallet"
          description="The business view shows your registration status and your submitted proofs."
          action={{ label: connecting ? "Connecting\u2026" : "Connect wallet", onClick: connect }}
        />
      </div>
    )
  }

  return (
    <div className="container-wide w-full pb-12 space-y-6 pt-8">
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Business</h2>
        <p className="text-sm text-muted-foreground font-mono">{address}</p>
      </div>

      {infoLoading || !info ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Registration</CardDescription>
              <CardTitle>
                {info.registered ? <Badge variant="success">registered</Badge> : <Badge variant="muted">not registered</Badge>}
              </CardTitle>
            </CardHeader>
            {!info.registered && (
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Call <span className="font-mono">register_business()</span> on the registry to appear here.
                </p>
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Wallet STRK (fees)</CardDescription>
              <CardTitle>{info.balance}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Chosen auditor</CardDescription>
              <CardTitle className="font-mono text-base">{shortHash(info.auditor)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Your proofs</CardTitle>
            <Badge variant="secondary">{ownProofs.length}</Badge>
          </div>
          <CardDescription>Nullifiers submitted under your business address — outcomes only.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {feedLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : ownProofs.length === 0 ? (
            <EmptyState title="No proofs yet" description="Proofs you submit will appear here." />
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {ownProofs.map((p) => (
                <ProofRow key={p.nullifier} proof={p} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <Link href="/auditor" className="underline underline-offset-4">
          Auditor view
        </Link>
      </p>
    </div>
  )
}
