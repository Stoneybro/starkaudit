"use client";

import * as React from "react";
import { Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WalletOption, WalletState } from "@/hooks/useWallet";

interface ConnectWalletStepProps {
  connect: () => Promise<void>;
  connectTo: (option: WalletOption) => Promise<void>;
  closePicker: () => void;
  state: WalletState;
}

/**
 * Step 1 of onboarding — real Starknet wallet connection.
 * The wallet hook lives in the page so connection state is shared.
 */
export function ConnectWalletStep({ connect, connectTo, closePicker, state }: ConnectWalletStepProps) {
  const { showPicker, options, connecting, error } = state;

  return (
    <div className="max-w-[460px]">
      <h1 className="text-3xl font-semibold tracking-tight mb-4">Connect your wallet</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        StarkAudit reads public registry records only — never your private transfer details.
      </p>

      {showPicker ? (
        <div className="space-y-2">
          {options.map((option: WalletOption) => (
            <button
              key={option.id}
              onClick={() => void connectTo(option)}
              className="h-11 w-full rounded-lg border border-border bg-card px-4 text-left text-base font-medium text-foreground transition-all hover:bg-muted/40 active:scale-[0.98]"
            >
              {option.name}
            </button>
          ))}
          <button
            onClick={closePicker}
            className="h-9 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <Button onClick={() => void connect()} disabled={connecting} className="h-11 px-8 text-base">
          {connecting ? (
            <>
              <Loader2 className="animate-spin" /> Connecting…
            </>
          ) : (
            <>
              <Wallet /> Connect Wallet
            </>
          )}
        </Button>
      )}

      {error && <p className="mt-4 text-sm text-destructive max-w-sm">{error}</p>}
      {!error && !showPicker && (
        <p className="mt-4 text-xs text-muted-foreground">Ready, Argent and Braavos are supported.</p>
      )}
    </div>
  );
}
