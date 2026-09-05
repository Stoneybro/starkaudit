"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { AppSidebar, type AppView } from "@/components/ui/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { OnboardingSkeleton } from "@/components/onboarding/OnboardingSkeleton";
import { ConnectWalletStep } from "@/components/onboarding/ConnectWalletStep";
import { RegisterBusinessStep } from "@/components/onboarding/RegisterBusinessStep";
import { AuditorPanel } from "@/components/business/AuditorPanel";
import { PaymentsPanel } from "@/components/business/PaymentsPanel";
import { ActivityPanel } from "@/components/business/ActivityPanel";
import { useWallet } from "@/hooks/useWallet";
import { useProofFeed } from "@/hooks/useProofFeed";
import { REGISTRY_ADDRESS, getProvider } from "@/lib/starknet";
import { STRK_ADDRESS } from "@/lib/payments";
import { errMsg } from "@/lib/utils";
import { formatStrk, getAuditor, getStrkBalance, isRegistered } from "@/lib/registry";
import { formatNumber } from "@/utils/format";

const viewMeta: Record<AppView, { title: string; description: string }> = {
  settings: { title: "Settings", description: "Manage the auditor who reviews your encrypted records." },
  payments: { title: "Payments", description: "Shield STRK and pay privately." },
  activity: { title: "Activity", description: "Your payments and audit records." },
};

type TxState = { pending: boolean; hash?: string; error?: string };

export default function BusinessPage() {
  const router = useRouter();
  const wallet = useWallet();
  const { address, ready } = wallet;
  const { proofs, loading: feedLoading, error: feedError, refresh: refreshFeed } = useProofFeed(ready);

  const [activeView, setActiveView] = useState<AppView>("settings");
  const [statusLoading, setStatusLoading] = useState(true);
  // Distinguishes "chain says not registered" (show onboarding step 2) from
  // "the is_registered call failed" (show a retryable error) — a silent RPC
  // failure must never send a registered user back through onboarding.
  const [statusError, setStatusError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [auditor, setAuditor] = useState<string | null>(null);
  const [balanceRaw, setBalanceRaw] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [tx, setTx] = useState<TxState>({ pending: false });

  // Shielded (private STRK20) balance via TanStack Query. Reading it opens a
  // wallet consent prompt, so the query is deliberately quiet: it fetches once
  // when the wallet becomes ready and thereafter only on deliberate actions
  // (sidebar refresh button, post-confirm). No refetch on window focus,
  // reconnect, remount, or interval — tab switches never prompt.
  const shieldedQuery = useQuery({
    queryKey: ["shielded-balance", address],
    queryFn: async (): Promise<bigint | null> => {
      const acct = wallet.getAccount();
      if (!acct || typeof acct.strk20Balances !== "function") return null;
      try {
        const res = await acct.strk20Balances([STRK_ADDRESS]);
        const entry = res.find((b) => b.token.toLowerCase() === STRK_ADDRESS.toLowerCase()) ?? res[0];
        return entry ? BigInt(entry.balance) : 0n;
      } catch {
        // Consent rejected or wallet unreachable — show "—" until the user
        // deliberately refreshes. Never auto-retry (that would re-prompt).
        return null;
      }
    },
    enabled: ready && !!address,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
  });
  const shieldedRaw = shieldedQuery.data ?? null;
  const shieldedLoading = shieldedQuery.isFetching;

  const reloadInfo = useCallback(() => {
    if (!address) return;
    setBalanceLoading(true);
    const provider = getProvider();
    Promise.all([isRegistered(provider, address), getStrkBalance(provider, address), getAuditor(provider, address)])
      .then(([reg, bal, aud]) => {
        setRegistered(reg);
        setBalanceRaw(bal);
        setAuditor(aud === "0x0" ? null : aud);
        setStatusLoading(false);
        setBalanceLoading(false);
        setStatusError(null);
      })
      .catch((e: unknown) => {
        // Keep the previous registered value — a failed RPC call says nothing
        // about registration. Surface the error instead of onboarding.
        setStatusError(errMsg(e, "Could not reach Starknet to verify your registration."));
        setStatusLoading(false);
        setBalanceLoading(false);
      });
  }, [address]);

  useEffect(() => {
    reloadInfo();
  }, [reloadInfo]);

  const runTx = useCallback(
    async (entrypoint: "register_business" | "set_auditor", calldata: string[]) => {
      const account = wallet.getAccount();
      if (!account) {
        setTx({ pending: false, error: "Wallet not connected." });
        return;
      }
      setTx({ pending: true });
      try {
        const res = await account.execute({ contractAddress: REGISTRY_ADDRESS, entrypoint, calldata });
        setTx({ pending: true, hash: res.transaction_hash });
        await getProvider().waitForTransaction(res.transaction_hash);
        setTx({ pending: false, hash: res.transaction_hash });
        reloadInfo();
        refreshFeed();
      } catch (e: unknown) {
        setTx({ pending: false, error: errMsg(e, "Transaction failed.") });
      }
    },
    [wallet, reloadInfo, refreshFeed],
  );

  // Web-ui (protected) pattern: the dashboard shell (sidebar + header) is always
  // rendered; connect/onboarding happens inside it with the nav locked.
  const isDashboardReady = ready && !statusLoading && registered;
  const meta = viewMeta[activeView];

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        walletAddress={address}
        balance={balanceRaw !== null ? formatStrk(balanceRaw) : null}
        balanceLoading={balanceLoading}
        onRefreshBalance={reloadInfo}
        shieldedBalance={shieldedRaw !== null ? formatNumber(shieldedRaw) : null}
        shieldedLoading={shieldedLoading}
        onRefreshShielded={() => void shieldedQuery.refetch()}
        activeView={activeView}
        onNavigate={setActiveView}
        isLocked={!isDashboardReady}
        onDisconnect={ready ? wallet.disconnect : undefined}
      />

      <SidebarInset>
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />

          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className=" font-medium text-muted-foreground">
                  Business workspace
                </span>
                {isDashboardReady && <span className="text-muted-foreground/40 font-light">/</span>}
              </div>
              {isDashboardReady && (
                <h1 className="font-semibold  tracking-tight text-foreground">
                  {meta.title}
                </h1>
              )}
            </div>

            {isDashboardReady && (
              <button
                onClick={() => router.push(`/auditor/${address}`)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-1.5 transition-colors"
              >
                Auditor workspace
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
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
          ) : statusLoading ? (
            <OnboardingSkeleton />
          ) : !registered && statusError ? (
            // RPC failure, not "unregistered" — never show onboarding here.
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md w-full rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
                <p className="font-semibold text-foreground">Couldn&apos;t verify your registration</p>
                <p className="text-sm text-muted-foreground">{statusError}</p>
                <p className="text-sm text-muted-foreground">
                  Your registration lives on-chain and is never lost by a failed connection — this is
                  a network issue, not an account issue.
                </p>
                <button
                  onClick={reloadInfo}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              </div>
            </div>
          ) : !registered ? (
            <div className="flex flex-1 flex-col">
              <OnboardingLayout currentStep={2}>
                <RegisterBusinessStep
                  balanceRaw={balanceRaw}
                  onRegister={() => void runTx("register_business", [])}
                  pending={tx.pending}
                  error={tx.error}
                />
              </OnboardingLayout>
            </div>
          ) : (
          <div className="flex flex-1 flex-col px-6 py-4">
            <div className={activeView === "settings" ? "block" : "hidden"}>
              <AuditorPanel
                businessAddress={address!}
                auditor={auditor}
                txPending={tx.pending}
                txHash={tx.hash}
                txError={tx.error}
                onSetAuditor={(addr) => void runTx("set_auditor", [addr])}
              />
            </div>

            <div className={activeView === "payments" ? "block" : "hidden"}>
              <PaymentsPanel
                address={address!}
                getAccount={wallet.getAccount}
                walletObject={wallet.wallet}
                shieldedRaw={shieldedRaw}
                onPublicBalanceChanged={() => {
                  reloadInfo();
                  // The public RPC can lag the wallet/relayer view of
                  // confirmation — retry the RPC-only read so the sidebar
                  // catches up without a manual refresh. No wallet reads here
                  // (those prompt for consent).
                  window.setTimeout(() => reloadInfo(), 45_000);
                  window.setTimeout(() => reloadInfo(), 120_000);
                }}
                onShieldedBalanceChanged={() => void shieldedQuery.refetch()}
              />
            </div>

            <div className={activeView === "activity" ? "block" : "hidden"}>
              <ActivityPanel
                address={address!}
                proofs={proofs}
                loading={feedLoading}
                error={feedError}
                onRefresh={refreshFeed}
              />
            </div>
          </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
