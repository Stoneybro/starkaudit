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
import { DistributionPanel, type DistributionRow } from "@/components/auditor/DistributionPanel";
import { FeedFindings } from "@/components/auditor/FeedFindings";
import { FeedAnalytics } from "@/components/auditor/FeedAnalytics";
import { useWallet } from "@/hooks/useWallet";
import { useProofFeed } from "@/hooks/useProofFeed";
import { REGISTRY_ADDRESS, getProvider } from "@/lib/starknet";
import { errMsg } from "@/lib/utils";
import {
  fetchRegisteredBusinesses,
  formatStrk,
  getDistributionKey,
  getDuplicateWindow,
  getStrkBalance,
  getThreshold,
  hasThresholdPackage,
} from "@/lib/registry";
import { joinPubkey, sealThresholdPackage } from "@/lib/distribution";

type AuditorEntrypoint =
  | "set_threshold_commitment"
  | "set_duplicate_window"
  | "flag_exception"
  | "share_threshold_package";

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
  // Last committed (threshold, salt) of this browser session — in-memory only,
  // used to seal packages. Re-enter via Configure after reload.
  const [sessionSecrets, setSessionSecrets] = useState<{ wei: string; salt: string } | null>(null);
  const [distRows, setDistRows] = useState<DistributionRow[]>([]);
  const [distLoading, setDistLoading] = useState(false);
  const [distError, setDistError] = useState<string | undefined>(undefined);
  const [sharing, setSharing] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | undefined>(undefined);

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
    async (entrypoint: AuditorEntrypoint, calldata: string[]) => {
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

  // Distribution: businesses with keys + package status for the live version.
  const reloadDistribution = useCallback(async () => {
    setDistLoading(true);
    setDistError(undefined);
    try {
      const provider = getProvider();
      const [registered, t] = await Promise.all([
        fetchRegisteredBusinesses(provider).catch(() => [] as string[]),
        getThreshold(provider),
      ]);
      const fromProofs = proofs.map((p) => p.business);
      const all = [...registered, ...fromProofs];
      const seen = new Set<string>();
      const businesses = all.filter((b) => {
        const k = b.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const rows: DistributionRow[] = await Promise.all(
        businesses.map(async (business) => {
          const [key, shared] = await Promise.all([
            getDistributionKey(provider, business),
            t.version === "0" ? Promise.resolve(false) : hasThresholdPackage(provider, business, t.version),
          ]);
          return { business, hasKey: key !== null, shared };
        }),
      );
      setDistRows(rows);
    } catch (e: unknown) {
      setDistError(errMsg(e, "Failed to load distribution status."));
    } finally {
      setDistLoading(false);
    }
  }, [proofs]);

  // Seal + share one package. Needs the session's (threshold, salt).
  const sharePackage = useCallback(
    async (business: string, secrets: { wei: string; salt: string }, version: string) => {
      const account = wallet.getAccount();
      if (!account) throw new Error("Wallet not connected.");
      const provider = getProvider();
      const key = await getDistributionKey(provider, business);
      if (!key) throw new Error("Business has no distribution key — its backend must run dist_keygen first.");
      const sealed = sealThresholdPackage(
        joinPubkey(key.low, key.high),
        BigInt(secrets.wei),
        BigInt(secrets.salt),
        BigInt(version),
      );
      const res = await account.execute({
        contractAddress: REGISTRY_ADDRESS,
        entrypoint: "share_threshold_package",
        calldata: [business, sealed.ephLow, sealed.ephHigh, sealed.nonce, sealed.c0, sealed.c1, sealed.c2],
      });
      await provider.waitForTransaction(res.transaction_hash);
      return res.transaction_hash;
    },
    [wallet],
  );

  const handleShareOne = useCallback(
    async (business: string) => {
      if (!sessionSecrets) {
        setShareError("Session values expired — re-enter them via Materiality → Edit Config, then share.");
        return;
      }
      if (!threshold) return;
      setSharing(business);
      setShareError(undefined);
      try {
        await sharePackage(business, sessionSecrets, threshold.version);
        await reloadDistribution();
        refresh();
      } catch (e: unknown) {
        setShareError(errMsg(e, "Share failed."));
      } finally {
        setSharing(null);
      }
    },
    [sessionSecrets, sharePackage, threshold, reloadDistribution, refresh],
  );

  const shareAll = useCallback(
    async (businesses: string[], secrets: { wei: string; salt: string }, version: string) => {
      let ok = 0;
      let skipped = 0;
      for (const business of businesses) {
        setSharing(business);
        try {
          const key = await getDistributionKey(getProvider(), business);
          if (!key) {
            skipped++;
            continue;
          }
          const already = await hasThresholdPackage(getProvider(), business, version);
          if (already) continue;
          await sharePackage(business, secrets, version);
          ok++;
        } catch (e: unknown) {
          setShareError(`Share to ${business.slice(0, 10)}… failed: ${errMsg(e, "transaction failed")}`);
          break;
        }
      }
      setSharing(null);
      await reloadDistribution();
      return { ok, skipped };
    },
    [sharePackage, reloadDistribution],
  );

  // Commit threshold, then auto-seal + share to every keyed business.
  const handleThresholdSave = useCallback(
    async (commitment: string, wei: string, salt: string) => {
      const account = wallet.getAccount();
      if (!account) {
        setTxError("Wallet not connected.");
        return;
      }
      setTxPending(true);
      setTxError(undefined);
      setTxHash(undefined);
      try {
        const current = await getThreshold(getProvider());
        if (current.commitment.toLowerCase() !== commitment.toLowerCase()) {
          const res = await account.execute({
            contractAddress: REGISTRY_ADDRESS,
            entrypoint: "set_threshold_commitment",
            calldata: [commitment],
          });
          setTxHash(res.transaction_hash);
          await getProvider().waitForTransaction(res.transaction_hash);
        }
        const live = await getThreshold(getProvider());
        setThreshold(live);
        setSessionSecrets({ wei, salt });
        const provider = getProvider();
        const [registered] = await Promise.all([
          fetchRegisteredBusinesses(provider).catch(() => [] as string[]),
        ]);
        const fromProofs = proofs.map((p) => p.business);
        const seen = new Set<string>();
        const businesses = [...registered, ...fromProofs].filter((b) => {
          const k = b.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        await shareAll(businesses, { wei, salt }, live.version);
        reloadWindow();
        refresh();
      } catch (e: unknown) {
        setTxError(errMsg(e, "Transaction failed. Only the registry auditor can update tests (NOT_AUDITOR otherwise)."));
      } finally {
        setTxPending(false);
      }
    },
    [wallet, proofs, shareAll, reloadWindow, refresh],
  );

  useEffect(() => {
    reloadBalance();
    reloadTests();
  }, [reloadBalance, reloadTests]);

  useEffect(() => {
    if (ready) void reloadDistribution();
  }, [ready, reloadDistribution]);

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
                txPending={txPending || sharing !== null}
                txHash={txHash}
                txError={txError}
                onRefresh={() => {
                  reloadTests();
                  void reloadDistribution();
                }}
                onSetThreshold={(commitment, wei, salt) => void handleThresholdSave(commitment, wei, salt)}
                onSetWindow={(seconds) => void runAuditorTx("set_duplicate_window", [seconds])}
                onFlagException={(nullifier) => void runAuditorTx("flag_exception", [nullifier])}
              />
              <DistributionPanel
                version={threshold?.version ?? null}
                rows={distRows}
                loading={distLoading}
                error={distError}
                txPending={txPending || sharing !== null}
                sharing={sharing}
                shareError={shareError}
                onRefresh={() => void reloadDistribution()}
                onShare={(business) => void handleShareOne(business)}
                onShareAll={() => {
                  if (!sessionSecrets || !threshold) {
                    setShareError("Session values expired — re-enter them via Materiality → Edit Config, then share.");
                    return;
                  }
                  const pending = distRows.filter((r) => r.hasKey && !r.shared).map((r) => r.business);
                  void shareAll(pending, sessionSecrets, threshold.version);
                }}
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
