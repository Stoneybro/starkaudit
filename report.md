# StarkAudit — Stage 0/1 Progress Report

**Date:** 2026-09-02  
**Repo:** `C:\Users\HP\OneDrive\Documentos\starkaudit`  
**Pool:** Sepolia `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91` (Mainnet `0x040337...812a` for Stage 8)  
**Spec:** `build_order.md:12-39` vs live docs `strk20-by-example.org` + `github.com/starkware-libs/starknet-privacy/sdk/README.md`

---

## 1. Summary

Stage 0 (Environment) and Stage 1 (SDK Register) are **complete and verified on Sepolia**. The `build_order.md` was stale in 4 critical areas (GH Packages auth, proving relay, fee token, account class) — all fixed in code and verified with a `SUCCEEDED` `ViewingKeySet` transaction.

- **Stage 0 Gate:** `node v24.18.1`, `pnpm 10.34.4`, `gh auth` with `read:packages`, `.npmrc` registry, SDK `0.14.3-rc.6` installed, `VIEWING_KEY` BigInt, `PROVING_SERVICE_URL` + `INDEXER_URL` wired.
- **Stage 1 Gate:** Voyager `Succeeded` + `ViewingKeySet` on pool — `tx 0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906` `block 14448022` from OZ account `0x03132f147f5f210b448bc9d2ece5193bea38d51cfdd4a02dc1ef015e41d72eed`.

---

## 2. Build Order vs Real Docs — Discrepancies Found

| Area | `build_order.md:12-39` | Real docs (2026-08/09) | Impact |
|---|---|---|---|
| **GH Packages auth** | `gh auth refresh -s read:packages` + `export NODE_AUTH_TOKEN` + `pnpm config set @starkware-libs:registry` | Needs **two** configs: `npm config set @starkware-libs:registry https://npm.pkg.github.com` **and** `npm config set '//npm.pkg.github.com/:_authToken' '${NODE_AUTH_TOKEN}'` (or `pnpm config set "//npm.pkg.github.com/:_authToken" <token> --location=user`). Project `.npmrc` must **not** contain token (pnpm 10.34 blocks `${NODE_AUTH_TOKEN}` in project `.npmrc` for security) | Install `401 Unauthorized` before fix |
| **Proving service** | `PROVING_SERVICE_URL` + `INDEXER_URL` from `t.me/sncorestars` for all nets | **Sepolia:** `PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io` + `INDEXER_URL=http://35.192.48.142:8080` (via `ProvingServiceProofProvider`/`IndexerDiscoveryProvider`). **Mainnet:** Starkscan relay `https://api.starkscan.co/v1/SN_MAIN/prove` `X-Starkscan-Api-Key` async `queued→succeeded` + Google sheet whitelist (`packages/audit-sdk/src/prover.ts:3`) | Build order conflated nets; `prover.ts` already Starkscan, `connect.ts` was CoreStars-only |
| **Fee token** | Implicit `ETH` for deploy/register | Sepolia fees pay with **STRK** (`0x04718f5a...38d`) or `ETH` (`0x049d...dc7`). `faucet.starknet.io` now gives **STRK only** (100 STRK), `register` proof `tip:0n` uses STRK. `ETH 0x0` at new accounts → `estimateFee` `Insufficient ERC20 allowance` if forced ETH | Wasted 3h chasing `sepolia stark eth` — STRK is enough |
| **Account class** | `cairoVersion:"1"` any account | **Argent** `0x03607833...` (`0x075fcf...`) wraps `execute` in `multicall` that checks allowance → `argent/multicall-failed` even for `register`. **OZ** `0x05b4b53...` (Sepolia declared) + `0x061dac...` (not declared on Sepolia) — OZ is backend-recommended per SDK README. Correct Sepolia OZ `0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564` → `0x03132f147f...eed` | Argent blocked Stage 1 even with `99.95 STRK`; OZ fixed it |
| **Proving block** | `provingBlockId = getBlockNumber()-10` | Must satisfy `head-10 > deployReceiptBlock` **and** `head-10 > approveReceiptBlock` (transparent-state rule, `sdk/README.md: Sequencing after transparent state`). `build_order.md` comment mentions but doesn't enforce | `register` on fresh account fails if base predates deploy/allowance |
| **`.npmrc` shape** | `pnpm config set @starkware-libs:registry` + `.npmrc` placeholder | `pnpm 10` ignores `${NODE_AUTH_TOKEN}` in project `.npmrc` (`WARN Ignored project-level auth ... Move to user ~/.npmrc`) | `ERR_PNPM_FETCH_401` until moved to `~/.npmrc` via `pnpm config set --location=user` |

---

## 3. Current Implementation

**Files changed (vs `build_order.md` spec):**

- `.npmrc:1` — `@starkware-libs:registry=https://npm.pkg.github.com` only (auth in user `~/.npmrc` via `pnpm config set "//npm.pkg.github.com/:_authToken" "gho_..." --location=user`)
- `packages/audit-sdk/package.json:14` — `starknet 10.4.0` + `@starkware-libs/starknet-privacy-sdk 0.14.3-rc.6` (was missing)
- `apps/web/package.json:8` — added `engines.node >=24` + `starknet 10.4.0` (was missing)
- `packages/audit-sdk/src/connect.ts:1` — uncommented `createPrivateTransfers` import, `buildTransfers(account, viewingKey, chainId: StarknetChainId)` validates `PROVING_SERVICE_URL`/`INDEXER_URL`, `BigInt` range, uses `getPoolAddress(chainId)` for `SEPOLIA_POOL`/`MAINNET_POOL`, exports `createPrivateTransfers`
- `packages/audit-sdk/src/connect.ts:7,51` — fixed `chainId: string` → `constants.StarknetChainId` (TS `0x534e...` type)
- `.env.example:62` — split Sepolia `PROVING_SERVICE_URL`/`INDEXER_URL` vs Starkscan `STARKSCAN_API_KEY` (with whitelist flow)
- `.env:43,58` — `ACCOUNT_ADDRESS=0x03132f147f5f210b448bc9d2ece5193bea38d51cfdd4a02dc1ef015e41d72eed` (OZ, was Argent `0x075fcf...`), `PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io`, `INDEXER_URL=http://35.192.48.142:8080`, `VIEWING_KEY=1573739720664094802632388665104715602604662918941421718295098743729340291350` (decimal BigInt)
- `scripts/register.ts:1` — new Stage 1 runner: `BigInt(VIEWING_KEY)` check, `constants.StarknetChainId`, `getProvingBlockId` `head-10`, `transfers.build().register().execute({provingBlockId})`, `proofDetails` conditional `proofFacts`/`proof`, `tip:0n` + `resourceBounds` estimated `l2_gas 119542080` `l1_gas 0` `overall_fee 5934832810840042176` `+30%`, `invalidateProofNonceCache` on `INVALID_NONCE`, `waitForMaturity` helper
- Root `package.json:23` — added `@starkware-libs/starknet-privacy-sdk 0.14.3-rc.6` + `starknet 10.4.0 -w` for `scripts/` ESM (`node --import tsx/esm --env-file=.env`)

**Verified:** `pnpm --filter @starkaudit/audit-sdk typecheck` pass, `pnpm --filter web build` pass (Next 16.3.4 Turbopack).

---

## 4. Stage 0 — Environment

**Gate `build_order.md:17`:** `node v24` ✓ `scarb`/`snforge` later, `gh auth status` ✓, both URLs ✓

- `node --version` `v24.18.1`, `pnpm 10.34.4`
- `gh auth refresh -h github.com -s read:packages` → token scopes `gist, read:org, read:packages, repo, workflow` (`Stoneybro`)
- `pnpm config set @starkware-libs:registry` + `pnpm config set "//npm.pkg.github.com/:_authToken" --location=user` → `pnpm add` `+72` OK (was `401` with project `.npmrc` `${NODE_AUTH_TOKEN}`)
- `VIEWING_KEY` decimal `157373...1350` `BigInt` in `[1, MAX_VIEWING_KEY]` (`ec.getStarkKey` `0x526ce46b...`)
- Faucet `https://faucet.starknet.io` STRK Sepolia (ETH not needed)

---

## 5. Stage 1 — SDK Register (Sepolia)

**Gate `build_order.md:36`:** Voyager `Succeeded` + `ViewingKeySet` ✓

| Step | Tx | Block | Status | Note |
|---|---|---|---|---|
| **Argent deploy** | `0x075fcf...` `0x03607833...` | 144478... | `SUCCEEDED` `nonce 1` | Pre-existing, funded `99.95 STRK` `0x56b23e0c148365520` |
| **Approve STRK** | `0x7e358902cb2a635f0df66e2eca171160b1eb0a9d5f1992d7e759799fca811c7` | 14447994 | `SUCCEEDED` | `approve(pool, 1000 STRK)` `allowance 0x3635c9adc5dea00000` — fixes pool `Insufficient ERC20 allowance` |
| **OZ deploy** | `0x60fd8f1266c05af24cdd95a258c820aa3f9ff376a1dd5174e8db247744aea12` | 14447951 | `SUCCEEDED` | OZ `0x05b4b53...` `0x03132f...` `pub 0x526ce46b...` `salt 0` `STRK 100` `0x56bc75e2d63100000` |
| **Register (Argent, failed)** | `0x7e10f4a2d8994219c79ddbf73e5e1b28280f6032ff80a4cfc2bb39af1454f9a` | 14447450 | `REVERTED` `argent/multicall-failed` | `estimateFee` `Insufficient ERC20 allowance` (ETH `0x0`) |
| **Register (OZ, failed, no allowance)** | `0x781570616f72141f7178e17e9f06852fe1853ce54a7bb454a2574565fcd1a9c` | 14447973 | `REVERTED` pool `0x0254a6...` `Insufficient ERC20 allowance` | Before `approve`, `resourceBounds` fallback `520000` < `76088960` |
| **Register (OZ, success)** | `0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906` | 14448022 | `SUCCEEDED` | `provingBlock 14448003` `head 14448012-10` `proofFacts 9` `resourceBounds l2_gas 119542080*49636637737` `overall_fee 5934832810840042176` `+30%` `tip:0n` |

**Wiring `packages/audit-sdk/src/connect.ts:60`:**
```ts
createPrivateTransfers({
  account: new Account({provider, address, signer, cairoVersion:"1"}),
  viewingKeyProvider:{getViewingKey: async()=>BigInt(VIEWING_KEY)},
  provingProvider:{url: PROVING_SERVICE_URL, chainId: constants.StarknetChainId.SN_SEPOLIA},
  discoveryProvider:{url: INDEXER_URL}, poolContractAddress: SEPOLIA_POOL
})
provingBlockId = (await provider.getBlockNumber())-10 // 450 validity, 10 maturity
const {callAndProof}= await transfers.build().register().execute({provingBlockId})
const proofDetails= callAndProof.proof.proofFacts?.length ? {proofFacts:..., proof:...}:{}
await account.execute(callAndProof.call,{tip:0n, resourceBounds, ...proofDetails})
```

**Pool:** `0x0254a6...d91` `class 0x007e2bbd7ccc1e68b2695caef70aeb2a3be6cd017b5d5159278ba08f2d8de33f` `selector 0x0246333a...` `execute_actions`

---

## 6. Issues & Fixes

1. **GH Packages 401** → moved auth to user `~/.npmrc` (pnpm 10 security) + `read:packages` scope.
2. **SDK `ERR_PACKAGE_PATH_NOT_EXPORTED`** → `node --import tsx/esm` (ESM `exports "."` has `import` not `require`), root `starknet 10.4.0` for `scripts/` ESM.
3. **Argent `multicall-failed`** → switched to OZ `0x05b4b53...` (Sepolia declared, `0x061dac...` not declared).
4. **Insufficient allowance** → `approve(pool, 1000 STRK)` before `register` (transparent state, wait `head-10 >14447994` → `14448007` mature).
5. **Resource bounds** — `estimateFee` `Insufficient ERC20 allowance` before approve → fallback `l2_gas 520000` < `76088960` `REVERTED`; after approve `estimateFee` `l2_gas 119542080` `l1_gas 0` `overall_fee 5934832810840042176` +30% `SUCCEEDED`, also `Resource bounds exceed balance (99953981675535750432)` when `500000000000000*200000` → tuned to `185000000000000*100000` etc. but estimate now solves it.
6. **Deploy class not declared** → `0x061dac...` not on Sepolia, `0x05b4b53...` is.

---

## 7. Next — Stage 2 Shield

- Wait `head-10 >14448022` (≈ `14448032`), `approve(pool, 2 STRK)` already covered (`1000 STRK` allowance), then `transfers.build({autoRegister:true}).with(token, t=>t.deposit({amount}).autoSetup(true).surplusTo(addr)).execute({provingBlockId})` per `build_order.md:43`. Gate: `Deposit(depositor,token,amount)` public as expected.

---

## 8. Repro

```powershell
$env:NODE_AUTH_TOKEN="$(gh auth token)"; gh auth status
pnpm --filter @starkaudit/audit-sdk add @starkware-libs/starknet-privacy-sdk
node --import tsx/esm --env-file=.env ./scripts/register.ts
# Voyager https://sepolia.voyager.online/tx/0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906 Succeeded + ViewingKeySet
```

*No Telegram disturb, STRK only, OZ backend per SDK README.*
