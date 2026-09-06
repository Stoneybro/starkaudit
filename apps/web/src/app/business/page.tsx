"use client";

import { useCallback, useEffect, useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Automatic audit proofs are permanently enabled: every registry write below
// bundles `set_relayer(BACKEND)` in the same wallet signature, so the backend
// can always relay `submit_proof_for` for this business. The business wallet
// must sign it (set_relayer is self-serve: it writes relayer_of[caller], so no
// backend script can appoint it for someone else) — hence the multicall here
// instead of an ops script. No UI: there is nothing to enable or disable.
const AUTO_RELAYER =
  process.env.NEXT_PUBLIC_RELAYER_ADDRESS && process.env.NEXT_PUBLIC_RELAYER_ADDRESS.length > 2
    ? (process.env.NEXT_PUBLIC_RELAYER_ADDRESS as string)
    : null;

const viewMeta: Record<AppView, { title: string; description: string }> = {
  settings: { title: "Settings", description: "Manage the auditor who reviews your encrypted records." },
  payments: { title: "Payments", description: "Shield STRK and pay privately." },
  activity: { title: "Activity", description: "Your payments and audit records." },
};

type TxState = { pending: boolean; hash?: string; error?: string };

type RegistryCall = {
  entrypoint: "register_business" | "set_auditor" | "set_relayer";
  calldata: string[];
};

// Every write bundles set_relayer(AUTO_RELAYER) so auto-proofs stay enabled:
// new registrations get it from block one, and the set_auditor path heals
// legacy accounts that registered before this change. Re-writing an
// unchanged relayer is idempotent. set_relayer has no registration gate, so
// bundling it with register_business in one atomic multicall is safe.
function withAutoRelayer(calls: RegistryCall[]): RegistryCall[] {
  if (!AUTO_RELAYER) {
    console.warn("[Business] NEXT_PUBLIC_RELAYER_ADDRESS missing — registry write without auto-relayer.");
    return calls;
  }
  return [...calls, { entrypoint: "set_relayer", calldata: [AUTO_RELAYER] }];
}

export default function BusinessPage() {
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
  const [auditorNavOpen, setAuditorNavOpen] = useState(false);

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
    async (calls: RegistryCall[]) => {
      const account = wallet.getAccount();
      if (!account) {
        setTx({ pending: false, error: "Wallet not connected." });
        return;
      }
      setTx({ pending: true });
      try {
        const res = await account.execute(
          calls.map((c) => ({ contractAddress: REGISTRY_ADDRESS, entrypoint: c.entrypoint, calldata: c.calldata })),
        );
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

  const runRegister = useCallback(
    () => void runTx(withAutoRelayer([{ entrypoint: "register_business", calldata: [] }])),
    [runTx],
  );

  const runSetAuditor = useCallback(
    (addr: string) => void runTx(withAutoRelayer([{ entrypoint: "set_auditor", calldata: [addr] }])),
    [runTx],
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
                onClick={() => setAuditorNavOpen(true)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm border border-border rounded-md px-3 py-1.5 transition-colors"
              >
                Auditor workspace
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {/* Auditor-workspace handoff: the auditor workspace is a separate
            browser tab with its own wallet gate. This dialog names the assigned
            auditor before opening it, so a business wallet session can never
            silently walk into the auditor flow in this tab. */}
        <AlertDialog open={auditorNavOpen} onOpenChange={setAuditorNavOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {auditor ? "Open auditor workspace?" : "No auditor assigned"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {auditor ? (
                  <>
                    You are now going to the auditor workspace for your business.
                    It is meant for your assigned auditor{" "}
                    <span className="font-mono break-all">{auditor}</span> — it
                    opens in a new tab with its own wallet check, and your
                    business workspace stays open here.
                  </>
                ) : (
                  <>
                    There is no auditor workspace to open yet. Add an auditor
                    first from Settings → Auditor Management, then come back
                    here to open their workspace.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{auditor ? "Cancel" : "Got it"}</AlertDialogCancel>
              {auditor && address && (
                <AlertDialogAction
                  onClick={() => {
                    window.open(`/auditor/${address}`, "_blank", "noopener,noreferrer");
                    setAuditorNavOpen(false);
                  }}
                >
                  Open in new tab
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                  onRegister={runRegister}
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
                onSetAuditor={runSetAuditor}
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
                onAuditRelayed={() => {
                  refreshFeed();
                  // The relay tx confirms a few seconds after the API responds.
                  window.setTimeout(() => refreshFeed(), 30_000);
                }}
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
