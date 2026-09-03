"use client"

import { useCallback, useEffect, useState } from "react"
import { getStarknet } from "@starknet-io/get-starknet-core"
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core"

export type WalletState = {
  address?: string
  walletName?: string
  connecting: boolean
  error?: string
}

async function requestAddress(wallet: StarknetWindowObject): Promise<string | undefined> {
  const accounts = (await wallet.request({ type: "wallet_requestAccounts" })) as unknown
  if (Array.isArray(accounts) && typeof accounts[0] === "string") return accounts[0]
  return undefined
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({ connecting: false })

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: undefined }))
    try {
      const gstarknet = getStarknet()
      const wallets: StarknetWindowObject[] = await gstarknet.getAvailableWallets()
      if (wallets.length === 0) {
        setState({ connecting: false, error: "No Starknet wallet found — install Argent or Braavos." })
        return
      }
      const wallet = await gstarknet.enable(wallets[0])
      const address = await requestAddress(wallet)
      if (!address) {
        setState({ connecting: false, error: "Wallet connected but returned no account." })
        return
      }
      setState({ connecting: false, address, walletName: wallets[0].name ?? wallets[0].id })
    } catch (e: unknown) {
      setState({ connecting: false, error: e instanceof Error ? e.message.slice(0, 160) : "Connection failed." })
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await getStarknet().disconnect()
    } catch {
      // best effort
    }
    setState({ connecting: false })
  }, [])

  // Restore last session silently.
  useEffect(() => {
    let cancelled = false
    getStarknet()
      .getLastConnectedWallet()
      .then((w) => {
        if (!w) return null
        return requestAddress(w).then((address) => ({ w, address }))
      })
      .then((restored) => {
        if (!cancelled && restored?.address) {
          setState({ connecting: false, address: restored.address, walletName: restored.w.name ?? restored.w.id })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return { ...state, connect, disconnect, ready: !!state.address }
}
