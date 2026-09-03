"use client";

import React, { useState } from "react";
import { Loader2, Lock, Unlock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_TRANSACTIONS } from "@/lib/mock";

interface PaymentsProps {
  auditRegistryAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Payments({}: PaymentsProps) {
  const [decryptStates, setDecryptStates] = useState<Record<number, string>>({});
  const [decrypted, setDecrypted] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const handleDecrypt = async (id: number) => {
    setDecryptStates((s) => ({ ...s, [id]: "decrypting" }));
    await new Promise((r) => setTimeout(r, 700));
    setDecrypted((s) => ({ ...s, [id]: true }));
    setDecryptStates((s) => ({ ...s, [id]: "done" }));
    setExpanded((prev) => new Set(prev).add(id));
  };

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Payments</h2>
        <p className="text-sm text-muted-foreground">
          Payments within your engagement scope. <span className="text-amber-600">(mock)</span>
        </p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">ID</th>
              <th className="text-left px-4 py-3 font-medium">Recipient</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Evidence</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_TRANSACTIONS.map((row) => {
              const isDecrypting = decryptStates[row.paymentId] === "decrypting";
              const isDone = decrypted[row.paymentId];
              const isExpanded = expanded.has(row.paymentId);
              return (
                <React.Fragment key={row.paymentId}>
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">#{row.paymentId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatAddress(row.recipient)}</td>
                    <td className="px-4 py-3">
                      {isDone ? <span className="font-mono text-xs text-emerald-600">{row.amountMock}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Encrypted</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground space-x-2">
                      <span className="text-emerald-600">INV ✓</span>
                      <span className="text-muted-foreground/50">PO —</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isDone && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(row.paymentId) ? n.delete(row.paymentId) : n.add(row.paymentId); return n; })}>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {isExpanded ? "Collapse" : "Details"}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isDecrypting || isDone} onClick={() => handleDecrypt(row.paymentId)}>
                          {isDecrypting ? <Loader2 className="h-3 w-3 animate-spin" /> : isDone ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />} {isDecrypting ? "Decrypting…" : isDone ? "Decrypted" : "Decrypt"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && isDone && (
                    <tr className="bg-muted/10">
                      <td colSpan={5} className="px-6 py-5 text-xs">
                        <div className="grid grid-cols-2 gap-6">
                          <div><p className="text-muted-foreground uppercase text-[10px]">Amount</p><p className="font-mono text-emerald-600 font-semibold">{row.amountMock}</p></div>
                          <div><p className="text-muted-foreground uppercase text-[10px]">Recipient</p><p className="font-mono">{row.recipient}</p></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
