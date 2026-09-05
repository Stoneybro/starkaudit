"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuditorSidebar } from "@/components/ui/auditor-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { ConnectWalletStep } from "@/components/onboarding/ConnectWalletStep";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;

/**
 * Auditor landing — deliberately lists NO businesses (UI isolation demo).
 * Each business shares a private link like /auditor/<business-address> with
 * its assigned auditor; that scoped page loads only that business's records
 * and gates writes on get_auditor(business) == connected wallet.
 */
export default function AuditorLandingPage() {
  const router = useRouter();
  const wallet = useWallet();
  const { ready } = wallet;
  const [input, setInput] = useState("");
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const openWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!ADDRESS_RE.test(v)) {
      setFormError("Paste a valid business address (0x…) from the link your client shared.");
      return;
    }
    setFormError(undefined);
    router.push(`/auditor/${v}`);
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <AuditorSidebar
        walletAddress={wallet.address}
        balance={null}
        balanceLoading={false}
        onRefreshBalance={() => {}}
        activeView="findings"
        onNavigate={() => {}}
        isLocked={!ready}
        onDisconnect={ready ? wallet.disconnect : undefined}
      />

      <SidebarInset>
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">Auditor workspace</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col">
          {!ready ? (
            <div className="flex flex-1 flex-col">
              <OnboardingLayout currentStep={1}>
                <ConnectWalletStep
                  connect={wallet.connect}
                  connectTo={wallet.connectTo}
                  closePicker={wallet.closePicker}
                  state={wallet}
                />
              </OnboardingLayout>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-5">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold tracking-tight">Open a client workspace</h2>
                  <p className="text-sm text-muted-foreground">
                    Each business shares a unique auditor link with you. Open it to see only
                    that client&apos;s thresholds, findings and distribution — nothing else.
                  </p>
                </div>
                <form onSubmit={openWorkspace} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Business address</Label>
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="0x…"
                      className="font-mono"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <p className="text-[13px] text-muted-foreground">
                      Or just open the link directly: /auditor/&lt;business-address&gt;.
                      Access is granted to the wallet the business assigned on-chain.
                    </p>
                  </div>
                  {formError && <p className="text-xs text-destructive">{formError}</p>}
                  <Button type="submit" className="w-full">
                    Open workspace
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
