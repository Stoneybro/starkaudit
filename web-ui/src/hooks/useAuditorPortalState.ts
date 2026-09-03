"use client";

import { MOCK_WALLET, MOCK_AUDIT_REGISTRY, MOCK_REVIEW_REGISTRY } from "@/lib/mock";

export type AuditorPhase = "loading" | "connect-wallet" | "wrong-network" | "business-not-found" | "unauthorized" | "ready";

export type AuditorPortalState = {
  phase: AuditorPhase;
  walletAddress?: `0x${string}`;
  auditRegistryAddress?: `0x${string}`;
  reviewRegistryAddress?: `0x${string}`;
  accessLevel?: number;
  deployedAtBlock?: bigint;
};

export function useAuditorPortalState(_businessAddress: `0x${string}`): { state: AuditorPortalState; refetch: () => void } {
  return {
    state: {
      phase: "ready",
      walletAddress: MOCK_WALLET,
      auditRegistryAddress: MOCK_AUDIT_REGISTRY,
      reviewRegistryAddress: MOCK_REVIEW_REGISTRY,
      accessLevel: 3,
      deployedAtBlock: 8120000n,
    },
    refetch: () => {},
  };
}
