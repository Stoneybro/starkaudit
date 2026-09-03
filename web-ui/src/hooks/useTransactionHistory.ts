"use client";

import { useState, useCallback } from "react";
import { MOCK_TRANSACTIONS } from "@/lib/mock";

export interface TransactionRow {
  paymentId: number;
  blockNumber: number;
  timestamp: Date | null;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  approver: `0x${string}`;
  invoiceHash: `0x${string}`;
  poHash: `0x${string}`;
  approved: boolean;
  findingCount: number;
  maxSeverity: number | null;
}

export type TransactionHistoryStatus = "idle" | "loading" | "success" | "error";

export function useTransactionHistory() {
  const [status] = useState<TransactionHistoryStatus>("success");
  const rows: TransactionRow[] = MOCK_TRANSACTIONS.map((t) => ({
    paymentId: t.paymentId,
    blockNumber: t.blockNumber,
    timestamp: t.timestamp,
    sender: t.sender,
    recipient: t.recipient,
    approver: t.approver,
    invoiceHash: t.invoiceHash,
    poHash: t.poHash,
    approved: t.approved,
    findingCount: t.findingCount,
    maxSeverity: t.maxSeverity,
  }));

  const refetch = useCallback(async () => {}, []);

  return { rows, status, error: null as string | null, refetch };
}
