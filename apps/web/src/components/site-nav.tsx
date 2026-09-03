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
  const { address, connecting, error, connect, connectTo, closePicker, disconnect, ready, showPicker, options } =
    useWallet()

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
        <div className="relative flex items-center gap-2">
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
          {showPicker && (
            <div className="absolute right-0 top-10 w-56 rounded-xl border border-border bg-card p-2 shadow-lg">
              <p className="px-2 py-1 text-xs text-muted-foreground">Choose a Starknet wallet</p>
              {options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => connectTo(o)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted"
                >
                  {o.name}
                  <span className="font-mono text-[10px] text-muted-foreground">{o.id}</span>
                </button>
              ))}
              <button
                onClick={closePicker}
                className="mt-1 w-full rounded-lg px-2 py-2 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="container-wide pb-2 text-xs text-destructive">{error}</p>}
    </header>
  )
}
