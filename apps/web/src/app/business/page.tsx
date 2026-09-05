"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [shieldedRaw, setShieldedRaw] = useState<bigint | null>(null);
  const [shieldedLoading, setShieldedLoading] = useState(false);
  const [tx, setTx] = useState<TxState>({ pending: false });

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

  // Shielded (private STRK20) balance for the sidebar card. Reading it opens a
  // wallet consent prompt, so it must be requested deliberately and exactly
  // once per account: the effect below must not re-fire on re-renders (a fresh
  // prompt per render was seen as an endless "share balance" loop). Failures
  // show "—" rather than nagging the user.
  const shieldedInFlight = useRef(false);
  const shieldedFetchedFor = useRef<string | null>(null);
  const refreshShielded = useCallback(async (force = false) => {
    if (shieldedInFlight.current) return;
    const acct = wallet.getAccount();
    if (!acct || typeof acct.strk20Balances !== "function") return;
    if (!force && shieldedFetchedFor.current === acct.address) return;
    shieldedInFlight.current = true;
    setShieldedLoading(true);
    try {
      const res = await acct.strk20Balances([STRK_ADDRESS]);
      const entry = res.find((b) => b.token.toLowerCase() === STRK_ADDRESS.toLowerCase()) ?? res[0];
      setShieldedRaw(entry ? BigInt(entry.balance) : 0n);
    } catch {
      setShieldedRaw(null);
    } finally {
      // Mark as fetched even on failure (e.g. user rejected the consent
      // prompt) so renders never re-trigger the prompt automatically.
      shieldedFetchedFor.current = acct.address;
      shieldedInFlight.current = false;
      setShieldedLoading(false);
    }
  }, [wallet.getAccount]);

  useEffect(() => {
    if (ready) void refreshShielded();
  }, [ready, refreshShielded]);

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
        onRefreshShielded={() => void refreshShielded(true)}
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
                onClick={() => router.push("/auditor")}
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
                  void refreshShielded(true);
                  // The public RPC can lag the wallet/relayer view of
                  // confirmation, and new shield notes mature ~10 blocks
                  // before the wallet reports them — retry both reads so the
                  // sidebar catches up without a manual refresh.
                  window.setTimeout(() => {
                    reloadInfo();
                    void refreshShielded(true);
                  }, 45_000);
                  window.setTimeout(() => {
                    reloadInfo();
                    void refreshShielded(true);
                  }, 120_000);
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
