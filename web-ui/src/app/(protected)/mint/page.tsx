"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function MintPage() {
  const [status, setStatus] = useState<string>("");

  const handleMint = async () => {
    try {
      setStatus("Simulating Zama FHE encryption...");
      await new Promise((r) => setTimeout(r, 800));
      setStatus("Simulating wallet confirmation...");
      await new Promise((r) => setTimeout(r, 700));
      setStatus("Confirming mint...");
      await new Promise((r) => setTimeout(r, 600));
      setStatus("Mint complete (mock) — 10,000 cUSDC credited");
      toast.success("Mint simulated (UI mock)");
      setTimeout(() => setStatus(""), 3000);
    } catch (err: any) {
      toast.error("Minting failed (mock)", { description: err.message });
      setStatus("");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Mint Dev Tokens</h1>
        <p className="text-muted-foreground">
          Mint 10,000 cUSDC (UI mock — no chain interaction)
        </p>
      </div>

      <Button onClick={handleMint} size="lg" className="w-64">
        Mint 10,000 cUSDC
      </Button>

      {status && (
        <div className="text-sm text-muted-foreground animate-pulse">
          {status}
        </div>
      )}
    </div>
  );
}
