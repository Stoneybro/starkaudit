"use client";

import * as React from "react";
import Image from "next/image";

export function LoginPage() {
  return (
    <div className="max-w-[460px] flex flex-col items-center text-center -mt-24">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5">
        <Image
          src="/complyrlogo-light.svg"
          alt="Complyr Logo"
          width={60}
          height={60}
          className="h-12 w-auto"
        />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight mb-4">
        Welcome back
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-10">
        Connect your wallet to access Complyr. <span className="text-amber-600">(UI mock)</span>
      </p>
      <button
        id="btn-connect-wallet"
        onClick={() => {}}
        className="h-11 rounded-lg bg-primary px-10 text-base font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 shadow-sm"
      >
        Connect Wallet (mock)
      </button>
      <p className="mt-4 text-xs text-muted-foreground">This is a UI-only replica — no wallet connection.</p>
    </div>
  );
}
