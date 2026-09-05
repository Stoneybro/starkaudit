"use client";

import React, { useState } from "react";
import { Loader2, Trash2, Info, ExternalLink, ShieldCheck } from "lucide-react";
import { Field, FieldLabel, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
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
import { shortHash, voyagerTx } from "@/lib/starknet";

interface AuditorPanelProps {
  auditor: string | null;
  txPending: boolean;
  txHash?: string;
  txError?: string;
  onSetAuditor: (address: string) => void;
}

const AUDITOR_SCHEMA = /^0x[0-9a-fA-F]{2,64}$/;

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AuditorPanel({ auditor, txPending, txHash, txError, onSetAuditor }: AuditorPanelProps) {
  const [newAddress, setNewAddress] = useState("");
  const [inputError, setInputError] = useState<string | undefined>(undefined);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [auditorToRevoke, setAuditorToRevoke] = useState<string | null>(null);

  const handleAddAuditor = (event: React.FormEvent) => {
    event.preventDefault();
    const value = newAddress.trim();
    if (!AUDITOR_SCHEMA.test(value)) {
      setInputError("Enter a valid Starknet address (0x…).");
      return;
    }
    if (auditor && auditor.toLowerCase() === value.toLowerCase()) {
      setInputError("This auditor is already assigned.");
      return;
    }
    setInputError(undefined);
    setGrantDialogOpen(true);
  };

  const confirmGrantAccess = () => {
    onSetAuditor(newAddress.trim());
    setNewAddress("");
    setGrantDialogOpen(false);
  };

  const handleRevokeClick = (address: string) => {
    setAuditorToRevoke(address);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeAccess = () => {
    onSetAuditor("0x0");
    setRevokeDialogOpen(false);
    setAuditorToRevoke(null);
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-12 space-y-6">
      <div className="flex flex-col gap-1 mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Auditor Management</h2>
        <p className="text-sm text-muted-foreground">
          Manage the external human auditor who reviews your encrypted audit records.
        </p>
      </div>

      <div className="space-y-6">

        <Card>
          <CardHeader>
            <CardTitle>Grant Auditor Access</CardTitle>
            <CardDescription>Authorize a new external auditor to review your encrypted records.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddAuditor} className="space-y-6">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="auditor-address">Starknet Address</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>0x</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="auditor-address"
                      placeholder="Starknet address of the auditor"
                      value={newAddress}
                      onChange={(event) => setNewAddress(event.target.value)}
                      className="font-mono"
                      disabled={txPending}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </InputGroup>
                  <FieldDescription>The auditor&apos;s wallet address.</FieldDescription>
                  {inputError && <p className="text-xs text-destructive">{inputError}</p>}
                </Field>
              </FieldGroup>

              {txError && (
                <Alert variant="destructive">
                  <AlertDescription>{txError}</AlertDescription>
                </Alert>
              )}
              {txHash && !txPending && (
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle>Registry updated</AlertTitle>
                  <AlertDescription>
                    Transaction confirmed.{" "}
                    <a
                      href={voyagerTx(txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-4"
                    >
                      View on Voyager <ExternalLink className="h-3 w-3" />
                    </a>
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-2">
                <Button type="submit" disabled={txPending || newAddress.trim().length < 3}>
                  {txPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting…
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
                <p>
                  <strong>Outcomes only:</strong> Your auditor sees blinded pass/fail outcomes for your
                  transfers — never payment amounts or counterparties.
                </p>
                <p>
                  <strong>Public write:</strong> Auditor assignment is a public registry transaction and
                  confirms onchain.
                </p>
              </div>
            </div>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Auditor Roster</CardTitle>
                <CardDescription>Manage the external audit firm assigned to review your records.</CardDescription>
              </div>
              <div className="rounded-full border border-border bg-muted/30 px-3 py-1 text-sm text-muted-foreground">
                {auditor ? 1 : 0} / 1 Slots Used
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!auditor ? (
              <div className="rounded-lg border-2 border-dashed py-8 text-center text-sm text-muted-foreground">
                No auditors have been granted access yet.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-sm transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 truncate font-mono text-sm font-medium" title={auditor}>
                        <span className="sm:hidden">{formatAddress(auditor)}</span>
                        <span className="hidden sm:inline">{shortHash(auditor)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Active Auditor</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary">Active</Badge>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRevokeClick(auditor)}
                        disabled={txPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Assign auditor?</AlertDialogTitle>
              <AlertDialogDescription>
                This will write {newAddress.trim()} to the audit registry as your auditor. This is a
                public onchain transaction.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmGrantAccess} disabled={txPending}>
                Assign Auditor
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={revokeDialogOpen}
          onOpenChange={(open) => {
            setRevokeDialogOpen(open);
            if (!open) setAuditorToRevoke(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke access?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {auditorToRevoke} as your assigned auditor onchain. Your auditor will
                no longer receive outcome records for new transfers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmRevokeAccess}
                disabled={txPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Revoke Access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
