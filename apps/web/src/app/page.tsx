"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ShieldCheck, EyeOff, GitBranch } from "lucide-react"
import { useWallet } from "@/hooks/useWallet"
import { IS_MAINNET, POOL_ADDRESS, REGISTRY_ADDRESS, getProvider, shortHash } from "@/lib/starknet"
import { getThreshold } from "@/lib/registry"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  const { ready, connecting, connect } = useWallet()
  const [threshold, setThreshold] = useState<{ commitment: string; version: string } | null>(null)

  useEffect(() => {
    getThreshold(getProvider())
      .then(setThreshold)
      .catch(() => {})
  }, [])

  return (
    <div className="w-full">
      <div className="technical-grid border-b border-border">
        <div className="container-wide py-20 md:py-28">
          <div className="flex items-center gap-2 pb-6">
            <Badge variant="secondary">{IS_MAINNET ? "SN_MAIN" : "SN_SEPOLIA"}</Badge>
            <Badge variant="muted">STRK20 privacy pool</Badge>
          </div>
          <h1 className="heading-xl max-w-3xl">Private payments, provable compliance.</h1>
          <p className="body-md text-subtle max-w-2xl pt-4">
            StarkAudit attaches blinded audit proofs to private transfers. Auditors see pass, fail and
            duplicate outcomes — amounts stay hidden behind zero-knowledge proofs.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-8">
            {ready ? (
              <>
                <Link href="/auditor">
                  <Button size="lg">Open auditor view</Button>
                </Link>
                <Link href="/business">
                  <Button size="lg" variant="outline">
                    Open business view
                  </Button>
                </Link>
              </>
            ) : (
              <Button size="lg" onClick={connect} disabled={connecting}>
                {connecting ? "Connecting\u2026" : "Connect Starknet wallet"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container-wide grid gap-4 py-12 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Nothing revealed</CardTitle>
            <CardDescription>
              Events carry nullifiers and boolean flags. No amount, counterparty or note payload ever touches the
              chain.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Duplicates caught</CardTitle>
            <CardDescription>
              Deterministic payment commitments flag repeat payments inside the detection window.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Auditor verified</CardTitle>
            <CardDescription>
              Threshold commitments are versioned on-chain; auditors re-verify every claim off-chain.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="container-wide pb-16">
        <Card>
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <CardDescription>Sepolia testnet contracts.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-muted-foreground">AuditRegistry</span>
              <span className="font-mono">{shortHash(REGISTRY_ADDRESS)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-muted-foreground">Privacy pool</span>
              <span className="font-mono">{shortHash(POOL_ADDRESS)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-muted-foreground">Threshold version</span>
              <span className="font-mono">{threshold ? `v${threshold.version}` : "\u2026"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
