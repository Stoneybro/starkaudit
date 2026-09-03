'use client';

import * as React from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// UI-only replica — no wallet / chain providers.
// All hooks are mocked; this provider only supplies tooltip + toast context.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
