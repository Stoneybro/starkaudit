"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

export interface SingleTransferParams {
  to: `0x${string}`;
  amount: string;
  category: string;
  invoiceHash?: `0x${string}`;
  poHash?: `0x${string}`;
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onStatusUpdate?: (status: string) => void;
}

// Mock hook — simulates encrypt → submit → confirm with delays, no chain calls.
export function useSingleTransfer() {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(async (data: SingleTransferParams) => {
    setIsPending(true);
    try {
      data.onStatusUpdate?.("Encrypting...");
      await new Promise((r) => setTimeout(r, 800));
      data.onStatusUpdate?.("Simulating wallet confirmation...");
      await new Promise((r) => setTimeout(r, 700));
      data.onStatusUpdate?.("Confirming...");
      await new Promise((r) => setTimeout(r, 900));

      toast.success("Payment sent! (mock)", {
        description: `Mock transfer of ${data.amount} USDC to ${data.to.slice(0, 10)}...`,
      });
      return { txHash: "0xmock" as `0x${string}`, walletAddress: data.walletAddress };
    } finally {
      setIsPending(false);
    }
  }, []);

  return {
    mutateAsync,
    isPending,
    isSuccess: false,
    isError: false,
  } as unknown as { mutateAsync: typeof mutateAsync; isPending: boolean; isSuccess: boolean; isError: boolean };
}
