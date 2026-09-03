# Complyr — UI-Only Replica (`apps/web-ui`)

This is a **visual copy** of `apps/web` with all blockchain / FHE / wallet functionality stripped and replaced by static mock data. Use it as a design system / UI shell for another app.

- **Port:** `3001` (original `web` runs on `3000`)
- **No wallet, no RPC, no env vars required.**
- All blockchain calls are mocked — buttons show `(mock)` and toast success without a chain tx.
- Styling is 1:1: Tailwind v4, `base-nova`, Base UI, `globals.css` tokens, `framer-motion` preserved.

## Quick start

```bash
pnpm install          # from repo root or apps/web-ui
pnpm --filter web-ui dev   # http://localhost:3001
pnpm --filter web-ui build # production build
```

## What was mocked

- `src/components/providers.tsx` → removed `wagmi`/`RainbowKit`/`tanstack` providers
- `src/lib/mock.ts` → central mock data (wallet, balance, auditors, payments, findings, analytics)
- `src/hooks/*` → `useOnboardingState`, `useAuditorPortalState`, `useConfidentialBalance`, `useTransactionHistory`, `useFindingsPuller`, `payments/useSingleTransfer` all return static data
- `PaymentForm`, `AuditorManagement`, `TestRules`, `Findings`, `Analytics`, `Payments`, `TransactionHistory`, `OnboardingShell`, `AuditorShell`, `mint/page`, `payments/page`, `LoginPage` → UI preserved, logic mocked
- `package.json` name = `web-ui`, dev port 3001 (deps kept for compat; can be pruned if desired)

## Reuse

Copy `src/components/ui/*` and `src/components/home/*` for pure design reuse, or keep the whole `src/app` shell and replace `src/lib/mock.ts` with your own data layer.

> Original app: `apps/web` — this folder is intentionally decoupled; changes here do not affect `apps/web`.
