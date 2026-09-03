"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Wallet } from "lucide-react"
import { useWallet } from "@/hooks/useWallet"
import { useProofFeed } from "@/hooks/useProofFeed"
import { REGISTRY_ADDRESS, getProvider, sameAddress, shortHash, voyagerTx } from "@/lib/starknet"
import { errMsg } from "@/lib/utils"
import { formatStrk, getAuditor, getStrkBalance, isRegistered } from "@/lib/registry"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ProofRow } from "@/components/proof-row"

type BusinessInfo = {
  registered: boolean
  balance: string
  auditor: string
}

type TxState = {
  pending: boolean
  hash?: string
  error?: string
}

export default function BusinessPage() {
  const { address, ready, connecting, connect, getAccount } = useWallet()
  const { proofs, loading: feedLoading, refresh: refreshFeed } = useProofFeed(ready)
  const [info, setInfo] = useState<BusinessInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [tx, setTx] = useState<TxState>({ pending: false })
  const [auditorInput, setAuditorInput] = useState("")

  useEffect(() => {
    if (!address) return
    const provider = getProvider()
    Promise.all([isRegistered(provider, address), getStrkBalance(provider, address), getAuditor(provider, address)]).then(
      ([registered, balance, auditor]) => {
        setInfo({ registered, balance: formatStrk(balance), auditor })
        setInfoLoading(false)
      },
      () => {
        setInfo(null)
        setInfoLoading(false)
      },
    )
  }, [address])

  const ownProofs = address ? proofs.filter((p) => sameAddress(p.business, address)) : []

  const reloadInfo = useCallback(() => {
    if (!address) return
    const provider = getProvider()
    Promise.all([isRegistered(provider, address), getStrkBalance(provider, address), getAuditor(provider, address)]).then(
      ([registered, balance, auditor]) => {
        setInfo({ registered, balance: formatStrk(balance), auditor })
        setInfoLoading(false)
      },
      () => {
        setInfo(null)
        setInfoLoading(false)
      },
    )
  }, [address])

  const runTx = useCallback(
    async (entrypoint: "register_business" | "set_auditor", calldata: string[]) => {
      const account = getAccount()
      if (!account) {
        setTx({ pending: false, error: "Wallet not connected." })
        return
      }
      setTx({ pending: true })
      try {
        const res = await account.execute({ contractAddress: REGISTRY_ADDRESS, entrypoint, calldata })
        setTx({ pending: true, hash: res.transaction_hash })
        await getProvider().waitForTransaction(res.transaction_hash)
        setTx({ pending: false, hash: res.transaction_hash })
        reloadInfo()
        refreshFeed()
      } catch (e: unknown) {
        setTx({ pending: false, error: errMsg(e, "Transaction failed.") })
      }
    },
    [getAccount, reloadInfo, refreshFeed],
  )

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

      {tx.hash && (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-5 text-sm">
            <span className="text-muted-foreground">
              {tx.pending ? "Transaction submitted — waiting for confirmation\u2026" : "Transaction confirmed"}
            </span>
            <a
              href={voyagerTx(tx.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs underline underline-offset-4"
            >
              {shortHash(tx.hash)} ↗
            </a>
          </CardContent>
        </Card>
      )}
      {tx.error && <p className="text-sm text-destructive">{tx.error}</p>}

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
            {!info.registered ? (
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">Register this wallet as a business on the registry.</p>
                <Button size="sm" disabled={tx.pending} onClick={() => runTx("register_business", [])}>
                  {tx.pending ? "Submitting\u2026" : "Register business"}
                </Button>
              </CardContent>
            ) : (
              <CardContent>
                <p className="text-xs text-muted-foreground">Auditor: {shortHash(info.auditor)}</p>
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
            <CardContent className="flex flex-col gap-2">
              <input
                value={auditorInput}
                onChange={(e) => setAuditorInput(e.target.value)}
                placeholder="0x… auditor address"
                spellCheck={false}
                className="h-9 rounded-xl border border-input bg-transparent px-3 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={tx.pending || auditorInput.trim().length < 3}
                onClick={() => runTx("set_auditor", [auditorInput.trim()])}
              >
                {tx.pending ? "Submitting\u2026" : "Set auditor"}
              </Button>
            </CardContent>
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
