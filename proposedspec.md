# ShadowAudit — Build Spec (lean, winning)

Sprint 6 days · Deadline Sept 7 23:59 UTC · Pool `0x040337b1...812a` SN_MAIN · `strk20.json >=3 Succeeded` pool txs

`[SPEC]` ready · `[VERIFY]` confirm vs `starkware-libs/starknet-privacy` · `[DECIDE]` day1

---

## 0. Repo Layout — compatible `pnpm-workspace.yaml:1`

```
starkaudit/
├── strk20.json
├── apps/web/                # existing Next 16.3.4 (DO NOT move)
│   ├── src/app/page.tsx, layout.tsx, globals.css
│   ├── src/app/business/page.tsx  # [SPEC] §8
│   ├── src/app/auditor/page.tsx   # [SPEC] §8
│   ├── src/lib/starknet.ts, wallet.ts, registry.ts, prover.ts
│   ├── .env.local             # NEXT_PUBLIC_STARKNET_RPC_URL keep
│   └── next.config.ts
├── packages/audit-sdk/      # new TS, @starkaudit/audit-sdk
│   └── src/note_opening.ts, build_witness.ts, submit.ts
├── contracts/               # Cairo, Scarb workspace (no package.json -> pnpm ignores)
│   ├── Scarb.toml
│   ├── src/audit_registry.cairo
│   ├── src/payroll_anonymizer.cairo
│   └── interfaces/i_verifier.cairo
├── circuits/
│   ├── Scarb.toml
│   └── src/materiality.cairo
├── test-vectors/vector1.json  # [VERIFY] blocking
└── scripts/seed_mainnet.ts, verify_vectors.ts
```
Shadow accounts + swap removed from layout (roadmap).

## 1. Toolchain `[SPEC]`

Node `>=24` (`>=20` in `package.json:6` -> bump) `nvm use 24`.
```sh
pnpm --filter web add starknet@10.4.0 @starknet-io/get-starknet-discovery@6.0.3 @starknet-io/get-starknet-wallet-standard@6.0.3 @starknet-io/types-js@0.10.3
# SDK 404 on npmjs (fresh 2026-09-01) -> GH Packages
gh auth refresh -h github.com -s read:packages
pnpm config set @starkware-libs:registry https://npm.pkg.github.com --location=project
# pnpm --filter audit-sdk add @starkware-libs/starknet-privacy-sdk
# or: pnpm add "starkware-libs/starknet-privacy-sdk#<sha>"
pnpm --filter audit-sdk add @starkware-libs/starknet-privacy-sdk starknet@10.4.0
```
Cairo `scarb` + `snforge`. Circuit toolchain must match verifier §4.

Env: `NEXT_PUBLIC_POOL_ADDRESS=0x0403...12a` `NEXT_PUBLIC_CHAIN_ID=SN_MAIN` `NEXT_PUBLIC_AUDIT_REGISTRY/PAYROLL_ANONYMIZER` after deploy. `SEPOLIA_RPC_URL` for stage0.

## 2. Data Structures `[SPEC]`

```cairo
NoteLocation { channel_key: felt252, token: ContractAddress, index: u64 }
NoteOpening { channel_key, token, index, amount: u128, salt: felt252, owner_private_key: felt252 }
// enc_amount = h(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt)+amount viewing-keys.md:25
AuditCommitment = poseidon(PRIVATE_AUDIT_TAG, amount, salt, counterparty, period)
DupCommit       = poseidon(DUP_TAG, counterparty, amount, period) // no salt
ThresholdCommitment = poseidon(THRESHOLD_TAG, threshold, auditor_salt)
ProofBundle { nullifier: felt252 // h(NULLIFIER_TAG,...) notes-and-nullifiers.md:68
              note_id: felt252   // h(NOTE_ID_TAG,...) notes-and-nullifiers.md:52
              audit_commitment, dup_commit, enc_amount, proof }
```

## 3. Circuit `[SPEC+VERIFY]`

Public: `nullifier, note_id, enc_amount, threshold_commitment, audit_commitment, dup_commit`
Private: `NoteOpening, threshold:u128, threshold_salt, counterparty, period`

Constraints 1 `audit_commitment` 2 `dup_commit` 3 `threshold_commitment` 4 `amount<=threshold` 5 **binding** `nullifier==... && enc_amount==...+amount && note_id==...` + storage check closes fabrication hole (circuit cannot read storage -> registry checks `pool.view_note_payload(note_id)==enc_amount` if exists else `offchain_verified`).

`[VERIFY]` day1: Sepolia SDK replay, `discoverNotes(BigInt)`, read `nullifier` `UseNote` + `enc_amount` at `note_id`, poseidon recompute, `test-vectors/vector1.json` unit test fails loudly if tags wrong (copy from `constants.cairo`). Check pool view existence day1; if none -> offchain indexer path.

Fallback EOD day2: stub 5, `unverified_binding:true`.

## 4. Verifier `[SPEC+DECIDE]`

Reuse Integrity/Herodotus fact-registry if `Cairo 2.x + Stwo` example found day1 EOD. AIR is circuit-specific -> no generic `verify(any)`.
`[DECIDE]` hard stop day1 EOD -> fallback pre-authorized: `AuditRegistry` stores `{proof, public_inputs}` with `offchain_verified:true`, indexer verifies Stwo off-chain, README says so. No half verifier.

Interface: `fn verify(proof: Span<felt>, public_inputs: Span<felt>)->bool` or `is_fact_registered`.

## 5. Registry `contracts/src/audit_registry.cairo` `[SPEC]`

Storage `businesses:Map<addr,bool> auditor threshold_commitment threshold_version duplicate_window results:Map<nullifier,AuditResult> dup_seen:Map<dup_commit,u64>`

`AuditResult { note_id, audit_commitment, dup_commit, pass, unverified_binding, offchain_verified, submitted_at, is_duplicate }`

`register_business()` open (any wallet self-registers), `set_auditor(auditor)` business-only (caller sets `auditor_of[caller]=auditor` — demo: business picks any auditor to get pass/fail), `register_business_for(addr)` auditor helper, `set_threshold_commitment(hash)` auditor-only (global, demo) versioned, `submit_proof(nullifier,note_id,audit_commitment,dup_commit,enc_amount,proof)`:
0 `!results.contains(nullifier)` 1 storage check (`pool.view` if exists else `offchain=true`) 2 verifier or store 3 `dup_seen` window -> `is_duplicate` overrides `pass` 4 `emit ProofSubmitted(nullifier,pass,is_duplicate,unverified_binding,offchain_verified)`

`flag_exception(nullifier)` manual - nullifiers unlinkable without `k`.

## 6. PayrollAnonymizer `contracts/src/payroll_anonymizer.cairo` `[SPEC]`

Client builds `Span<OpenNoteDeposit>` as `InvokeExternal` calldata; pool deserializes to `privacy_invoke(deposits)`.
```cairo
trait IPayrollAnonymizer { fn privacy_invoke(ref self: T, deposits: Span<OpenNoteDeposit>) -> Span<OpenNoteDeposit>; }
contract PayrollAnonymizer { pool: ContractAddress, token: ContractAddress;
  fn privacy_invoke(deposits) { assert(caller==pool); assert(len>0); // balance-delta, approve pool, return deposits } }
```
Rules `helpers__privacy-invoke.md:90`: `approve not transfer`, at most one `invoke/tx`.

Client `build_witness` builds `deposits=[{note_id:openNoteIds[i], token, amount}]`.

## 7. Dashboard `apps/web` `[SPEC]`

Replace `src/app/page.tsx:3` starter: `/` connect (`WalletAccountV6`, `supportedWalletApi>=0.10.3`), `/business` SDK status + Shield/pay + batch list, `/auditor` threshold/window + live `ProofSubmitted` `provider.getEvents` split `fails/duplicates/exceptions` + `unverified/offchain` badges, never amount. `pnpm --filter web build` must pass. Demo URL -> `strk20.json:demo_url` or `Website` field.

## 8. SDK Client `packages/audit-sdk` `[SPEC]`

```ts
const transfers = createPrivateTransfers({ account: new Account({provider, address, signer, cairoVersion:"1"}),
  viewingKeyProvider:{getViewingKey: async()=>BigInt(VIEWING_KEY!)}, provingProvider:{url, chainId: SN_MAIN},
  discoveryProvider:{url: INDEXER_URL!}, poolContractAddress: POOL } )
const provingBlockId = (await provider.getBlockNumber())-10 // 450 validity
const {callAndProof}= await transfers.build({registry}).with(tokenAddr, t=>{...}).execute({provingBlockId})
const proofDetails= callAndProof.proof.proofFacts?.length ? {proofFacts: callAndProof.proof.proofFacts, proof: callAndProof.proof.data}:{}
await account.execute(callAndProof.call, {tip:0n, ...proofDetails})
// wait head-10>receiptBlock, INVALID_NONCE->invalidateProofNonceCache, AddressMap BigInt key, discoverRequirement SetupChannel/Token flow
```

## 9. Demo `strk20.json` `[SPEC]`

```json
{"transactions":["0x...","0x...","0x...","0x..."],"contracts":["0x...registry","0x...payroll"],"demo_video":"https://youtu.be/...","demo_url":"https://..."}
```
Plan 1 `Register ViewingKeySet` 2 `Shield (Deposit)` 3 `Private pass` 4 `Private fail` (or duplicate) - min 3, ship 4 includes `Invoke PayrollAnonymizer` batch (`CreateOpenNote OPEN` + `InvokeExternal`). Each `Succeeded` + pool event Voyager `0x0403...12a`.

## 10. Day-by-Day (lean)

|Day|Focus|Exit|
|---|---|---|
|1|Pin deps, verifier hard stop -> offchain fallback ok, Sepolia vector + pool view check|vector draft|
|2|Circuit 1-5 vs vector, `PayrollAnonymizer` skeleton|snforge vector test|
|3|Registry + dup wiring, mainnet shield few STRK|registry on MAIN|
|4|Batch `transfer+invoke` on MAIN, harden prover tail|payroll tx Voyager|
|5|Dashboard auditor feed, README badges|build pass|
|6|Freeze hashes, 3-min video (no amount visible), trust table == code|`strk20.json` push|

## 11. README (ship symlink root + apps/web/README.md)

Trust table `proposal.md:8` exact, hidden-vs-visible `compliance.md:44`, limitations `proposal.md:9` with `unverified/offchain` states plainly, Day0 `signMessage ${chainId}:${pool}`->`folded%CURVE.n` repro, `10 blocks`, `head-10`, `tip:0n`, `BigInt`, `MAX_VIEWING_KEY`, Voyager links.

**Open decisions day1:** verifier reuse, `register_business` auth. All else `[SPEC]`.
