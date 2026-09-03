import Link from "next/link"
import { shortHash, voyagerTx } from "@/lib/starknet"
import type { ProofRecord } from "@/lib/registry"
import { Badge } from "@/components/ui/badge"

export function ProofBadges({ proof }: { proof: ProofRecord }) {
  return (
    <span className="flex flex-wrap gap-1">
      {proof.pass ? (
        <Badge variant="success">pass</Badge>
      ) : (
        <Badge variant="destructive">fail</Badge>
      )}
      {proof.isDuplicate && <Badge variant="warning">duplicate</Badge>}
      {proof.offchainVerified && <Badge variant="muted">offchain</Badge>}
      {proof.unverifiedBinding && <Badge variant="muted">unverified</Badge>}
    </span>
  )
}

export function ProofRow({ proof }: { proof: ProofRecord }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-sm">{shortHash(proof.nullifier)}</span>
        <span className="text-xs text-muted-foreground">
          business {shortHash(proof.business)} · block {proof.blockNumber}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ProofBadges proof={proof} />
        <Link
          href={voyagerTx(proof.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Voyager ↗
        </Link>
      </div>
    </div>
  )
}
