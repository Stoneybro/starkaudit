"use client";

import * as React from "react";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface DeployRegistryStepProps {
  walletAddress: `0x${string}`;
  onDeployed: () => void;
}

export function DeployRegistryStep({ onDeployed }: DeployRegistryStepProps) {
  const [isDeploying, setIsDeploying] = React.useState(false);

  const handleDeploy = async () => {
    setIsDeploying(true);
    await new Promise((r) => setTimeout(r, 900));
    toast.success("Workspace deployed (mock)");
    onDeployed();
    setIsDeploying(false);
  };

  return (
    <div className="max-w-[460px]">
      <h1 className="text-3xl font-semibold tracking-tight mb-4">Create your workspace (mock)</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        This is a UI-only replica — clicking deploy simulates the transaction.
      </p>
      <div className="mb-8 space-y-2.5">
        {[
          "Dedicated contracts for encrypted payments",
          "Full ownership to your wallet",
        ].map((item) => (
          <div key={item} className="flex items-start gap-3 text-base">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{item}</span>
          </div>
        ))}
      </div>
      <Button id="btn-deploy-registry" onClick={handleDeploy} disabled={isDeploying} className="gap-2">
        {isDeploying ? <><Loader2 className="animate-spin" /> Deploying…</> : <>Deploy Workspace <ArrowRight /></>}
      </Button>
    </div>
  );
}
