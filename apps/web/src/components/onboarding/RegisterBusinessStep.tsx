"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatNumber } from "@/utils/format";

interface RegisterBusinessStepProps {
  /** Raw STRK balance of the connected wallet, for the fee hint. */
  balanceRaw: bigint | null;
  onRegister: () => void;
  pending: boolean;
  error?: string;
}

/**
 * Step 2 of onboarding — registers the connected wallet as a business on the
 * STRK20 audit registry. The transaction itself is executed by the page.
 */
export function RegisterBusinessStep({ balanceRaw, onRegister, pending, error }: RegisterBusinessStepProps) {
  return (
    <div className="max-w-[460px]">
      <h1 className="text-3xl font-semibold tracking-tight mb-4">Register your business</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        Join the onchain audit registry. Your transfers stay private — only blinded
        proof outcomes are ever recorded.
      </p>
      <div className="mb-8 space-y-2.5">
        {[
          "Blinded STRK20 transfer proofs tied to your address",
          "Outcome records (pass / fail / duplicate) visible to auditors",
          "No amounts or counterparties are ever published",
        ].map((item) => (
          <div key={item} className="flex items-start gap-3 text-base">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{item}</span>
          </div>
        ))}
      </div>
      {balanceRaw !== null && (
        <p className="mb-6 text-sm text-muted-foreground">
          Wallet balance: <span className="font-mono text-foreground">{formatNumber(balanceRaw)} STRK</span>
        </p>
      )}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={onRegister} disabled={pending} className="gap-2">
        {pending ? (
          <>
            <Loader2 className="animate-spin" /> Registering…
          </>
        ) : (
          <>
            Register Business <ArrowRight />
          </>
        )}
      </Button>
    </div>
  );
}
