import * as React from "react"
import { cn } from "@/lib/utils"

const buttonClass: Record<string, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border text-foreground hover:bg-muted",
  ghost: "hover:bg-muted hover:text-muted-foreground",
}

const sizeClass: Record<string, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-base",
}

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonClass
  size?: keyof typeof sizeClass
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        buttonClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  )
}
