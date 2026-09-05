"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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
import { REGISTRY_ADDRESS, getProvider, sameAddress, shortHash } from "@/lib/starknet";
import { errMsg } from "@/lib/utils";
import {
  formatStrk,
  getAuditor,
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

const ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;
const ZERO = "0x0";

/**
 * Isolated auditor workspace for ONE business.
 * The business shares a link like /auditor/<business-address>; this page only
 * ever loads and displays that business's threshold, proofs and exceptions.
 * Writes remain enforced on-chain (NOT_AUDITOR otherwise); the wallet gate
 * here is UI scoping for the demo, not a security boundary — chain data
 * itself stays public.
 */
export default function ScopedAuditorPage() {
  const params = useParams<{ business: string }>();
  const raw = Array.isArray(params.business) ? params.business[0] : (params.business ?? "");
  const business = ADDRESS_RE.test(raw.trim()) ? raw.trim() : null;

  const wallet = useWallet();
  const { address, ready } = wallet;
  const { proofs, exceptions, loading, error, refresh } = useProofFeed(ready && business !== null);

  // Only this business's records are ever rendered (UI isolation).
  const scopedProofs = useMemo(
    () => (business ? proofs.filter((p) => sameAddress(p.business, business)) : []),
    [proofs, business],
  );
  const scopedExceptions = useMemo(
    () => (business ? exceptions.filter((e) => e.business && sameAddress(e.business, business)) : []),
    [exceptions, business],
  );

  const [activeView, setActiveView] = useState<AuditorAppView>("findings");
  const [auditorOf, setAuditorOf] = useState<string | null>(null);
  const [auditorLoading, setAuditorLoading] = useState(true);
  const [auditorError, setAuditorError] = useState<string | undefined>(undefined);
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
  const [distCapable, setDistCapable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProvider()
      .callContract({
        contractAddress: REGISTRY_ADDRESS,
        entrypoint: "has_threshold_package",
        calldata: ["0x1", "0x1"],
      })
      .then(() => {
        if (!cancelled) setDistCapable(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setDistCapable(!msg.includes("MISSING_METHOD") && !msg.includes("not found"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Who is this business's auditor? Re-read live so rotation/revocation
  // takes effect immediately.
  const reloadAuditor = useCallback(() => {
    if (!business) {
      setAuditorOf(null);
      setAuditorLoading(false);
      return;
    }
    setAuditorLoading(true);
    setAuditorError(undefined);
    getAuditor(getProvider(), business).then(
      (a) => {
        setAuditorOf(a);
        setAuditorLoading(false);
      },
      (e: unknown) => {
        setAuditorError(errMsg(e, "Could not read the business's auditor from the registry."));
        setAuditorLoading(false);
      },
    );
  }, [business]);

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
    if (!business) return;
    setThresholdLoading(true);
    setThresholdError(undefined);
    getThreshold(getProvider(), business).then(
      (t) => {
        setThreshold(t);
        setThresholdLoading(false);
      },
      (e: unknown) => {
        setThresholdError(e instanceof Error ? e.message.slice(0, 200) : "Failed to load threshold.");
        setThresholdLoading(false);
      },
    );
  }, [business]);

  const reloadWindow = useCallback(() => {
    if (!business) return;
    setWindowLoading(true);
    getDuplicateWindow(getProvider(), business).then(
      (w) => {
        setWindowSeconds(w);
        setWindowLoading(false);
      },
      () => {
        setWindowSeconds(null);
        setWindowLoading(false);
      },
    );
  }, [business]);

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
        setTxError(errMsg(e, "Transaction failed. Only this business's auditor can update its tests (NOT_AUDITOR / NO_AUDITOR otherwise)."));
      } finally {
        setTxPending(false);
      }
    },
    [wallet, reloadTests, refresh],
  );

  // Distribution status for THIS business only.
  const reloadDistribution = useCallback(async () => {
    if (!business) return;
    setDistLoading(true);
    setDistError(undefined);
    try {
      const provider = getProvider();
      const [key, t] = await Promise.all([
        getDistributionKey(provider, business),
        getThreshold(provider, business).catch(() => ({ commitment: "0x0", version: "0" })),
      ]);
      const shared = t.version === "0" ? false : await hasThresholdPackage(provider, business, t.version);
      setDistRows([{ business, hasKey: key !== null, shared, version: t.version }]);
    } catch (e: unknown) {
      setDistError(errMsg(e, "Failed to load distribution status."));
    } finally {
      setDistLoading(false);
    }
  }, [business]);

  const sharePackage = useCallback(
    async (target: string, secrets: { wei: string; salt: string }, version: string) => {
      const account = wallet.getAccount();
      if (!account) throw new Error("Wallet not connected.");
      const provider = getProvider();
      const key = await getDistributionKey(provider, target);
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
        calldata: [target, sealed.ephLow, sealed.ephHigh, sealed.nonce, sealed.c0, sealed.c1, sealed.c2],
      });
      await provider.waitForTransaction(res.transaction_hash);
      return res.transaction_hash;
    },
    [wallet],
  );

  const handleShareOne = useCallback(
    async (target: string) => {
      if (distCapable === false) {
        setShareError(
          "The deployed registry class predates sealed-envelope sharing (no share_threshold_package entrypoint). Redeploy the current AuditRegistry class to enable this — everything else on this dashboard works.",
        );
        return;
      }
      if (!sessionSecrets) {
        setShareError("Session values expired — re-enter them via Materiality → Edit Config, then share.");
        return;
      }
      const live = await getThreshold(getProvider(), target);
      setSharing(target);
      setShareError(undefined);
      try {
        await sharePackage(target, sessionSecrets, live.version);
        await reloadDistribution();
        reloadTests();
        refresh();
      } catch (e: unknown) {
        setShareError(errMsg(e, "Share failed."));
      } finally {
        setSharing(null);
      }
    },
    [distCapable, sessionSecrets, sharePackage, reloadDistribution, reloadTests, refresh],
  );

  // Commit threshold for this business, then auto-seal + share to it.
  const handleThresholdSave = useCallback(
    async (target: string, commitment: string, wei: string, salt: string) => {
      const account = wallet.getAccount();
      if (!account) {
        setTxError("Wallet not connected.");
        return;
      }
      setTxPending(true);
      setTxError(undefined);
      setTxHash(undefined);
      try {
        const current = await getThreshold(getProvider(), target);
        if (current.commitment.toLowerCase() !== commitment.toLowerCase()) {
          const res = await account.execute({
            contractAddress: REGISTRY_ADDRESS,
            entrypoint: "set_threshold_commitment",
            calldata: [target, commitment],
          });
          setTxHash(res.transaction_hash);
          await getProvider().waitForTransaction(res.transaction_hash);
        }
        const live = await getThreshold(getProvider(), target);
        setThreshold(live);
        setSessionSecrets({ wei, salt });
        const key = await getDistributionKey(getProvider(), target);
        if (key) {
          const already = await hasThresholdPackage(getProvider(), target, live.version);
          if (!already) await sharePackage(target, { wei, salt }, live.version);
        }
        reloadWindow();
        await reloadDistribution();
        refresh();
      } catch (e: unknown) {
        setTxError(errMsg(e, "Transaction failed. Only this business's auditor can update its tests (NOT_AUDITOR / NO_AUDITOR otherwise)."));
      } finally {
        setTxPending(false);
      }
    },
    [wallet, sharePackage, reloadWindow, reloadDistribution, refresh],
  );

  useEffect(() => {
    reloadAuditor();
  }, [reloadAuditor]);

  useEffect(() => {
    reloadBalance();
  }, [reloadBalance]);

  useEffect(() => {
    if (business) reloadTests();
  }, [business, reloadTests]);

  useEffect(() => {
    if (ready && business) void reloadDistribution();
  }, [ready, business, reloadDistribution]);

  const isDashboardReady = ready;
  const meta = viewMeta[activeView];
  const authorized =
    ready && !!address && !!auditorOf && auditorOf !== ZERO && sameAddress(auditorOf, address);
  const noAuditor = !auditorLoading && !auditorError && (!auditorOf || auditorOf === ZERO);

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
        <header className="bg-background sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <SidebarTrigger className="-ml-1" />

          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">
                  Auditor workspace
                </span>
                {isDashboardReady && <span className="text-muted-foreground/40 font-light">/</span>}
              </div>
              {isDashboardReady && (
                <h1 className="font-semibold tracking-tight text-foreground">
                  {meta.title}
                </h1>
              )}
            </div>
            {business && (
              <span className="font-mono text-xs text-muted-foreground" title={business}>
                {shortHash(business)}
              </span>
            )}
          </div>
        </header>

        <div className="flex flex-1 flex-col">
          {!business ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md w-full rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
                <p className="font-semibold text-foreground">Invalid auditor link</p>
                <p className="text-sm text-muted-foreground">
                  This link doesn&apos;t contain a valid business address. Ask the business to
                  re-share it from Business workspace → Settings → Auditor access.
                </p>
              </div>
            </div>
          ) : !ready ? (
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
          ) : auditorLoading ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <p className="text-sm text-muted-foreground">Verifying auditor access…</p>
            </div>
          ) : auditorError ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md w-full rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
                <p className="font-semibold text-foreground">Couldn&apos;t verify access</p>
                <p className="text-sm text-muted-foreground">{auditorError}</p>
                <button
                  onClick={reloadAuditor}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : noAuditor ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3">
                <p className="font-semibold text-foreground">No auditor assigned yet</p>
                <p className="text-sm text-muted-foreground">
                  Business <span className="font-mono">{shortHash(business)}</span> hasn&apos;t
                  named an auditor on-chain. Ask them to grant access from the Business workspace first.
                </p>
              </div>
            </div>
          ) : !authorized ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="max-w-md w-full rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
                <p className="font-semibold text-foreground">Access denied</p>
                <p className="text-sm text-muted-foreground">
                  This workspace is for the auditor of{" "}
                  <span className="font-mono">{shortHash(business)}</span>. The assigned auditor is{" "}
                  <span className="font-mono">{shortHash(auditorOf ?? "")}</span> — connect with
                  that wallet to continue.
                </p>
              </div>
            </div>
          ) : (
          <div className="flex flex-1 flex-col px-6 py-4">
            <div className={activeView === "tests" ? "block" : "hidden"}>
              <ThresholdsPanel
                businesses={[business]}
                selectedBusiness={business}
                onSelectBusiness={() => {}}
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
                  reloadAuditor();
                }}
                onSetThreshold={(target, commitment, wei, salt) => void handleThresholdSave(target, commitment, wei, salt)}
                onSetWindow={(target, seconds) => void runAuditorTx("set_duplicate_window", [target, seconds])}
                onFlagException={(target, nullifier) => void runAuditorTx("flag_exception", [target, nullifier])}
              />
              <DistributionPanel
                rows={distRows}
                loading={distLoading}
                error={distError}
                txPending={txPending || sharing !== null}
                sharing={sharing}
                shareError={shareError}
                onRefresh={() => void reloadDistribution()}
                onShare={(target) => void handleShareOne(target)}
                onShareAll={() => {
                  if (!sessionSecrets) {
                    setShareError("Session values expired — re-enter them via Materiality → Edit Config, then share.");
                    return;
                  }
                  void handleShareOne(business);
                }}
              />
            </div>

            <div className={activeView === "findings" ? "block" : "hidden"}>
              <FeedFindings proofs={scopedProofs} loading={loading} error={error} onRefresh={refresh} />
            </div>

            <div className={activeView === "analytics" ? "block" : "hidden"}>
              <FeedAnalytics proofs={scopedProofs} exceptions={scopedExceptions} loading={loading} error={error} onRefresh={refresh} />
            </div>
          </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
