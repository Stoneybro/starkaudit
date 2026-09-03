"use client"

import { useCallback, useEffect, useState } from "react"
import { getProvider } from "@/lib/starknet"
import { errMsg } from "@/lib/utils"
import { fetchRegistryEvents, type ExceptionRecord, type ProofRecord } from "@/lib/registry"

export type ProofFeed = {
  proofs: ProofRecord[]
  exceptions: ExceptionRecord[]
  loading: boolean
  error?: string
  updatedAt?: number
  refresh: () => void
}

export function useProofFeed(enabled = true): ProofFeed {
  const [proofs, setProofs] = useState<ProofRecord[]>([])
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | undefined>(undefined)
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined)

  const apply = useCallback((feed: { proofs: ProofRecord[]; exceptions: ExceptionRecord[] }) => {
    setProofs(feed.proofs)
    setExceptions(feed.exceptions)
    setUpdatedAt(Date.now())
    setLoading(false)
  }, [])

  const fail = useCallback((e: unknown) => {
    setError(errMsg(e, "Failed to load registry events."))
    setLoading(false)
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(undefined)
    fetchRegistryEvents(getProvider()).then(apply, fail)
  }, [apply, fail])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchRegistryEvents(getProvider()).then(
      (feed) => {
        if (!cancelled) apply(feed)
      },
      (e: unknown) => {
        if (!cancelled) fail(e)
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, apply, fail])

  return { proofs, exceptions, loading, error, updatedAt, refresh }
}
