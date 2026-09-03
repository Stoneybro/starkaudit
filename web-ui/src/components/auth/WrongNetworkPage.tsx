"use client";

import { Button } from "@/components/ui/button";

export function WrongNetworkPage() {
  return (
    <div className="max-w-[460px] flex flex-col items-center text-center">
      <h2 className="text-2xl font-semibold tracking-tight mb-2">Wrong Network</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Please switch to Sepolia. <span className="text-amber-600">(UI mock — no chain)</span>
      </p>
      <Button variant="outline">Switch Network (mock)</Button>
    </div>
  );
}
