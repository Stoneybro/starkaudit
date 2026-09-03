"use client";

import { MOCK_BALANCE_FORMATTED, MOCK_BALANCE_RAW } from "@/lib/mock";

export interface ConfidentialBalanceResult {
  formatted: string;
  raw: bigint | null;
  isLoading: boolean;
  isFetching: boolean;
  isUnlocking: boolean;
  isLocked: boolean;
  isFailed: boolean;
  error: Error | null;
  unlock: () => void;
  invalidate: () => void;
}

export function useConfidentialBalance(): ConfidentialBalanceResult {
  return {
    formatted: MOCK_BALANCE_FORMATTED,
    raw: MOCK_BALANCE_RAW,
    isLoading: false,
    isFetching: false,
    isUnlocking: false,
    isLocked: false,
    isFailed: false,
    error: null,
    unlock: () => {},
    invalidate: () => {},
  };
}

export function clearConfidentialBalanceSession(): void {}
