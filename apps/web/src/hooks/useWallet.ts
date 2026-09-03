"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { WalletAccount } from "starknet"
import { getStarknet } from "@starknet-io/get-starknet-core"
import type { StarknetWindowObject } from "@starknet-io/get-starknet-core"
import { getProvider } from "@/lib/starknet"

export type WalletOption = {
  id: string
  name: string
  wallet: StarknetWindowObject
}

export type WalletState = {
  address?: string
  walletName?: string
  wallet?: StarknetWindowObject
  connecting: boolean
  showPicker: boolean
  options: WalletOption[]
  error?: string
}

async function requestAddress(wallet: StarknetWindowObject): Promise<string | undefined> {
  const accounts = (await wallet.request({ type: "wallet_requestAccounts" })) as unknown
  if (Array.isArray(accounts) && typeof accounts[0] === "string") return accounts[0]
  return undefined
}

// MetaMask / EVM-only providers sometimes surface in the scan — they can't
// serve Starknet requests, so filter to wallets advertising Starknet chains.
function isStarknetWallet(w: StarknetWindowObject): boolean {
  const chains = (w as unknown as { chains?: unknown }).chains
  if (Array.isArray(chains)) {
    return chains.some((c) => typeof c === "string" && c.includes("starknet"))
  }
  return true
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({ connecting: false, showPicker: false, options: [] })
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  const connectTo = useCallback(async (option: WalletOption) => {
    setState((s) => ({ ...s, connecting: true, showPicker: false, error: undefined }))
    try {
      const wallet = await getStarknet().enable(option.wallet)
      const address = await requestAddress(wallet)
      if (!address) {
        setState({ connecting: false, showPicker: false, options: [], error: "Wallet connected but returned no account." })
        return
      }
      setState({ connecting: false, showPicker: false, options: [], address, walletName: option.name, wallet })
    } catch (e: unknown) {
      setState({
        connecting: false,
        showPicker: false,
        options: [],
        error: e instanceof Error ? e.message.slice(0, 160) : "Connection failed.",
      })
    }
  }, [])

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: undefined }))
    try {
      const gstarknet = getStarknet()
      const wallets = (await gstarknet.getAvailableWallets()).filter(isStarknetWallet)
      if (wallets.length === 0) {
        setState({ connecting: false, showPicker: false, options: [], error: "No Starknet wallet found — install Ready, Argent or Braavos." })
        return
      }
      const options = wallets.map((w) => ({ id: w.id, name: w.name ?? w.id, wallet: w }))
      if (options.length === 1) {
        const single = options[0]
        setState({ connecting: true, showPicker: false, options: [] })
        await connectTo(single)
        return
      }
      setState({ connecting: false, showPicker: true, options })
    } catch (e: unknown) {
      setState({
        connecting: false,
        showPicker: false,
        options: [],
        error: e instanceof Error ? e.message.slice(0, 160) : "Connection failed.",
      })
    }
  }, [connectTo])

  const closePicker = useCallback(() => {
    setState((s) => ({ ...s, showPicker: false, options: [], connecting: false }))
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await getStarknet().disconnect()
    } catch {
      // best effort
    }
    setState({ connecting: false, showPicker: false, options: [] })
  }, [])

  // Account bound to the connected wallet for signing transactions.
  const getAccount = useCallback((): WalletAccount | undefined => {
    const { address, wallet } = stateRef.current
    if (!address || !wallet) return undefined
    return new WalletAccount({
      provider: getProvider(),
      walletProvider: wallet as unknown as Parameters<typeof WalletAccount.connect>[1],
      address,
      cairoVersion: "1",
    })
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
          setState({ connecting: false, showPicker: false, options: [], address: restored.address, walletName: restored.w.name ?? restored.w.id, wallet: restored.w })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return { ...state, connect, connectTo, closePicker, disconnect, getAccount, ready: !!state.address }
}
