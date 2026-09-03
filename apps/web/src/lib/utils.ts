import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function errMsg(e: unknown, fallback = "Request failed."): string {
  if (e instanceof Error) return e.message.slice(0, 200)
  return fallback
}
