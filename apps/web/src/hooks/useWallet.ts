"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { WalletAccountV6 } from "starknet"
import { StarknetInjectedWallet } from "@starknet-io/get-starknet-wallet-standard"
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
  /** Every account the wallet exposes — one seed can own several contracts. */
  accounts: string[]
  walletName?: string
  wallet?: StarknetWindowObject
  connecting: boolean
  showPicker: boolean
  options: WalletOption[]
  error?: string
}

async function requestAddresses(wallet: StarknetWindowObject): Promise<string[]> {
  const accounts = (await wallet.request({ type: "wallet_requestAccounts" })) as unknown
  if (!Array.isArray(accounts)) return []
  // One seed can own several account contracts — keep every address the
  // wallet reports (order preserved) instead of silently pinning accounts[0].
  const seen = new Set<string>()
  const out: string[] = []
  for (const a of accounts) {
    if (typeof a !== "string" || !a.startsWith("0x")) continue
    const key = a.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
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
  const [state, setState] = useState<WalletState>({ connecting: false, showPicker: false, options: [], accounts: [] })
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  // Subscription to the wallet's accountsChanged event (StarknetWindowObject
  // standard events). Without this the app stays pinned to a stale address
  // when the user switches account inside the wallet — same seed, different
  // account contract, invisible balances and history.
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const clearSubscription = useCallback(() => {
    try {
      unsubscribeRef.current?.()
    } catch {
      // best effort
    }
    unsubscribeRef.current = null
  }, [])

  const handleAccountsChanged = useCallback((incoming: unknown) => {
    const list = Array.isArray(incoming)
      ? [...new Set(incoming.filter((a): a is string => typeof a === "string" && a.startsWith("0x")).map((a) => a))]
      : []
    const deduped = list.filter((a, i) => list.findIndex((b) => b.toLowerCase() === a.toLowerCase()) === i)
    if (deduped.length === 0) {
      // Wallet disconnected/locked — drop the session silently.
      clearSubscription()
      setState({ connecting: false, showPicker: false, options: [], accounts: [] })
      return
    }
    setState((s) => ({
      ...s,
      accounts: deduped,
      // Keep the current selection if the wallet still lists it.
      address: s.address && deduped.some((a) => a.toLowerCase() === s.address!.toLowerCase())
        ? s.address
        : deduped[0],
    }))
  }, [clearSubscription])

  const subscribeAccounts = useCallback((wallet: StarknetWindowObject) => {
    clearSubscription()
    try {
      const maybeOn = (wallet as unknown as { on?: unknown }).on
      if (typeof maybeOn !== "function") return
      const handler = (accounts?: string[]) => handleAccountsChanged(accounts)
      ;(maybeOn as (event: string, h: (a?: string[]) => void) => void).call(wallet, "accountsChanged", handler)
      unsubscribeRef.current = () => {
        try {
          const maybeOff = (wallet as unknown as { off?: unknown }).off
          if (typeof maybeOff === "function") {
            ;(maybeOff as (event: string, h: (a?: string[]) => void) => void).call(wallet, "accountsChanged", handler)
          }
        } catch {
          // best effort
        }
      }
    } catch {
      // Wallets without standard events — connect-time state still applies.
    }
  }, [clearSubscription, handleAccountsChanged])

  // Release the subscription on unmount.
  useEffect(() => () => clearSubscription(), [clearSubscription])

  const selectAccount = useCallback((address: string) => {
    setState((s) => {
      if (!s.accounts.some((a) => a.toLowerCase() === address.toLowerCase())) return s
      return { ...s, address }
    })
  }, [])

  const connectTo = useCallback(async (option: WalletOption) => {
    setState((s) => ({ ...s, connecting: true, showPicker: false, error: undefined }))
    try {
      const wallet = await getStarknet().enable(option.wallet)
      const addresses = await requestAddresses(wallet)
      if (addresses.length === 0) {
        setState({ connecting: false, showPicker: false, options: [], accounts: [], error: "Wallet connected but returned no account." })
        return
      }
      subscribeAccounts(wallet)
      setState({ connecting: false, showPicker: false, options: [], accounts: addresses, address: addresses[0], walletName: option.name, wallet })
    } catch (e: unknown) {
      setState({
        connecting: false,
        showPicker: false,
        options: [],
        accounts: [],
        error: e instanceof Error ? e.message.slice(0, 160) : "Connection failed.",
      })
    }
  }, [subscribeAccounts])

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: undefined }))
    try {
      const gstarknet = getStarknet()
      const wallets = (await gstarknet.getAvailableWallets()).filter(isStarknetWallet)
      if (wallets.length === 0) {
        setState({ connecting: false, showPicker: false, options: [], accounts: [], error: "No Starknet wallet found — install Ready, Argent or Braavos." })
        return
      }
      const options = wallets.map((w) => ({ id: w.id, name: w.name ?? w.id, wallet: w }))
      if (options.length === 1) {
        const single = options[0]
        setState({ connecting: true, showPicker: false, options: [], accounts: [] })
        await connectTo(single)
        return
      }
      setState({ connecting: false, showPicker: true, options, accounts: [] })
    } catch (e: unknown) {
      setState({
        connecting: false,
        showPicker: false,
        options: [],
        accounts: [],
        error: e instanceof Error ? e.message.slice(0, 160) : "Connection failed.",
      })
    }
  }, [connectTo])

  const closePicker = useCallback(() => {
    setState((s) => ({ ...s, showPicker: false, options: [], connecting: false }))
  }, [])

  const disconnect = useCallback(async () => {
    clearSubscription()
    try {
      await getStarknet().disconnect()
    } catch {
      // best effort
    }
    setState({ connecting: false, showPicker: false, options: [], accounts: [] })
  }, [clearSubscription])

  // Account bound to the connected wallet for signing transactions.
  // WalletAccountV6 adds the STRK20 privacy methods (strk20InvokeTransaction,
  // strk20Balances) on top of the classic execute() used by the registry panel.
  const getAccount = useCallback((): WalletAccountV6 | undefined => {
    const { address, wallet } = stateRef.current
    if (!address || !wallet) return undefined
    return new WalletAccountV6({
      provider: getProvider(),
      // WalletAccountV6 requires a Wallet Standard wallet (probes
      // features["standard:events"]) — wrap the injected StarknetWindowObject.
      // Cast: core 4.x and wallet-standard 6.x pin different @starknet-io/types-js
      // versions, so TS sees two nominally distinct StarknetWindowObject types.
      walletProvider: new StarknetInjectedWallet(wallet as never),
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
        return requestAddresses(w).then((addresses) => ({ w, addresses }))
      })
      .then((restored) => {
        if (!cancelled && restored && restored.addresses.length > 0) {
          subscribeAccounts(restored.w)
          setState({ connecting: false, showPicker: false, options: [], accounts: restored.addresses, address: restored.addresses[0], walletName: restored.w.name ?? restored.w.id, wallet: restored.w })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [subscribeAccounts])

  return { ...state, connect, connectTo, closePicker, disconnect, selectAccount, getAccount, ready: !!state.address }
}
