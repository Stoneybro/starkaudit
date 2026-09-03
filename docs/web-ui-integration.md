# Web-UI -> StarkAudit Integration Guide

> How to transplant the `web-ui/` (Complyr / Zama FHE / EVM) design system into `apps/web/` (ShadowAudit / STRK20 / Starknet) without carrying EVM baggage.

**Source:** `web-ui/` is a UI-only replica of `Complyr` (visual copy, all chain logic mocked via `src/lib/mock.ts:1`). **Target:** `apps/web/` is empty Next.js 16.3.4 + `starknet@10.4.0` (`apps/web/package.json:14`) that must become the `ShadowAudit` dashboard per `proposal.md:5` + `proposedspec.md:7` + `build_order.md:7`. Read those 3 docs first.

---

## 1. Mental Model Before You Touch Code

| Concept | `web-ui` (Complyr) - OLD | `apps/web` (ShadowAudit) - NEW |
|---|---|---|
| **Brand** | `Complyr - Private Audit Infrastructure` (`web-ui/src/app/layout.tsx:18`) | `ShadowAudit - Private Payroll + Compliance Without Disclosure` (`proposal.md:1`) |
| **Chain** | Ethereum Sepolia, `wagmi/viem/RainbowKit`, Alchemy RPC (`web-ui/src/lib/wagmi.ts:10`) | Starknet `SN_SEPOLIA` (dev) + `SN_MAIN` pool `0x040337b1...812a` (`build_order.md:5`), `starknet.js 10.4.0` + `@starknet-io/get-starknet` |
| **Privacy** | Zama FHE: `createEncryptedInput().add64().encrypt()` (`web-ui/src/lib/fhe.ts:45`), KMS decrypt session (`decrypt-session.ts:60`) | STRK20 Privacy Pool: `createPrivateTransfers({viewingKeyProvider: BigInt(k), provingProvider, discoveryProvider})` (`proposal.md:50`), notes with `nullifier=h(NULLIFIER_TAG...)`, `enc_amount=h(ENC_AMOUNT_TAG...)+amount`, `note_id=h(NOTE_ID_TAG...)` (`proposal.md:33`) |
| **Currency** | `cUSDC / USDC` 6 decimals (`web-ui/src/lib/mock.ts:11`, `app-sidebar.tsx:95`) | `STRK` 18 decimals (`build_order.md:49` `2 STRK = 2000000000000000000n`) |
| **Audit Proof** | FHE-encrypted thresholds evaluated on-chain (`Features.tsx:25`) | Poseidon commitments: `audit_commitment=h(PRIVATE_AUDIT_TAG...)`, `dup_commit=h(DUP_TAG...)`, `threshold_commitment=h(THRESHOLD_TAG...)` + Cairo ZK `amount<=threshold` bound to `nullifier+enc_amount+note_id` (`proposedspec.md:61`) |
| **Contracts** | `ComplyrFactory`, `AuditRegistry.sol`, `ConfidentialUSDC` (EVM ABIs in `web-ui/src/lib/abis/`) | `AuditRegistry.cairo` + `PayrollAnonymizer.cairo:98` `privacy_invoke(Span<OpenNoteDeposit>)->Span<OpenNoteDeposit>` + reuse or `offchain_verified` verifier (`proposedspec.md:5`) |
| **Auditor View** | `Decrypt` button reveals amount (`Findings.tsx:97`, `TransactionHistory.tsx:152`) | **Never decrypts.** Shows only `pass/fail`, `is_duplicate`, `exception`, `unverified_binding/offchain_verified` badges + `nullifier` + Voyager link (`proposal.md:35`, `proposal.md:70`) |

> **If you keep any FHE/EVM copy, the demo is factually dishonest vs on-chain flow in `report.md:8`.**

---

## 2. What to Keep vs Delete

### KEEP - Copy verbatim to `apps/web/src`

These are pure UI and already match `proposedspec.md:7` `Dashboard` spec.

```
web-ui/src/components/ui/*           -> apps/web/src/components/ui/*      (38 shadcn primitives, base-nova already in components.json:3)
web-ui/src/app/globals.css           -> apps/web/src/app/globals.css      (design tokens --color-surface etc, tailwind v4 + tw-animate)
web-ui/src/components/home/*         -> apps/web/src/components/home/*    (Hero, Navigation, Problem, Features, HowItWorks, UseCases, Technology, FinalCTA, Footer)
web-ui/src/components/auth/*         -> apps/web/src/components/auth/*    (LoginPage/WrongNetworkPage shell - will rewire to Starknet wallets)
web-ui/src/lib/audit-enums.ts:6      -> apps/web/src/lib/audit-enums.ts   (Category enum OPEX/CAPEX/PAYROLL... - reusable as GL tag inside audit_commitment)
web-ui/src/lib/utils.ts              -> apps/web/src/lib/utils.ts         (cn helper)
web-ui/src/utils/format.ts           -> apps/web/src/utils/format.ts      (adapt truncateAddress to Starknet 66-char hex)
web-ui/public/complyrlogo*           -> apps/web/public/shadow-audit-logo* (replace logo files)
```

### DELETE - Do NOT copy (EVM/FHE baggage)

```
web-ui/src/lib/wagmi.ts              -- wagmi/viem/RainbowKit/Alchemy
web-ui/src/lib/fhe.ts                -- Zama relayer-sdk singleton
web-ui/src/lib/fhe-handle.ts         -- viem toHex handle
web-ui/src/lib/decrypt-session.ts    -- Zama KMS EIP-712 session
web-ui/src/lib/CA.ts                 -- EVM contract addresses
web-ui/src/lib/abis/*                -- AuditRegistry.json etc (EVM ABIs)
web-ui/src/lib/contact-store.ts      -- Complyr-specific
web-ui/src/lib/mock.ts               -- will replace with real Starknet mock then real SDK
web-ui/src/hooks/*                   -- all mocked (useSingleTransfer, useConfidentialBalance etc) - rebuild for Starknet below
web-ui/src/components/providers.tsx  -- UI-only TooltipProvider will be replaced
```

### REBUILD - Keep UX shape, rewrite internals

| `web-ui` file (mock) | `apps/web` target (Starknet) | What changes inside |
|---|---|---|
| `hooks/payments/useSingleTransfer.ts:18` | `hooks/usePayrollTransfer.ts` | `mock 800ms delay` -> `transfers.build().with(token, t=>t.deposit().autoSetup().surplusTo())` + `invoke(PayrollAnonymizer, deposits)` + `provingBlockId=head-10, tip:0n, proofFacts` (`build_order.md:32`) |
| `hooks/useConfidentialBalance.ts:18` | `hooks/useShieldedBalance.ts` | `MOCK_BALANCE` -> `discoverNotes({tokens:[BigInt(STRK)]})` + viewing-key decrypt, handle `index 0/1` salts (`report.md:8`) |
| `hooks/useTransactionHistory.ts:22` | `hooks/useAuditEvents.ts` | `MOCK_TRANSACTIONS` -> `provider.getEvents` filter `ProofSubmitted` + `Deposit`/`Nullifier` pool events |
| `hooks/useOnboardingState.ts:16` | `hooks/useStarknetOnboarding.ts` | `always ready` -> check `get-starknet` Ready, `register()` `ViewingKeySet` exists, `approve(STRK, pool)` allowance, wait `head-10>block` maturity (`build_order.md:26`) |
| `components/providers.tsx:9` | `components/providers.tsx` | `TooltipProvider` only -> add `StarknetProvider` + wallet discovery + `IndexerDiscoveryProvider` vs `ContractDiscovery` fallback (`report.md:20`) |
| `components/onboarding/OnboardingShell.tsx:16` | `components/onboarding/StarknetShell.tsx` | `MOCK_WALLET` pass -> real `WalletAccountV6` + `cairoVersion:"1"` + `AddressMap BigInt` (`build_order.md:32`) |

---

## 3. Copy Changes - Every String That Lies If Not Changed

Do a project-wide find/replace on copied files. Checklist with exact locations:

#### Brand

- [ ] `web-ui/src/app/layout.tsx:18` `Complyr — Private Audit Infrastructure` -> `ShadowAudit — Private Payroll + Compliance Without Disclosure`
- [ ] `Navigation.tsx:15`, `Footer.tsx:16`, `app-sidebar.tsx:116`, `auditor-sidebar.tsx:105` `Complyr` wordmark/logo -> `ShadowAudit` (replace SVG files)
- [ ] `Footer.tsx:32` `github.com/Stoneybro/complyr` -> your repo + Voyager links for `AuditRegistry`/`PayrollAnonymizer` deployments
- [ ] `onboarding/CloneActivationStep.tsx:12` `ComplyrFactory.deployRegistry` + clone pair -> `AuditRegistry.register_business()` one registry (`proposedspec.md:5`)

#### Chain / Network

- [ ] `Technology.tsx:4` `Ethereum Sepolia/Chainlink/Zama FHE/Envio/ERC-4337` pills -> `Starknet Sepolia & Mainnet / STRK20 Pool / Privacy SDK / Cairo / Poseidon`
- [ ] `Footer.tsx:39` `ETHEREUM SEPOLIA / ZAMA FHE / ENVIO` -> `STARKNET / STRK20 POOL / CAIRO ZK`
- [ ] `Hero.tsx:23` `Built with Zama FHE and ERC-7984` -> `Built on Starknet STRK20 Privacy Pool + Cairo ZK Proofs`
- [ ] `FinalCTA.tsx:29` `Complyr is live on Ethereum Sepolia. Encrypted audit records` -> `ShadowAudit is live on Starknet Mainnet. Pay privately, prove after. Pool 0x0403...12a`
- [ ] `WrongNetworkPage.tsx:10` `Please switch to Sepolia` -> `Please switch to Starknet Sepolia (dev) / Mainnet (payroll)` + Braavos/Argent connect

#### Token

- [ ] `PaymentForm.tsx:230` `USDC` + `AuditList.tsx:97` `Amount (USDC)` + `Analytics.tsx:16` `$` + `app-sidebar.tsx:95` `cUSDC` + `mock.ts:11` `USDC` thresholds -> `STRK` everywhere. Amounts: `STRK 18 decimals` (`2 STRK = 2000000000000000000n`, `threshold 1 STRK = 1000000000000000000n`).
- [ ] `mint/page.tsx:12` `Simulating Zama FHE encryption...Mint 10,000 cUSDC` -> `Shield 2 STRK (public Deposit) -> wait 10 blocks maturity -> private note ready` (`build_order.md:49`)

#### Privacy Mechanism (most important)

- [ ] `HowItWorks.tsx:11` 4 steps `FHE encrypts / Trustless Callback / Runtime Ciphertext Evaluation / Isolated Reveal` -> `01 Shield (public Deposit) / 02 Private Transfer or Batch via PayrollAnonymizer (privacy_invoke) / 03 ZK Commit (audit_commitment + dup_commit + threshold_commitment + Poseidon bindings) / 04 Registry Verifies pass/fail/duplicate`
- [ ] `Features.tsx:20` `Complyr updates GL buckets via FHE.select` -> `AuditRegistry checks dup_commit window + threshold proof, no amount ever leaves business`
- [ ] `Features.tsx:25` + `ThresholdEditor.tsx:139` `Thresholds are FHE-encrypted` -> `Auditor posts threshold_commitment = poseidon(threshold, auditor_salt) once; business proves amount<=threshold in ZK`
- [ ] `TestRules.tsx:67` `Value would be FHE encrypted` -> `Threshold hidden as hash - structuring mitigated by timestamped commitment`
- [ ] `PaymentForm.tsx:191` `Send a secure, FHE-encrypted payment` + `CardFooter:306` `encrypted locally via FHE` -> `Send via STRK20 private note. Values blinded via Poseidon commitments; auditor sees only pass/fail.`
- [ ] `Technology.tsx:40` `AUDIT_PAYLOAD.JSON encrypted_context` example -> `ProofBundle {nullifier, note_id, enc_amount, audit_commitment, dup_commit, proof}` (`proposedspec.md:61`)

#### Auditor UX (remove decrypt)

- [ ] `Findings.tsx:88`/`Payments.tsx:74`/`TransactionHistory.tsx:152` `Decrypt / Encrypted -> Decrypted amount` buttons -> **Delete decrypt flow.** Replace with `Verify proof -> Pass / Fail / Duplicate / Exception` + `nullifier` copy + `Voyager tx` link + badges `unverified_binding` (tags not confirmed) / `offchain_verified` (no on-chain verifier) (`proposal.md:85`).
- [ ] `Analytics.tsx:43` `Encrypted rollup totals...Decrypt All` -> `Aggregate pass rate + flagged/duplicates (no amounts). Totals never shown - auditor-dictionary-attackable dup_commit noted` (`proposal.md:84`).
- [ ] `AuditorManagement.tsx:145` `Ethereum Address` + `69` `Invalid Ethereum address` regex `0x[a-fA-F0-9]{40}` -> `Starknet Address` + Starknet address validation `0x0...` 66-char hex + `register_business()` only auditor can call.

#### Marketing Prose

- [ ] `Hero.tsx:19` `Confidential audit infrastructure for private on-chain payments.` -> keep headline style but: `Private payroll that hides every payment but proves every rule on mainnet.` (`proposal.md:106`)
- [ ] `Problem.tsx:27` `blind your auditors...handing over decryption keys` -> `No way to prove amount <= threshold + no duplicates without sharing k (SetViewingKey viewing-keys.md:53 exposes everything)` (`proposal.md:27`)
- [ ] `UseCases.tsx:40` `Who is Complyr for?` + 4 cards -> `Who is ShadowAudit for?` + `RFP-11 Private payroll / IDEA-22 Compliance infra` (`proposal.md:20`) + keep structure

---

## 4. Implementation Steps (lean, in order)

**Step 0 - Prep (15 min)**
```bash
# from repo root
pnpm --filter web add starknet@10.4.0 @starknet-io/get-starknet-discovery@6.0.3 @starknet-io/get-starknet-wallet-standard@6.0.3
# SDK 0.14.3-rc.6 is GH Packages - needs user ~/.npmrc auth per build_order.md:14
gh auth refresh -h github.com -s read:packages
pnpm config set @starkware-libs:registry https://npm.pkg.github.com --location=project
# then audit-sdk install via that registry
```

**Step 1 - Transplant shell (30 min, no logic yet)**
1. Copy `web-ui/src/components/ui/*` + `web-ui/src/app/globals.css` -> `apps/web/src/...` (overwrite starter `apps/web/src/app/page.tsx:1` + `globals.css`).
2. Copy `web-ui/src/components/home/*` -> `apps/web/src/components/home/*`.
3. Verify `pnpm --filter web build` passes (should, only UI). If fails, `components.json` already `base-nova` - run `npx shadcn@latest info` check per `web-ui/AGENTS.md`.

**Step 2 - Copy fix (30 min, do before wiring chain)**
Go through checklist §3 top-to-bottom in your editor. Search `Complyr`, `Zama`, `FHE`, `USDC`, `cUSDC`, `Sepolia`, `Ethereum`, `wagmi`, `RainbowKit` across `apps/web/src`. Replace. This prevents shipping dishonest claims to judges (`Docs 15%` needs trust table == code per `proposal.md:104`).

**Step 3 - Providers + Onboarding (1 hr)**
Replace `providers.tsx` with Starknet providers (see `packages/audit-sdk/src/connect.ts:60` for correct `createPrivateTransfers` wiring: `BigInt(VIEWING_KEY)`, `provingProvider:{url,chainId:SN_SEPOLIA}`, `discoveryProvider`, `pool`, `cairoVersion:"1"`, `AddressMap BigInt`, `provingBlockId=head-10`, `tip:0n`, `proofFacts` conditional). Rebuild `OnboardingShell` to gate on `get-starknet` `Ready` + `ViewingKeySet` on Voyager (`report.md:8` `0x7b390c...`).

**Step 4 - Mock -> Real hooks (2 hrs, still Sepolia)**
Keep `mock.ts` shape but swap values: `STRK` instead of `USDC`, balances as `bigint` 18 decimals. Then replace one hook at a time with real SDK calls (start with `useShieldedBalance` using `report.md:8` 2 notes as test data, then `usePayrollTransfer` for `deposit 2 STRK` -> `Deposit` event). Keep `(mock)` badges until Voyager `Succeeded`.

**Step 5 - Business/Auditor pages (2 hrs)**
Wire `apps/web/src/app/(protected)/payments/page.tsx` pattern to `apps/web/src/app/business/page.tsx` + `auditor/page.tsx` per `proposedspec.md:7`:
- `/business`: SDK status + Shield/pay + batch via `PayrollAnonymizer` (`deposits=[{note_id:openNoteIds[i], token, amount}]` as `InvokeExternal`).
- `/auditor`: `threshold_commitment` input + `provider.getEvents` feed for `ProofSubmitted` with `pass/is_duplicate/unverified_binding/offchain_verified` splits. **Never render amount.**

**Step 6 - Verify build + Voyager**
`pnpm --filter web build` must pass. Record `strk20.json` 4 txs all `Succeeded` on `sepolia.voyager.online` before switching to `SN_MAIN` (`build_order.md:104`). 3-min video must show `pass/fail` with no amount visible.

---

## 5. Common Pitfalls (from `report.md:18`)

- **Starknet version split:** `web` + `audit-sdk` pin `10.4.0`, SDK pulls `10.5.0` transitively - align to avoid silent mismatch.
- **`.npmrc` auth:** pnpm 10 blocks `${NODE_AUTH_TOKEN}` in project `.npmrc` - put `//npm.pkg.github.com/:_authToken` in `~/.npmrc`.
- **Proving URLs:** Sepolia = `CoreStars https://transaction-prover...` + Indexer `35.192.48.142:8080` (often `ConnectTimeout` -> `ContractDiscovery` fallback). Mainnet = `Starkscan https://api.starkscan.co/v1/SN_MAIN/prove`. Don't conflate (`report.md:12`).
- **Account class:** Use OZ `0x05b4b53...` (`cairoVersion:"1"`), not `0x061dac...` (undeclared) or Argent (fails `multicall-failed` on pool) (`report.md:15`).
- **Fee token:** STRK `0x04718...` pays deploy/register, not ETH. Faucet `faucet.starknet.io` gives STRK only.
- **`head-10` rule:** Every tx needs `provingBlockId=head-10` and `wait head-10>receiptBlock` for maturity. Missing this = `INVALID_NONCE` or immature note spend.
- **Dup brute-force:** `dup_commit` is deterministic (no salt) so auditor can brute-force `counterparty+amount+period` (`proposal.md:84`). Call this out in docs, don't hide.

---

## 6. Quick Reference: File Map for Reviewers

```
docs/web-ui-integration.md  <- this file
proposal.md:1               -- ShadowAudit pitch + trust table
proposedspec.md:7           -- repo layout, circuit, registry, anonymizer specs
build_order.md:7            -- stage gates Sepolia->Mainnet, never-cut stages 3+5
report.md:8                 -- what succeeded so far (2 STRK notes, viewing key match)
web-ui/src/app/layout.tsx:18 -- brand to replace
web-ui/src/components/home/* -- marketing to keep but reword
web-ui/src/lib/wagmi.ts:10  -- delete (EVM)
web-ui/src/lib/fhe.ts:29    -- delete (FHE)
```

**Success =** `apps/web` looks like `web-ui` polish, but every string, hook, and Voyager link tells the STRK20 truth. Judging `Product 30%` rewards a live mainnet dashboard with real `Deposit`/`Nullifier` events, not a pretty mock.
