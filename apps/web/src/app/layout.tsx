import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { Providers } from "@/components/providers"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "StarkAudit — Private audit records for Starknet payments",
  description:
    "Businesses attach blinded audit proofs to private STRK20 transfers. Auditors verify pass, fail and duplicate outcomes without ever seeing amounts.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable, "dark font-sans")} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
