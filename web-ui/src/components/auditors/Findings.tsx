"use client";

import React, { useState } from "react";
import { Loader2, FileSearchCorner, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MOCK_FINDINGS } from "@/lib/mock";

const TEST_TYPE_LABELS: Record<number, string> = {
  0: "Materiality",
  3: "Missing Evidence",
  4: "Category Concentration",
  5: "Recipient Concentration",
};

const SEVERITY_CONFIG: Record<number, { label: string; className: string }> = {
  0: { label: "None", className: "bg-muted text-muted-foreground" },
  1: { label: "Low", className: "bg-sky-500/10 text-sky-600 border-0" },
  2: { label: "Medium", className: "bg-amber-500/10 text-amber-600 border-0" },
  3: { label: "Critical", className: "bg-red-500/10 text-red-600 border-0" },
};

interface FindingsProps {
  auditRegistryAddress: `0x${string}`;
  reviewRegistryAddress: `0x${string}`;
  accessLevel: number;
  walletAddress: `0x${string}`;
  deployedAtBlock: bigint;
}

export function Findings({ accessLevel }: FindingsProps) {
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

  if (MOCK_FINDINGS.length === 0) {
    return (
      <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
        <div className="flex flex-col gap-1 border-b border-border pb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Findings</h2>
          <p className="text-sm text-muted-foreground">Payment records that triggered audit tests. <span className="text-amber-600">(mock)</span></p>
        </div>
        <EmptyState icon={<FileSearchCorner className="h-5 w-5" />} title="No findings yet" description="When a payment triggers a test, it will appear here." />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Findings</h2>
        <p className="text-sm text-muted-foreground">{MOCK_FINDINGS.length} findings in your engagement. <span className="text-amber-600">(mock)</span></p>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Payment ID</th>
              <th className="text-left px-4 py-3 font-medium">Test</th>
              <th className="text-left px-4 py-3 font-medium">Severity</th>
              <th className="text-left px-4 py-3 font-medium">Amount</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MOCK_FINDINGS.map((f, i) => {
              const sev = SEVERITY_CONFIG[f.severity] ?? SEVERITY_CONFIG[0];
              const isDecrypting = decryptStates[i] === "decrypting";
              const isDone = decrypted[i];
              const isExpanded = expanded.has(i);
              return (
                <React.Fragment key={i}>
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">#{f.paymentId}</td>
                    <td className="px-4 py-3">{TEST_TYPE_LABELS[f.testType] ?? `Test ${f.testType}`}</td>
                    <td className="px-4 py-3"><Badge className={sev.className}>{sev.label}</Badge></td>
                    <td className="px-4 py-3">
                      {isDone ? <span className="font-mono text-xs text-emerald-600">{f.amount}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Encrypted</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isDone && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {isExpanded ? "Collapse" : "Details"}
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={isDecrypting || isDone} onClick={() => handleDecrypt(i)}>
                          {isDecrypting ? <Loader2 className="h-3 w-3 animate-spin" /> : isDone ? "Decrypted" : "Decrypt"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && isDone && (
                    <tr className="bg-muted/10">
                      <td colSpan={5} className="px-6 py-4 text-xs">
                        <div className="grid grid-cols-3 gap-4">
                          <div><p className="text-muted-foreground uppercase text-[10px]">Test</p><p className="font-medium">{TEST_TYPE_LABELS[f.testType]}</p></div>
                          <div><p className="text-muted-foreground uppercase text-[10px]">Flagged Amount</p><p className="font-mono text-emerald-600">{f.amount}</p></div>
                          <div><p className="text-muted-foreground uppercase text-[10px]">Category</p><p>{f.category}</p></div>
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
