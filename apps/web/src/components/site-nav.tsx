"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWallet } from "@/hooks/useWallet"
import { shortHash } from "@/lib/starknet"

const links = [
  { href: "/", label: "Overview" },
  { href: "/auditor", label: "Auditor" },
  { href: "/business", label: "Business" },
]

export function SiteNav() {
  const pathname = usePathname()
  const { address, connecting, error, connect, disconnect, ready } = useWallet()

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="container-wide flex h-14 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <ShieldCheck className="h-5 w-5" />
            StarkAudit
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  pathname === l.href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {ready ? (
            <>
              <span className="hidden sm:inline rounded-4xl bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {address ? shortHash(address) : ""}
              </span>
              <button
                onClick={disconnect}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
            >
              {connecting ? "Connecting\u2026" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="container-wide pb-2 text-xs text-destructive">{error}</p>}
    </header>
  )
}
