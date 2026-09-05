# StarkAudit — Build Order & Test Plan (lean winning)

**Sepolia first, mainnet last · P0 never cut, P1/P2 cut by day3 if behind**

Sepolia pool `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`
Mainnet pool `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`

Each stage has a **gate**. Never skip.

---

## Stage 0 — Environment

Tasks: `nvm install 24 && nvm use 24` (`>=24` for SDK `ohttp-ts`), `scarb`/`snforge` later. `gh auth refresh -h github.com -s read:packages` (need `read:packages` scope, `gh auth status` shows it) → `pnpm config set @starkware-libs:registry https://npm.pkg.github.com --location=project` + `pnpm config set "//npm.pkg.github.com/:_authToken" "$(gh auth token)" --location=user` (pnpm 10 ignores `${NODE_AUTH_TOKEN}` in project `.npmrc`). Sepolia **STRK only** via `https://faucet.starknet.io` (100 STRK pays deploy+register; ETH `0x049d...` not needed, STRK `0x04718...` is fee token) — bridge not needed. Ask `t.me/sncorestars` for Sepolia `PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io` + `INDEXER_URL=http://35.192.48.142:8080` (Mainnet proving is Starkscan `https://api.starkscan.co/v1/SN_MAIN/prove` `X-Starkscan-Api-Key` via `prover.ts:3`). Create **OZ** Sepolia account `classHash 0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564` (OZ, `cairoVersion:"1"`; `0x061dac...` not declared on Sepolia, Argent `0x03607833...` fails `argent/multicall-failed` on pool).

Gate: `node v24`, `gh auth status` has `read:packages`, `.npmrc:1` registry + user `~/.npmrc` auth, `pnpm --filter audit-sdk add @starkware-libs/starknet-privacy-sdk starknet@10.4.0` succeeds, have both URLs, `VIEWING_KEY` decimal BigInt in `[1, MAX_VIEWING_KEY]`.

---

## Stage 1 — SDK Register (Sepolia)

Scaffold `packages/audit-sdk` `@starkaudit/audit-sdk`, `pnpm --filter audit-sdk add @starkware-libs/starknet-privacy-sdk@0.14.3-rc.6 starknet@10.4.0` + `pnpm add starknet@10.4.0 -w` for `scripts/` ESM, `pnpm config set` as Stage 0.

Deploy OZ first: `sncast` or `Account.deployAccount({classHash: "0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564", constructorCalldata:[pub], addressSalt:0})` → fund `100 STRK` via faucet before deploy (counterfactual can receive). Wait `head-10 > deployReceiptBlock`. Then `approve(STRK 0x04718..., POOL 0x0254a6..., 1000 STRK)` → wait `head-10 > approveBlock` (pool `register` needs `STRK` allowance or reverts `Insufficient ERC20 allowance` `0x0254a6...:0x0246333a...`).

`connect.ts:60`:
```ts
const transfers = createPrivateTransfers({ account: new Account({provider, address, signer, cairoVersion:"1"}),
  viewingKeyProvider:{getViewingKey: async()=>BigInt(VIEWING_KEY!)},
  provingProvider:{url: PROVING_SERVICE_URL!, chainId: constants.StarknetChainId.SN_SEPOLIA},
  discoveryProvider:{url: INDEXER_URL!}, poolContractAddress: SEPOLIA_POOL })
const provingBlockId=(await provider.getBlockNumber())-10 // must be > deployBlock+10 and > approveBlock+10
const {callAndProof}= await transfers.build().register().execute({provingBlockId})
const proofDetails= callAndProof.proof.proofFacts?.length ? {proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data}:{}
const est= await account.estimateInvokeFee(callAndProof.call,{tip:0n,...proofDetails}) // STRK fee, l2_gas 119542080
const resourceBounds={l1_gas:scale(est.resourceBounds.l1_gas,1.3), l2_gas:scale(est.resourceBounds.l2_gas,1.3), l1_data_gas:scale(est.resourceBounds.l1_data_gas,1.3)}
await account.execute(callAndProof.call,{tip:0n, resourceBounds, ...proofDetails})
```
Run via `node --import tsx/esm --env-file=.env ./scripts/register.ts` (not `pnpm tsx` default `ERR_PACKAGE_PATH_NOT_EXPORTED` for `type:module` `exports "."` `import` only).

Gate: Voyager Sepolia `Succeeded` + `ViewingKeySet` event. Verified `tx 0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906` `block 14448022` `OZ 0x03132f...` `l2_gas 119542080` `overall_fee 5934832810840042176`.

Fail: `INVALID_NONCE` → `transfers.invalidateProofNonceCache()` then rebuild; `BigInt` hex → decimal; `Resource bounds exceed balance (99953981675535750432)` → use `estimateFee` +30%; `argent/multicall-failed` → use OZ; `Class not declared 0x061dac...` → use `0x05b4b53...`.

---

## Stage 2 — Shield (2 tx)

If `approve(pool,1000 STRK)` for Stage 1 already done and `allowance >=2 STRK`, skip `approve`; else `approve(token 0x04718..., POOL 0x0254a6..., 2 STRK low=2000000000000000000 high=0)` → wait `head-10>approveBlock` (poll 5s, transparent-state rule) → `transfers.build({autoRegister:true}).with(token, t=>t.deposit({amount:2000000000000000000n}).autoSetup(true).surplusTo(addr)).execute({provingBlockId})` (same `head-10` + `tip:0n` + `proofDetails` tail as Stage 1, OZ `0x03132f...`).

Gate: both `Succeeded`, pool `Deposit(depositor,token,amount)` amount public as expected. Next tx must wait `head-10 > depositBlock+10` (note maturity).

---

## Stage 3 — Test Vector (blocking)

Wait `10` blocks maturity, `discoverNotes({tokens:[BigInt(token)]})` -> `notes.get(BigInt(token))`.
Compute `note_id=poseidon(NOTE_ID_TAG,channel_key,token,index,0)` `nullifier=poseidon(NULLIFIER_TAG,channel_key,token,index,0,k)` `enc_amount=poseidon(ENC_AMOUNT_TAG,channel_key,token,index,0,salt)+amount` tags from `starkware-libs/starknet-privacy/packages/privacy/src/constants.cairo`. Do one `transfer` to publish nullifier, read on-chain nullifier + `enc_amount` at `note_id`, compare, save `test-vectors/vector1.json` `{..., computed_nullifier, onchain_nullifier, match:true}`. Also check pool has view for `note payload` at `note_id` -> decides `offchain_verified` path.

Gate: `computed==onchain` both fields. If false -> fix tags; if still false by EOD day2 -> set `unverified_binding:true` fallback and continue.

---

## Stage 4 — AuditRegistry (P0)

`contracts/src/audit_registry.cairo` storage `businesses,auditor,threshold_commitment/version,duplicate_window,results:Map<nullifier>,dup_seen, auditor_of:Map<business,auditor>, distribution_keys:Map<business,DistributionKey>, packages:Map<(business,version),ThresholdPackage>` `AuditResult{... business}` functions `register_business()` open, `set_auditor(auditor)` business-only, `register_business_for` auditor helper, `set_threshold_commitment` (global demo), `set_distribution_key(low,high)` open self-serve, `share_threshold_package(...)` auditor-only bound to live version, `get_/has_threshold_package` + `get_/has_distribution_key` views, `submit_proof`, `flag_exception` events `ProofSubmitted(business),BusinessRegistered,AuditorSet,DistributionKeySet,ThresholdPackageShared`. For now `submit_proof` `offchain_verified=true`.

`snforge` tests: access control, versioning, `submit_proof` store, duplicate `dup_commit` window -> `is_duplicate=true`, anti-replay same `nullifier` -> revert, distribution key set/get + missing reverts, package bound to version + `NOT_AUDITOR`/`NO_THRESHOLD`/`NO_PACKAGE` reverts. Deploy Sepolia `sncast deploy --constructor auditor`, call `register_business` + backend `dist_keygen.ts` (`set_distribution_key`) + `set_threshold_commitment` (auditor UI auto-shares) -> Voyager events.

Gate: `snforge test` all pass, `ProofSubmitted` visible.

---

## Stage 5 — Pass/Fail/Duplicate End-to-End (P0 never cut)

Compliant `transfer 0.5 STRK` (<1 STRK threshold) -> backend `sync_package.ts` first (decrypts sealed package, verifies `poseidon == (commitment, version)`, writes gitignored `threshold-package.json`; `stage5.ts` refuses without it — threshold is never hardcoded or sent manually) -> witness `{channel_key,token,index,salt,amount,k,threshold:1e18,counterparty:poseidon([payee]),period:20260901}` -> `audit_commitment=poseidon(PRIVATE_AUDIT_TAG,amount,salt,counterparty,period)` `dup_commit=poseidon(DUP_TAG,counterparty,amount,period)` -> `registry.submit_proof(...)` (same for `1.5 STRK` fail and same `0.5` duplicate). Each nullifier recorded.

Gate: Voyager `ProofSubmitted pass:true` , `pass:false`, `pass:false is_duplicate:true` all with no amount in event.

---

## Stage 6 — PayrollAnonymizer (P0 for win, P1 cut only if Stage 5 late)

`contracts/src/payroll_anonymizer.cairo` `fn privacy_invoke(deposits: Span<OpenNoteDeposit>) -> Span<OpenNoteDeposit>` (`CALLER_NOT_PRIVACY`, balance-delta, `approve`). Client builds `deposits=[{note_id:openNoteIds[i], token, amount}]` as `InvokeExternal` calldata.

Test `snforge` ABI, deploy Sepolia, run `transfers.build().with(token, t=>...invoke(anonymizer, deposits)).execute` -> pool `CreateOpenNote` events per payee (amounts public as expected `salt=1`).

Gate: invoke `Succeeded` on Sepolia. **Keep this** - dropping it loses `anonymizer contracts` 30% depth; cut swap/shadow instead.

*Cut:* AVNU/Ekubo swap + shadow accounts `0.14.3-rc.6` (RC-gated, no mainnet address) moved to roadmap - do not block win.

---

## Stage 7 — Dashboard (minimal)

`pnpm --filter web add starknet@10.4.0 ...` (pin) -> `src/lib/starknet.ts` + `registry.ts` -> `/auditor` Tests tab (commit threshold with random salt, auto-seal + share to keyed businesses, Distribution status per business) + `provider.getEvents` feed split `fails/duplicates/exceptions` with `unverified/offchain` badges, `/business` registered/balance/nullifier list. Never render amount/counterparty. `pnpm --filter web build` must pass.

Gate: `dev` + wallet connect (Ready), auditor shows Stage 5 events, no amount in UI or source, build 0.

---

## Stage 8 — Mainnet (after Sepolia clean)

Switch `chainId SN_MAIN` pool `0x0403...12a`, shield real `2 STRK` (FPI screening), repeat Stage 5 + Stage 6 on MAIN, deploy contracts MAIN, record `strk20.json`:
```json
{"transactions":["0x...","0x...","0x...","0x..."],"contracts":["0x...registry","0x...payroll"],"demo_video":"https://youtu.be/...","demo_url":"https://..."}
```
No `repo_url` here (belongs to `registry.json`). Each tx `Succeeded` on `voyager.online` and touches pool.

Gate: `>=3` pool `Succeeded` hashes, Voyager links.

---

## Stage 9 — Video + README

Video 3min: Voyager `Deposit` (public ok) -> auditor `pass/fail/duplicate` -> zoom no amount -> click Voyager `UseNote` nullifier -> show badges. README: trust table == code, limitations §9 (incl `dup` brute-force), `unverified/offchain` states, Day0 repro, Voyager links, `MIT`.

---

## Cut Table (pre-authorized)

| Behind | Drop |
|---|---|
| Stage 3 fails | swap, shadow (already cut) |
| Stage 5 late | keep registry+transfers, drop payroll batch only then |
| Stage 7 late | auditor view only |
| Stage 8 fails | honest Sepolia note in README (but mainnet is P0) |

> **Never cut Stage 3 or 5** - they *are* the product. Payroll is depth clincher; swap/shadow are padding.
