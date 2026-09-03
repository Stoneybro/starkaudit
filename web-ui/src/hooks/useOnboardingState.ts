"use client";

import { MOCK_WALLET, MOCK_AUDIT_REGISTRY, MOCK_REVIEW_REGISTRY } from "@/lib/mock";

export type OnboardingPhase = "loading" | "connect-wallet" | "wrong-network" | "deploy-registry" | "deactivated" | "ready";

export type OnboardingState =
  | { phase: "loading" }
  | { phase: "connect-wallet" }
  | { phase: "wrong-network" }
  | { phase: "deploy-registry"; walletAddress: `0x${string}` }
  | { phase: "deactivated"; walletAddress: `0x${string}` }
  | { phase: "ready"; walletAddress: `0x${string}`; auditRegistryAddress: `0x${string}`; reviewRegistryAddress: `0x${string}` };

// Mock — always ready, no wallet / chain checks
export function useOnboardingState(): { state: OnboardingState; refetch: () => void } {
  return {
    state: {
      phase: "ready",
      walletAddress: MOCK_WALLET,
      auditRegistryAddress: MOCK_AUDIT_REGISTRY,
      reviewRegistryAddress: MOCK_REVIEW_REGISTRY,
    },
    refetch: () => {},
  };
}
