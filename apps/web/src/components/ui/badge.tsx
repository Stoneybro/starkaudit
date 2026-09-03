import * as React from "react"
import { cn } from "@/lib/utils"

const badgeClass: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/10 text-emerald-600 border-0 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 border-0 dark:text-amber-400",
  destructive: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  outline: "border-border text-foreground",
  muted: "bg-muted text-muted-foreground border-0",
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof badgeClass }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        badgeClass[variant],
        className,
      )}
      {...props}
    />
  )
}
