"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface InitializeDefaultsStepProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  onConfigured: () => void;
}

export function InitializeDefaultsStep({ onConfigured }: InitializeDefaultsStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleInitialize = async () => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success("Defaults initialized (mock)");
    onConfigured();
    setIsSubmitting(false);
  };
  return (
    <div className="max-w-[460px]">
      <h1 className="text-3xl font-semibold tracking-tight mb-4">Demo Configuration (mock)</h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-6">Initializing workspace with demo thresholds (mock).</p>
      <Button onClick={handleInitialize} className="w-full h-12 text-base font-medium" disabled={isSubmitting}>
        {isSubmitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Encrypting…</> : <>Initialize Workspace <ArrowRight className="ml-2 h-5 w-5" /></>}
      </Button>
    </div>
  );
}
