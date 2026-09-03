"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getCategoryOptions } from "@/lib/audit-enums";

interface TestConfiguratorProps {
  testId: number;
  testDefinition: { name: string; requiresScope?: boolean };
  reviewRegistryAddress: `0x${string}`;
  onClose: () => void;
  onConfigured: () => void;
}

export function TestConfigurator({ testId, testDefinition, onClose, onConfigured }: TestConfiguratorProps) {
  const [threshold, setThreshold] = useState("");
  const [priority, setPriority] = useState("2");
  const [scope, setScope] = useState("0");
  const CATEGORY_OPTIONS = getCategoryOptions();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await new Promise((r) => setTimeout(r, 600));
    toast.success(`Test ${testDefinition.name} configured (mock)`);
    onConfigured();
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Configure {testDefinition.name} (mock)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Priority Level</Label>
            <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Monitoring (Periodic)</SelectItem>
                <SelectItem value="2">Standard (Every Payment)</SelectItem>
                <SelectItem value="3">Critical (High Severity)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {testDefinition.requiresScope && (
            <div className="space-y-1.5">
              <Label>GL Category Scope</Label>
              <Select value={scope} onValueChange={(v) => v && setScope(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt, i) => (
                    <SelectItem key={opt.value} value={i.toString()}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Threshold (cUSDC)</Label>
            <Input type="number" required min="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="e.g. 10000" />
            <p className="text-[13px] text-muted-foreground">(mock) Value would be FHE encrypted in production.</p>
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save Configuration (mock)</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
