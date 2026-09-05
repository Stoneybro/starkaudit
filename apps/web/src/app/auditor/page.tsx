"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditorSidebar, type AuditorAppView } from "@/components/ui/auditor-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { ConnectWalletStep } from "@/components/onboarding/ConnectWalletStep";
import { ThresholdsPanel } from "@/components/auditor/ThresholdsPanel";
import { FeedFindings } from "@/components/auditor/FeedFindings";
import { FeedAnalytics } from "@/components/auditor/FeedAnalytics";
import { useWallet } from "@/hooks/useWallet";
import { useProofFeed } from "@/hooks/useProofFeed";
import { REGISTRY_ADDRESS, getProvider } from "@/lib/starknet";
import { errMsg } from "@/lib/utils";
import { formatStrk, getDuplicateWindow, getStrkBalance, getThreshold } from "@/lib/registry";

const viewMeta: Record<AuditorAppView, { title: string }> = {
  tests:     { title: "Tests" },
  findings:  { title: "Findings" },
  analytics: { title: "Analytics" },
};

export default function AuditorPage() {
  const wallet = useWallet();
  const { address, ready } = wallet;
  const { proofs, exceptions, loading, error, refresh } = useProofFeed(ready);

  const [activeView, setActiveView] = useState<AuditorAppView>("findings");
  const [threshold, setThreshold] = useState<{ commitment: string; version: string } | null>(null);
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdError, setThresholdError] = useState<string | undefined>(undefined);
  const [windowSeconds, setWindowSeconds] = useState<string | null>(null);
  const [windowLoading, setWindowLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [txHash, setTxHash] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | undefined>(undefined);

  const reloadBalance = useCallback(() => {
    if (!address) return;
    setBalanceLoading(true);
    getStrkBalance(getProvider(), address).then(
      (b) => {
        setBalance(formatStrk(b));
        setBalanceLoading(false);
      },
      () => setBalanceLoading(false),
    );
  }, [address]);

  const reloadThreshold = useCallback(() => {
    setThresholdLoading(true);
    setThresholdError(undefined);
    getThreshold(getProvider()).then(
      (t) => {
        setThreshold(t);
        setThresholdLoading(false);
      },
      (e: unknown) => {
        setThresholdError(e instanceof Error ? e.message.slice(0, 200) : "Failed to load threshold.");
        setThresholdLoading(false);
      },
    );
  }, []);

  const reloadWindow = useCallback(() => {
    setWindowLoading(true);
    getDuplicateWindow(getProvider()).then(
      (w) => {
        setWindowSeconds(w);
        setWindowLoading(false);
      },
      () => {
        setWindowSeconds(null);
        setWindowLoading(false);
      },
    );
  }, []);

  const reloadTests = useCallback(() => {
    reloadThreshold();
    reloadWindow();
  }, [reloadThreshold, reloadWindow]);

  const runAuditorTx = useCallback(
    async (entrypoint: "set_threshold_commitment" | "set_duplicate_window" | "flag_exception", calldata: string[]) => {
      const account = wallet.getAccount();
      if (!account) {
        setTxError("Wallet not connected.");
        return;
      }
      setTxPending(true);
      setTxError(undefined);
      setTxHash(undefined);
      try {
        const res = await account.execute({ contractAddress: REGISTRY_ADDRESS, entrypoint, calldata });
        setTxHash(res.transaction_hash);
        await getProvider().waitForTransaction(res.transaction_hash);
        reloadTests();
        refresh();
      } catch (e: unknown) {
        setTxError(errMsg(e, "Transaction failed. Only the registry auditor can update tests (NOT_AUDITOR otherwise)."));
      } finally {
        setTxPending(false);
      }
    },
    [wallet, reloadTests, refresh],
  );

  useEffect(() => {
    reloadBalance();
    reloadTests();
  }, [reloadBalance, reloadTests]);

  // Web-ui (protected) pattern: dashboard shell always rendered; the
  // connect-wallet step lives inside it with the nav locked until connected.
  const isDashboardReady = ready;
  const meta = viewMeta[activeView];

  return (
    <SidebarProvider defaultOpen={true}>
      <AuditorSidebar
        walletAddress={address}
        balance={balance}
        balanceLoading={balanceLoading}
        onRefreshBalance={reloadBalance}
        activeView={activeView}
        onNavigate={setActiveView}
        isLocked={!isDashboardReady}
        onDisconnect={ready ? wallet.disconnect : undefined}
      />

      <SidebarInset>
        {/* Top header bar — always visible */}
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />

          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className=" font-medium text-muted-foreground">
                  Auditor workspace
                </span>
                {isDashboardReady && <span className="text-muted-foreground/40 font-light">/</span>}
              </div>
              {isDashboardReady && (
                <h1 className="font-semibold  tracking-tight text-foreground">
                  {meta.title}
                </h1>
              )}
            </div>
          </div>
        </header>

        {/* Content area */}
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
          <div className="flex flex-1 flex-col px-6 py-4">
            <div className={activeView === "tests" ? "block" : "hidden"}>
              <ThresholdsPanel
                threshold={threshold}
                loading={thresholdLoading}
                error={thresholdError}
                windowSeconds={windowSeconds}
                windowLoading={windowLoading}
                txPending={txPending}
                txHash={txHash}
                txError={txError}
                onRefresh={reloadTests}
                onSetThreshold={(commitment) => void runAuditorTx("set_threshold_commitment", [commitment])}
                onSetWindow={(seconds) => void runAuditorTx("set_duplicate_window", [seconds])}
                onFlagException={(nullifier) => void runAuditorTx("flag_exception", [nullifier])}
              />
            </div>

            <div className={activeView === "findings" ? "block" : "hidden"}>
              <FeedFindings proofs={proofs} loading={loading} error={error} onRefresh={refresh} />
            </div>

            <div className={activeView === "analytics" ? "block" : "hidden"}>
              <FeedAnalytics proofs={proofs} exceptions={exceptions} loading={loading} error={error} onRefresh={refresh} />
            </div>
          </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
