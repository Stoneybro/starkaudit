"use client";

import React, { useState } from "react";
import { Settings, ShieldCheck, Clock, CheckCircle2, Lock, ListFilter, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MOCK_TESTS } from "@/lib/mock";
import { toast } from "sonner";

interface TestRulesProps {
  reviewRegistryAddress: `0x${string}`;
  accessLevel: number;
}

export function TestRules({}: TestRulesProps) {
  const [tests, setTests] = useState(MOCK_TESTS);

  const isConfigured = (id: number) => tests.find((t) => t.id === id)?.enabled ?? false;

  const handleConfigure = (id: number) => {
    setTests((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
    toast.success("Test config updated (mock)");
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 mb-6 border-b border-border pb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Test Suite</h2>
        <p className="text-sm text-muted-foreground">
          Configure encrypted audit thresholds. <span className="text-amber-600">(mock — no encryption)</span>
        </p>
      </div>

      {!tests.some((t) => t.enabled) && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No tests are active yet. Configure at least one test below.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {tests.map((test) => (
          <div
            key={test.id}
            className="p-6 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-6 transition-all hover:shadow-sm"
          >
            <div className="flex-1 space-y-1.5">
              <h4 className="text-base font-semibold">{test.name}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{test.description}</p>
              <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-muted-foreground">
                {isConfigured(test.id) ? (
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Inactive
                  </span>
                )}
                {isConfigured(test.id) && (
                  <>
                    <span className="flex items-center gap-1.5">
                      <ListFilter className="h-3.5 w-3.5" /> Threshold: {test.thresholdMock}
                    </span>
                    <span className="flex items-center gap-1.5 text-primary/70">
                      <Lock className="h-3.5 w-3.5" /> Threshold encrypted
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end shrink-0 sm:min-w-[140px] pt-1">
              <Button
                variant={isConfigured(test.id) ? "outline" : "default"}
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => handleConfigure(test.id)}
              >
                <Settings className="h-4 w-4 mr-2" />
                {isConfigured(test.id) ? "Edit Config" : "Configure"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
