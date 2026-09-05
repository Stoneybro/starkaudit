"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Send,
  Activity,
  LogOut,
  RotateCw,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import CopyText from "@/components/ui/copy";
import { truncateAddress } from "@/utils/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

export type AppView = "settings" | "payments" | "activity";

const navItems: {
  id: AppView;
  title: string;
  icon: React.ElementType;
}[] = [
  { id: "settings", title: "Settings", icon: Settings },
  { id: "payments", title: "Payments", icon: Send },
  { id: "activity", title: "Activity", icon: Activity },
];

type AppSidebarProps = {
  walletAddress?: string;
  balance?: string | null;
  balanceLoading?: boolean;
  onRefreshBalance?: () => void;
  /** Shielded (private STRK20) balance shown under the public balance. */
  shieldedBalance?: string | null;
  shieldedLoading?: boolean;
  onRefreshShielded?: () => void;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  isLocked?: boolean;
  lockedViews?: AppView[];
  onDisconnect?: () => void | Promise<void>;
} & React.ComponentProps<typeof Sidebar>;

export function AppSidebar({
  walletAddress,
  balance,
  balanceLoading = false,
  onRefreshBalance,
  shieldedBalance = null,
  shieldedLoading = false,
  onRefreshShielded,
  activeView,
  onNavigate,
  isLocked = false,
  lockedViews = [],
  onDisconnect,
  ...props
}: AppSidebarProps) {
  const router = useRouter();
  const actualWalletAddress = walletAddress;

  const [logoutOpen, setLogoutOpen] = React.useState(false);

  const symbol = "STRK";

  const handleDisconnect = async () => {
    try {
      await onDisconnect?.();
    } finally {
      toast("Wallet disconnected");
      setLogoutOpen(false);
      router.push("/");
    }
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="md:h-12 md:p-0  hover:bg-transparent active:bg-transparent"
              onClick={() => router.push("/")}
              tooltip="Go home"
            >
              <div className="flex aspect-square size-6 items-center justify-center shrink-0">
                <Image
                  src="/starkaudit-logo-light.svg"
                  alt="StarkAudit"
                  width={32}
                  height={32}
                  className="h-5 w-auto"
                />
              </div>
              <span className="font-bold r text-lg truncate">
                StarkAudit
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {actualWalletAddress && (
                <SidebarMenuItem className="mb-6">
                  <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm group-data-[collapsible=icon]:hidden">
                    <div className="flex flex-col px-4 py-3 bg-muted/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Balance
                        </span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              onClick={() => onRefreshBalance?.()}
                              disabled={balanceLoading}
                              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              <RotateCw className={`h-3.5 w-3.5 ${balanceLoading ? 'animate-spin' : ''}`} />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Refresh Balance</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        {balanceLoading || balance === undefined ? (
                          <span className="text-2xl font-semibold tracking-tight text-muted-foreground/60 animate-pulse">
                            ···
                          </span>
                        ) : (
                          <span className="text-2xl font-semibold tracking-tight text-foreground">
                            {balance ?? "—"}
                          </span>
                        )}
                        <span className="text-sm font-medium text-muted-foreground">
                          {symbol}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Shielded
                      </span>
                      <span className="flex items-center gap-2">
                        {shieldedLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <span className="flex items-baseline gap-1">
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {shieldedBalance ?? "—"}
                            </span>
                            <span className="text-xs font-medium text-muted-foreground">{symbol}</span>
                          </span>
                        )}
                        {onRefreshShielded && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger
                                onClick={() => onRefreshShielded?.()}
                                disabled={shieldedLoading}
                                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              >
                                <RotateCw className={`h-3 w-3 ${shieldedLoading ? 'animate-spin' : ''}`} />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">Refresh shielded balance (wallet will ask for consent)</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/40">
                      <span className="text-sm font-mono text-muted-foreground">
                        {truncateAddress(actualWalletAddress)}
                      </span>
                      <CopyText text={actualWalletAddress} />
                    </div>
                  </div>
                </SidebarMenuItem>
              )}

              {navItems.map((item) => {
                const isItemLocked = isLocked || lockedViews.includes(item.id);
                const lockHint = "Complete setup to unlock";
                return (
                <SidebarMenuItem key={item.id}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        className={isItemLocked ? "cursor-not-allowed w-full" : "w-full"}
                        render={<span />}
                      >
                        <SidebarMenuButton
                          isActive={!isItemLocked && activeView === item.id}
                          onClick={() => !isItemLocked && onNavigate(item.id)}
                          tooltip={isItemLocked ? undefined : item.title}
                          className={`gap-3 py-5 mt-1 rounded transition-opacity w-full ${
                            isItemLocked
                              ? "opacity-40 pointer-events-none select-none"
                              : ""
                          }`}
                          aria-disabled={isItemLocked}
                        >
                          <item.icon className="shrink-0" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isItemLocked && (
                        <TooltipContent side="right">
                          <p className="text-xs">{lockHint}</p>
                        </TooltipContent>
                        )}
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
                );
              })}

              {actualWalletAddress && (
                <SidebarMenuItem className="mt-4">
                  <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                    <AlertDialogTrigger
                      render={
                        <SidebarMenuButton className="gap-3 py-5 rounded transition-all w-full text-destructive hover:text-destructive hover:bg-destructive/10" />
                      }
                    >
                      <LogOut className="shrink-0" />
                      <span>Log Out</span>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Log out?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This disconnects your Starknet wallet session. You can reconnect at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Log out
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
