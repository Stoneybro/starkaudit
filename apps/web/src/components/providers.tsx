'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Toast + tooltip + query-client context. Chain state (wallet, provider)
// lives in useWallet / the data layer — not in a global provider.
//
// Query defaults are deliberately quiet: no refetch on window focus,
// reconnect, or mount — cached data is served as-is. The shielded balance
// (a wallet consent prompt per read) must only fetch on first enable and on
// deliberate user actions (manual refresh, post-confirm), never on tab
// switches or re-renders.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            retry: false,
            staleTime: Infinity,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
