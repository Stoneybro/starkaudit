"use client";

import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FindingSyncProps {
  auditRegistryAddress: `0x${string}`;
  reviewRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  deployedAtBlock: bigint;
}

export function FindingSync({}: FindingSyncProps) {
  const handlePull = async () => {
    toast("Findings up to date (mock)", {
      description: "This is a UI-only replica — no chain sync.",
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Badge variant="outline" className="h-8 gap-1.5 rounded-md border-input px-3 text-xs font-normal text-muted-foreground">
        <RefreshCw className="size-3" />
        1 pending (mock)
      </Badge>
      <Button variant="outline" size="sm" onClick={() => void handlePull()}>
        <RefreshCw data-icon="inline-start" />
        Get finding
      </Button>
    </div>
  );
}
