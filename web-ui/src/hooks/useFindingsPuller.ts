"use client";

import { useState, useCallback } from "react";

export type PullStatus = "idle" | "syncing" | "awaiting-signature" | "error";
export interface PullOutcome { ok: boolean; upToDate: boolean; }

export function useFindingsPuller(_args: {
  auditRegistryAddress: `0x${string}`;
  reviewRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  deployedAtBlock: bigint;
}) {
  const [status] = useState<PullStatus>("idle");
  const [pendingCount] = useState(1);
  const [lastError] = useState<string | null>(null);

  const pullNow = useCallback(async (): Promise<PullOutcome | null> => {
    await new Promise((r) => setTimeout(r, 800));
    return { ok: true, upToDate: true };
  }, []);

  return { status, pendingCount, lastError, pullNow };
}
