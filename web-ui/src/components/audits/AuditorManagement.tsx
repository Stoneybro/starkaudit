"use client";

import React, { useState } from "react";
import { Loader2, Trash2, Info, ExternalLink, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldLabel, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MOCK_AUDITORS } from "@/lib/mock";

export enum AuditorAccess {
  NONE = 0,
  SIGNAL = 1,
  ANALYTICS = 2,
  FULL = 3,
}

type AuditorRecord = {
  address: `0x${string}`;
  access: AuditorAccess;
};

interface AuditorManagementProps {
  auditRegistryAddress?: `0x${string}`;
  businessAddress?: string;
}

const MAX_AUDITORS = 5;

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AuditorManagement({ businessAddress }: AuditorManagementProps) {
  const [auditors, setAuditors] = useState<AuditorRecord[]>(
    MOCK_AUDITORS.map((a) => ({ address: a.address, access: a.access as AuditorAccess }))
  );
  const [newAddress, setNewAddress] = useState("");
  const [newAccess, setNewAccess] = useState("analytics");
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [auditorToRevoke, setAuditorToRevoke] = useState<string | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [auditorForHistory, setAuditorForHistory] = useState<string | null>(null);
  const [historyType, setHistoryType] = useState<"all" | "recent">("all");
  const [recentCount, setRecentCount] = useState("50");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAtCapacity = auditors.length >= MAX_AUDITORS;
  const formDisabled = isSubmitting || isAtCapacity;

  const handleAddAuditor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error("Invalid Ethereum address");
      return;
    }
    if (auditors.some((a) => a.address.toLowerCase() === newAddress.toLowerCase())) {
      toast.error("Auditor already exists");
      return;
    }
    setGrantDialogOpen(true);
  };

  const confirmGrantAccess = async () => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    const access = newAccess === "full" ? AuditorAccess.FULL : AuditorAccess.ANALYTICS;
    setAuditors((prev) => [...prev, { address: newAddress as `0x${string}`, access }]);
    toast.success("Auditor access granted (mock)");
    setNewAddress("");
    setGrantDialogOpen(false);
    setIsSubmitting(false);
  };

  const handleRevokeClick = (address: `0x${string}`) => {
    setAuditorToRevoke(address);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeAccess = async () => {
    if (!auditorToRevoke) return;
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    setAuditors((prev) => prev.filter((a) => a.address !== auditorToRevoke));
    toast.success("Auditor access revoked (mock)");
    setRevokeDialogOpen(false);
    setAuditorToRevoke(null);
    setIsSubmitting(false);
  };

  const handleHistoryClick = (address: `0x${string}`) => {
    setAuditorForHistory(address);
    setHistoryDialogOpen(true);
  };

  const confirmHistoryAccess = async () => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success("Historical access granted (mock)");
    setHistoryDialogOpen(false);
    setAuditorForHistory(null);
    setIsSubmitting(false);
  };

  const getAccessBadge = (access: AuditorAccess) => {
    switch (access) {
      case AuditorAccess.SIGNAL:
        return <Badge variant="secondary">Signal</Badge>;
      case AuditorAccess.ANALYTICS:
        return <Badge variant="secondary">Analytics</Badge>;
      case AuditorAccess.FULL:
        return <Badge variant="secondary">Full Access</Badge>;
      default:
        return <Badge variant="outline">Revoked</Badge>;
    }
  };

  return (
    <TooltipProvider delay={200}>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Grant Auditor Access</CardTitle>
            <CardDescription>Authorize a new external auditor to review your encrypted records. <span className="text-amber-600">(mock)</span></CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAuditor} className="space-y-6">
              <FieldGroup className="grid gap-6 sm:grid-cols-[1fr_200px]">
                <Field>
                  <FieldLabel htmlFor="auditor-address">Ethereum Address</FieldLabel>
                  <Input
                    id="auditor-address"
                    placeholder="0x..."
                    value={newAddress}
                    onChange={(event) => setNewAddress(event.target.value)}
                    className="font-mono"
                    disabled={formDisabled}
                  />
                  <FieldDescription>The auditor&apos;s wallet address.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="access-tier">Access Tier</FieldLabel>
                  <Select
                    value={newAccess}
                    onValueChange={(value) => value && setNewAccess(value)}
                    disabled={formDisabled}
                  >
                    <SelectTrigger id="access-tier">
                      <SelectValue placeholder="Select tier..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="analytics">Analytics</SelectItem>
                      <SelectItem value="full">Full Access</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldDescription>Level of encrypted access.</FieldDescription>
                </Field>
              </FieldGroup>

              <div className="pt-2">
                <Button type="submit" disabled={formDisabled}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Simulating...
                    </>
                  ) : (
                    "Grant Access"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
          <CardFooter className="mt-4 border-t border-border bg-muted/30">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
              <div className="space-y-1">
                <p><strong>Analytics:</strong> Can view aggregate category and recipient spend totals, and decrypt only flagged transactions.</p>
                <p><strong>Full Access:</strong> Can decrypt every individual payment amount and GL category within their approved scope.</p>
              </div>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Auditor Roster</CardTitle>
                <CardDescription>Manage external audit firms and their data access levels.</CardDescription>
              </div>
              <div className="rounded-full border border-border bg-muted/30 px-3 py-1 text-sm text-muted-foreground">
                {auditors.length} / {MAX_AUDITORS} Slots Used
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {auditors.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
                No auditors have been granted access yet.
              </div>
            ) : (
              <div className="space-y-4">
                {auditors.map((auditor) => (
                  <div
                    key={auditor.address}
                    className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 truncate font-mono text-sm font-medium" title={auditor.address}>
                          <span className="sm:hidden">{formatAddress(auditor.address)}</span>
                          <span className="hidden sm:inline">{auditor.address}</span>
                          {businessAddress && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </div>
                        <div className="text-xs text-muted-foreground">Active Auditor</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getAccessBadge(auditor.access)}
                      <div className="flex items-center justify-end gap-2">
                        {auditor.access === AuditorAccess.FULL && (
                          <Button variant="outline" size="sm" className="h-8" onClick={() => handleHistoryClick(auditor.address)} disabled={isSubmitting}>
                            <ArchiveRestore className="mr-2 h-3.5 w-3.5" />
                            Share Past Records
                          </Button>
                        )}
                        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => handleRevokeClick(auditor.address)} disabled={isSubmitting}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Grant access (mock)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will grant {newAccess} access to {newAddress} (mock — no chain tx).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmGrantAccess}>Grant Access</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={revokeDialogOpen} onOpenChange={(open) => { setRevokeDialogOpen(open); if (!open) setAuditorToRevoke(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke access (mock)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will revoke all access for {auditorToRevoke} (mock).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmRevokeAccess} disabled={isSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Revoke Access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Share Historical Records (mock)</AlertDialogTitle>
              <AlertDialogDescription>
                Select which past payments to share (mock — no gas).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <label className={`relative flex cursor-pointer flex-col rounded-lg border p-4 shadow-sm ${historyType === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">All Past Records</div>
                    <input type="radio" name="history-type" value="all" checked={historyType === "all"} onChange={() => setHistoryType("all")} className="sr-only" />
                    {historyType === "all" && <div className="h-4 w-4 rounded-full border-4 border-primary" />}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Share all existing payments.</div>
                </label>
                <label className={`relative flex cursor-pointer flex-col rounded-lg border p-4 shadow-sm ${historyType === "recent" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Recent Records</div>
                    <input type="radio" name="history-type" value="recent" checked={historyType === "recent"} onChange={() => setHistoryType("recent")} className="sr-only" />
                    {historyType === "recent" && <div className="h-4 w-4 rounded-full border-4 border-primary" />}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Share the last
                    <Input type="number" value={recentCount} onChange={(e) => { setRecentCount(e.target.value); setHistoryType("recent"); }} onClick={() => setHistoryType("recent")} className="w-20 h-8 bg-background" min="1" />
                    payments.
                  </div>
                </label>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setHistoryDialogOpen(false); setAuditorForHistory(null); }}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmHistoryAccess} disabled={isSubmitting}>Grant Access</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
