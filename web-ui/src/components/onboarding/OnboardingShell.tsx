"use client";

import * as React from "react";
import { MOCK_WALLET, MOCK_AUDIT_REGISTRY, MOCK_REVIEW_REGISTRY } from "@/lib/mock";

interface OnboardingShellProps {
  children: (addresses: {
    walletAddress: `0x${string}`;
    auditRegistryAddress: `0x${string}`;
    reviewRegistryAddress: `0x${string}`;
  }) => React.ReactNode;
  onPhaseChange?: (isReady: boolean) => void;
}

// UI-only: always ready, no chain checks, no wallet gating
export function OnboardingShell({ children, onPhaseChange }: OnboardingShellProps) {
  React.useEffect(() => {
    onPhaseChange?.(true);
  }, [onPhaseChange]);

  return (
    <>
      {children({
        walletAddress: MOCK_WALLET,
        auditRegistryAddress: MOCK_AUDIT_REGISTRY,
        reviewRegistryAddress: MOCK_REVIEW_REGISTRY,
      })}
    </>
  );
}
