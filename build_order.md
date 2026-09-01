# StarkAudit — Build Order & Test Plan (lean winning)

**Sepolia first, mainnet last · P0 never cut, P1/P2 cut by day3 if behind**

Sepolia pool `0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91`
Mainnet pool `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`

Each stage has a **gate**. Never skip.

---

## Stage 0 — Environment

Tasks: `nvm install 24 && nvm use 24` (`>=24` for SDK), `scarb`, `snforge`, `gh auth refresh -h github.com -s read:packages` + `export NODE_AUTH_TOKEN`, get Sepolia ETH + STRK, ask `t.me/sncorestars` for `PROVING_SERVICE_URL` + `INDEXER_URL`, create Sepolia account.

Gate: `node v24`, `scarb --version`, `snforge --version`, `gh auth status`, have both URLs.

---

## Stage 1 — SDK Register (Sepolia)

Scaffold `packages/audit-sdk` `@starkaudit/audit-sdk`, set `pnpm config set @starkware-libs:registry` + `.npmrc` placeholder, `pnpm --filter audit-sdk add @starkware-libs/starknet-privacy-sdk starknet@10.4.0`.

`connect.ts`:
```ts
const transfers = createPrivateTransfers({ account: new Account({provider, address, signer, cairoVersion:"1"}),
  viewingKeyProvider:{getViewingKey: async()=>BigInt(VIEWING_KEY!)},
  provingProvider:{url: PROVING_SERVICE_URL!, chainId: constants.StarknetChainId.SN_SEPOLIA},
  discoveryProvider:{url: INDEXER_URL!}, poolContractAddress: SEPOLIA_POOL })
const provingBlockId=(await provider.getBlockNumber())-10 // wait head-10>deployReceiptBlock if fresh
const {callAndProof}= await transfers.build().register().execute({provingBlockId}) // or autoRegister path
const proofDetails= callAndProof.proof.proofFacts?.length ? {proofFacts:..., proof:...}:{}
await account.execute(callAndProof.call,{tip:0n, ...proofDetails})
```

Gate: Voyager Sepolia `Succeeded` + `ViewingKeySet` event.

Fail: `INVALID_NONCE` -> `invalidateProofNonceCache()`, `BigInt` hex -> decimal string.

---

## Stage 2 — Shield (2 tx)

`approve(token, POOL, 2 STRK low=... high=0)` -> wait `head-10>approveBlock` (poll 5s) -> `.build({autoRegister:true}).with(token, t=>t.deposit({amount}).autoSetup(true).surplusTo(addr)).execute({provingBlockId})`.

Gate: both `Succeeded`, pool `Deposit(depositor,token,amount)` amount public as expected.

---

## Stage 3 — Test Vector (blocking)

Wait `10` blocks maturity, `discoverNotes({tokens:[BigInt(token)]})` -> `notes.get(BigInt(token))`.
Compute `note_id=poseidon(NOTE_ID_TAG,channel_key,token,index,0)` `nullifier=poseidon(NULLIFIER_TAG,channel_key,token,index,0,k)` `enc_amount=poseidon(ENC_AMOUNT_TAG,channel_key,token,index,0,salt)+amount` tags from `starkware-libs/starknet-privacy/packages/privacy/src/constants.cairo`. Do one `transfer` to publish nullifier, read on-chain nullifier + `enc_amount` at `note_id`, compare, save `test-vectors/vector1.json` `{..., computed_nullifier, onchain_nullifier, match:true}`. Also check pool has view for `note payload` at `note_id` -> decides `offchain_verified` path.

Gate: `computed==onchain` both fields. If false -> fix tags; if still false by EOD day2 -> set `unverified_binding:true` fallback and continue.

---

## Stage 4 — AuditRegistry (P0)

`contracts/src/audit_registry.cairo` storage `businesses,auditor,threshold_commitment,threshold_version,duplicate_window,results:Map<nullifier>,dup_seen:Map<dup_commit>` `AuditResult{note_id,audit_commitment,dup_commit,pass,unverified_binding,offchain_verified,submitted_at,is_duplicate}` functions `register_business, set_threshold_commitment, submit_proof(nullifier,note_id,audit_commitment,dup_commit,enc_amount,proof), flag_exception` events `ProofSubmitted,ExceptionFlagged,ThresholdUpdated`. For now `submit_proof` stores with `offchain_verified=true` (no on-chain verifier) - pre-authorized fallback §4.

`snforge` tests: access control, versioning, `submit_proof` store, duplicate `dup_commit` window -> `is_duplicate=true`, anti-replay same `nullifier` -> revert. Deploy Sepolia `sncast deploy --constructor auditor`, call `register_business` + `set_threshold_commitment` -> Voyager events.

Gate: `snforge test` all pass, `ProofSubmitted` visible.

---

## Stage 5 — Pass/Fail/Duplicate End-to-End (P0 never cut)

Compliant `transfer 0.5 STRK` (<1 STRK threshold) -> witness `{channel_key,token,index,salt,amount,k,threshold:1e18,counterparty:poseidon([payee]),period:20260901}` -> `audit_commitment=poseidon(PRIVATE_AUDIT_TAG,amount,salt,counterparty,period)` `dup_commit=poseidon(DUP_TAG,counterparty,amount,period)` -> `registry.submit_proof(...)` (same for `1.5 STRK` fail and same `0.5` duplicate). Each nullifier recorded.

Gate: Voyager `ProofSubmitted pass:true` , `pass:false`, `pass:false is_duplicate:true` all with no amount in event.

---

## Stage 6 — PayrollAnonymizer (P0 for win, P1 cut only if Stage 5 late)

`contracts/src/payroll_anonymizer.cairo` `fn privacy_invoke(deposits: Span<OpenNoteDeposit>) -> Span<OpenNoteDeposit>` (`CALLER_NOT_PRIVACY`, balance-delta, `approve`). Client builds `deposits=[{note_id:openNoteIds[i], token, amount}]` as `InvokeExternal` calldata.

Test `snforge` ABI, deploy Sepolia, run `transfers.build().with(token, t=>...invoke(anonymizer, deposits)).execute` -> pool `CreateOpenNote` events per payee (amounts public as expected `salt=1`).

Gate: invoke `Succeeded` on Sepolia. **Keep this** - dropping it loses `anonymizer contracts` 30% depth; cut swap/shadow instead.

*Cut:* AVNU/Ekubo swap + shadow accounts `0.14.3-rc.6` (RC-gated, no mainnet address) moved to roadmap - do not block win.

---

## Stage 7 — Dashboard (minimal)

`pnpm --filter web add starknet@10.4.0 ...` (pin) -> `src/lib/starknet.ts` + `registry.ts` -> `/auditor` `provider.getEvents` feed split `fails/duplicates/exceptions` with `unverified/offchain` badges, `/business` registered/balance/nullifier list. Never render amount/counterparty. `pnpm --filter web build` must pass.

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
