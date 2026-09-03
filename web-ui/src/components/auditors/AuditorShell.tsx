"use client";

import * as React from "react";
import { MOCK_WALLET, MOCK_AUDIT_REGISTRY, MOCK_REVIEW_REGISTRY } from "@/lib/mock";

interface AuditorShellProps {
  businessAddress: `0x${string}`;
  children: (addresses: {
    walletAddress: `0x${string}`;
    auditRegistryAddress: `0x${string}`;
    reviewRegistryAddress: `0x${string}`;
    accessLevel: number;
    deployedAtBlock: bigint;
  }) => React.ReactNode;
  onPhaseChange?: (isReady: boolean) => void;
  onAccessLevelChange?: (level: number) => void;
}

// UI-only: always ready with FULL access
export function AuditorShell({ children, onPhaseChange, onAccessLevelChange }: AuditorShellProps) {
  React.useEffect(() => {
    onPhaseChange?.(true);
    onAccessLevelChange?.(3);
  }, [onPhaseChange, onAccessLevelChange]);

  return (
    <>
      {children({
        walletAddress: MOCK_WALLET,
        auditRegistryAddress: MOCK_AUDIT_REGISTRY,
        reviewRegistryAddress: MOCK_REVIEW_REGISTRY,
        accessLevel: 3,
        deployedAtBlock: 8120000n,
      })}
    </>
  );
}
