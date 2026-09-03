# StarkAudit — Stage 0/1/2/3 Report

## Done
- **Env:** `node 24.18.1`, `pnpm 10.34.4`, `gh auth read:packages` (Stoneybro), `.npmrc` fixed, SDK `0.14.3-rc.6` installed.
- **SDK wiring:** `packages/audit-sdk/src/connect.ts:60` `createPrivateTransfers` with `BigInt(VIEWING_KEY)`, `PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io`, `INDEXER_URL https://discovery-service.alpha-sepolia.sw-dev.io` (was `35.192.48.142:8080` `ConnectTimeout` → fallback `ContractDiscovery`), `SEPOLIA_POOL 0x0254a6...d91`, `provingBlockId=head-10`, `tip:0n`, conditional `proofFacts`.
- **Account:** Switched Argent `0x075fcf...` to OZ `0x03132f147f5f210b448bc9d2ece5193bea38d51cfdd4a02dc1ef015e41d72eed` (`class 0x05b4b53...`). Deployed `0x60fd8f...` `14447951`. Funded `100 STRK`. Approved pool `1000 STRK` `0x7e35890...` `14447994`. `ViewingKeySet` `public_key 0x127d692...927` matches `VIEWING_KEY 157373...1350`.
- **Register:** `scripts/register.ts` `0x7b390c...` `14448022` **SUCCEEDED** `ViewingKeySet` `l2_gas 119542080`.
- **Shield:** `scripts/shield.ts` `2 STRK` `0x5a77cef...` `14449033` **SUCCEEDED** `Deposit` (fallback `ContractDiscovery` `get_num_of_channels 0x0` for first `autoSetup:true`). Second `0x721c...` `14450492` — now **2** notes (`index 0` `0xa0d9e...`, `index 1` `0x54408...`).
- **Stage 3 (partial):** `scripts/stage3.ts` `14449033→14450940` mature, `discoverNotes` found `2` notes, `poseidon` tags `NULLIFIER_TAG:V1` `ENC_AMOUNT_TAG:V1` `NOTE_ID_TAG:V1` verified `note_id 0xa0d9e...` `enc low 0x85de...` vs `packed 0xa44ed712...`. **Nullifier not chain-verified** — need `UseNote` transfer per `build_order.md:53`.
- **Stage 4 (updated for demo):** `contracts/src/src/audit_registry.cairo:85` now per-business `auditor_of: Map<business,auditor>` + `register_business()` open self-register, `set_auditor(auditor)` business-only (business picks any auditor, judges can be added), `register_business_for` auditor helper kept. Rebuilt `sierra` `138413` + `casm` `119274` (`scarb build` `Finished`), redeployed `0x53081a78e70fd3e3b0190d871d621dd2f8189b72bf2a069c4f5c49567e6dec4` `class 0x48c052...` `block 14460165` `declare 0x451e941...` `deploy 0x2e71bcf...`, then `register_business()` `0x228385...`, `set_auditor(0x03132f...)` `0x35f24c...`, `set_threshold_commitment(0x7da138...)` `0x4620f60...` `version 1`.

## Build order doc was wrong
- GH Packages needs `//npm.pkg.github.com/:_authToken` in **user** `~/.npmrc` (pnpm 10 blocks project `.npmrc` `${NODE_AUTH_TOKEN}`) + `read:packages` scope → was `401`.
- Proving: Sepolia = CoreStars URLs, Mainnet = Starkscan `https://api.starkscan.co/v1/SN_MAIN/prove` (`prover.ts:3`) — doc conflated.
- Fee: `STRK` pays deploy/register, not `ETH`. `faucet.starknet.io` gives `STRK` only.
- Account: `0x061dac...` OZ not declared on Sepolia; `0x05b4b53...` is. Argent fails `multicall`.
- Allowance: pool `register` does `transferFrom` of `STRK` for fee → needs `approve(pool, STRK)` before `register`; `head-10 > approveBlock` is separate transparent-state rule, not the cause.

## Risks not in doc (critical)
- `starknet` version split: `audit-sdk`/`root` pin `10.4.0`, SDK `10.5.0` (`.pnpm` has both) — silent mismatch, align to `10.5.0` before Stage 2.
- `INDEXER_URL=http://35.192.48.142:8080` plain HTTP raw IP, `ConnectTimeout` 15s — Stage 1 didn't need it, Stage 2/3 used `ContractDiscovery` `RpcPoolContract` fallback (first deposit `get_num_of_channels 0x0`, second note `index 1` not in vector). Fallback code in `scripts/stage3.ts:40` uses deep import `@starkware-libs/starknet-privacy-sdk/internal/contract-discovery` blocked by SDK `exports` (`ERR_PACKAGE_PATH_NOT_EXPORTED`) — dead if indexer ever recovers, delete it (as done in `shield.ts`).
- Scripts overstate enforcement: `register.ts` only logs `INVALID_NONCE`, never `waitForMaturity`, no `ViewingKeySet` receipt check, `connect.ts:56` `>=1n` not `MAX_VIEWING_KEY`.
- Vector drift: `scripts/verify_vectors.ts` is stale duplicate with `[FILL]` placeholders and own `0n` tags — `derive*` duplicated vs `build_witness.ts` (now correct) — delete or rewire to `build_witness.ts`.
- Enc amount stored as `0x532e...e1c` full 256b in `vector1.json:11` while protocol `enc_amount` is `u128` low 128 `0x85de...1c` — cosmetic but misleads circuit (Stage 4 uses `vector1.json` `enc_amount`).
- Single-note coverage: `DEPOSIT_BLOCK=14449033` `tokenNotes[0]` only — second `2 STRK` `index 1` `14450492` not in vector; Stage 5 spends both.

## Failed attempts (for reference)
- `0x7e10f...` Argent `REVERTED` `Insufficient allowance` (ETH).
- `0x78157...` OZ `REVERTED` pool `Insufficient allowance` before `approve`.
- Resource bounds `520000` < `76088960` and `500000000000000*200000` > balance `99953981675535750432` — fixed by `estimateFee` after `approve`.



## Next
Stage 8 Mainnet (after Sepolia clean) + Stage 9 video/README.

## Stage 7 gate: PASSED (2026-09-03, WSL)
- Minimal dashboard in `apps/web` (was a 4-file starter): `/` landing + wallet connect, `/auditor` live `ProofSubmitted` feed split fails/duplicates (+passes count, exceptions, offchain/unverified badges, Voyager links), `/business` registration + fee-balance + chosen auditor + own proofs (filtered by new `business` field). Data layer `src/lib/starknet.ts` + `registry.ts` (`getEvents` paging from deploy block, selector+shape parsing) + `useWallet` (get-starknet-core requestAccounts) + `useProofFeed`.
- Styled after `web-ui` (dark-first oklch tokens, Geist, sidebar-less top nav, badge/card/skeleton/empty-state in its class language) but web-ui untouched — lightweight local primitives, no base-ui dep. No amount/counterparty fetched or rendered anywhere (only privacy statements mention the word).
- `pnpm --filter web build` green (3 static routes); `lint` clean; served locally, all routes 200. Env in `apps/web/.env.local` (registry `0x1ce71384...`, deploy block, RPC — gitignored).
- Gotchas: scripts-style CJS trap doesn't apply here (`type` inference fine); Next 16 type-check choked on a stale `tsconfig.tsbuildinfo` after the ES2017->ES2022 bump — deleting caches fixed it; `StarknetWindowObject` is request-based (no `.account`), address via `wallet_requestAccounts`; starknet.js `WalletAccount` wants its own wallet-provider type — bridged via `Parameters<typeof WalletAccount.connect>[1]` cast.
- Post-gate fixes: wallet picker (auto-pick grabbed MetaMask's EVM provider — now lists Starknet wallets, filters non-Starknet); `/business` is transactional — Register business + Set auditor buttons via `WalletAccount` signing, with pending/hash/Voyager status and auto-refresh.

## Stage 6 gate: PASSED (2026-09-03, WSL)
- `PayrollAnonymizer.privacy_invoke` implemented for real: caller==pool guard, non-empty + ≤128 payees, per-deposit token check, `sum(amounts) <= balance` solvency (u256, no overflow), exact-total approve, echo deposits span. 17/17 `snforge` green (6 new payroll tests incl. shortfall revert + donation-doesn't-brick; real bug caught by tests: pre-invoke withdraw means no in-invoke delta exists, so single-balance `<=` replaced the muddled before/after reads).
- Test-only `MockERC20` added (`contracts/src/src/mock_erc20.cairo`, never deployed on-chain).
- Deployed: payroll `0x48a2b7e6566a915e34bea7a285212df5463a95a5900bd522575197191c25068`, class `0x14b998a99004c367243471633e58e9bd42de7bfd781cf056cb531b9769ca77b` (block 14496872, ctor pool+STRK).
- Batch invoke `0x1ae70fe8...` (block 14497181) **SUCCEEDED**: 0.5 STRK private note -> withdraw to helper + 2 open notes (payee=self, single-account demo) -> helper split 0.3/0.2, pool credited both open notes with exact public amounts, helper balance 0 after pull.
- Client notes: SDK `invoke(({openNotes}) => ...)` with `transfer({recipient, amount: Open})` x2; `Open` re-exported via `audit-sdk/connect.ts` (scripts/ are CJS-classified, SDK root has no `default` export condition — direct import throws `ERR_PACKAGE_PATH_NOT_EXPORTED`); Alchemy Sepolia flaps ~25% empty bodies, `scripts/payroll.ts` retries direct RPC calls.

## Stage 5 gate: PASSED (2026-09-03, WSL)
- Three self-transfers (payee=self, counterparty=`poseidon([account])`, period=`20260903`, threshold 1 STRK) + `submit_proof` each, all nullifiers chain-verified via pool `nullifier_exists` before submit:
  - LEG1-PASS: 0.5 STRK transfer `0x6646572d...` (block 14495905, old registry — see note) then re-run 0.5 `0x33851aa8...` (block 14496270) -> submit `0x7b6756ca...` -> `pass:true is_duplicate:false`.
  - LEG2-FAIL: 1.5 STRK transfer `0x374424a5...` (block 14496303) -> submit `0x16474a55...` -> `pass:false is_duplicate:false` (threshold-fail via `pass_claim=false`).
  - LEG3-DUP: 0.5 STRK transfer `0x24b36735...` (block 14496340) -> submit `0x684c7324...` -> `pass:false is_duplicate:true` (same `dup_commit 0x6207d3a8...` as LEG1 across different notes, different `audit_commitment` per-note salt — exactly per design).
- No amount/counterparty in any event — only nullifier key + business + bools + opaque commitments. Verified via `get_result` on each nullifier.
- Contract change required mid-stage: `pass` was `!is_duplicate` only, so a genuine threshold-fail recorded `pass:true` (proven by first attempt). Added 1-bit `pass_claim` param (`pass = pass_claim && !is_duplicate`; amount can never go on-chain, calldata is public) + `test_submit_proof_fail_claim_stored` (now 11/11 `snforge` green). Witness semantics fixed: commitments describe the AUDITED TRANSFER amount, binding (nullifier/note_id/enc) derives from the spent note.
- Redeployed (2nd redeploy): registry `0x1ce7138415c267093450c95241c0a02e1e5cd1b4db52452149fa05f36d6ead6`, class `0x2aa91d96ca82f6186ac686e2427a146704f84ca75731980ecb4fe2c967baec4` (block 14496137), setup re-run (version 1, registered). `registry_setup.ts` + `stage5.ts` REGISTRY updated; `submit.ts`/`types.ts` carry `pass_claim`. Old registry `0x370a79c...` (2 artifact submits from the first attempt) superseded.
- Bonus: LEG1 first-attempt nullifier `0x72c95b96...` matched `test-vectors/vector1.json` `computed_nullifier` exactly — Stage 3 math now chain-verified.

## Stage 4 gate: CLOSED (2026-09-03, WSL)
- **snforge test all pass (10 tests)** — `cd contracts/src && snforge test` (toolchain: `scarb 2.20.1`, `snforge/sncast 0.63.0`, `snforge_std v0.63.0` pinned to match):
```
[PASS] test_access_control_register_business
[PASS] test_register_business_for_not_auditor_reverts
[PASS] test_threshold_versioning
[PASS] test_set_threshold_not_auditor_reverts
[PASS] test_submit_proof_store_and_emit
[PASS] test_anti_replay_same_nullifier_reverts
[PASS] test_duplicate_window_is_duplicate_true
[PASS] test_flag_exception_not_auditor_reverts
[PASS] test_flag_exception_auditor_succeeds
[PASS] test_set_duplicate_window_not_auditor_reverts
Tests: 10 passed, 0 failed
```
- `scarb build` -> `Finished`.
- `ProofSubmitted` visibility proven by `test_submit_proof_store_and_emit` event assertion (exact struct incl. new `business` field). No on-chain `submit_proof` in Stage 4 by design — first real submission is Stage 5 (no fabricated pass pollution).
- Fixes to get here: `snforge_std` uncommented+pinned to installed `v0.63.0` (commented `v0.39.0` was stale); `pub mod audit_registry` + `pub enum Event` (integration tests are a separate crate, need visibility — no codegen change); 2 over-long assert strings shortened to fit felt252; real bug found+fixed in contract: `dup_seen` used `first_seen != 0` sentinel which collides with block timestamp 0 -> replaced with `dup_seen_exists` guard.
- Secondary batch (one redeploy): (a) `business: ContractAddress` (= submitter caller) added to `AuditResult` + `ProofSubmitted` (non-key field; caller address is public anyway, privacy holds); (b) DECISION: `submit_proof` stays permissionless — no access control added. Rationale: without a `business` param the contract cannot attribute proofs, and auditor-only would break judge fresh-wallet flows + the Stage 5 API. Accepted demo limitation: griefing/front-run `ALREADY_SUBMITTED` and fabricated `pass:true` are possible; auditor filters by `business` field off-chain. Recorded in contract docstring. (c) `set_auditor` comment aligned to demo-intentional open behavior. (d) `note_id` struct comment fixed (stored for Stage 5 binding check, `enc_amount` not stored yet). (e) `NOT_AUDITOR` test for `set_duplicate_window` added (10th test).
- Redeployed (class hash changed as expected): registry `0x370a79cda6910a14946ad9f4dda555a9920be715549ea658f80a9990ce2858d`, class `0x1010d4ebdcca4227c1cc2f08fbd671a4bae8913d168bc3c4b132d3298964501` (from local `scarb build` artifacts), block `14495066`. `scripts/registry_setup.ts` REGISTRY updated. `register_business` + `set_auditor(self)` + `set_threshold_commitment` re-run: version 1, `is_registered true`. Old registry `0x53081a...` superseded.
- Env notes (WSL): starkup needs interactive TTY so toolchain installed directly (`scarb` installer + `snfoundryup` + `rustup`); no system C linker/no sudo -> user-local gcc 15 sysroot (`~/gccroot`, `~/.local/bin/cc` wrapper) purely to compile `snforge_scarb_plugin` build scripts. GH Packages auth lives in user `~/.npmrc` (never committed).

## Verify
```
https://sepolia.voyager.online/tx/0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906 // register
https://sepolia.voyager.online/tx/0x5a77cefdb4655c92cd3d71c76f571e730a19a03d43c3ee9ec4ed78fd59fd816 // shield 2 STRK
https://sepolia.voyager.online/contract/0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91 // pool
https://sepolia.voyager.online/contract/0x03132f147f5f210b448bc9d2ece5193bea38d51cfdd4a02dc1ef015e41d72eed // OZ account
https://sepolia.voyager.online/tx/0x451e9419268e133d444ed21fce1bf91dc79b1d6fa7c9ed90ea80271d0097eb9 // declare new registry
https://sepolia.voyager.online/tx/0x2e71bcf67e4dba3965401797b43114cb77781b904feb24ae22996ecec957a89 // deploy 0x53081a... block 14460165
https://sepolia.voyager.online/contract/0x53081a78e70fd3e3b0190d871d621dd2f8189b72bf2a069c4f5c49567e6dec4 // new registry
https://sepolia.voyager.online/tx/0x228385155ed9986ea15814227d74052bc6dc0da0ae22b2bcb8b63de31790af9 // register_business open
https://sepolia.voyager.online/tx/0x35f24ce200c901a5415aa03818bd9efe9a23326d84fdfbfdd1e19f83938d01a // set_auditor business picks any
https://sepolia.voyager.online/tx/0x4620f601f14403bd30e7d588418ce98ff3abce76e82ff01b5048335316ac169 // set_threshold (old registry)
https://sepolia.voyager.online/tx/0x74cb6d75bf4427b78f611a0ef54cc49c56148ff9ebb205d039f1123d14f3e9e // declare new registry (class 0x1010d4e...)
https://sepolia.voyager.online/tx/0x7f76a9d2225340c191421df08a1e029cbcdc2bbc9850d64efbf89b6c3661aec // deploy 0x370a79c... block 14495066
https://sepolia.voyager.online/contract/0x370a79cda6910a14946ad9f4dda555a9920be715549ea658f80a9990ce2858d // new registry (business field + dup fix)
https://sepolia.voyager.online/tx/0x3386db5e55aef02ef20df20c564710a99e4c8e07d966f35ca16f0cac031d1f0 // register_business open
https://sepolia.voyager.online/tx/0x292264144db9bd30ff020ba6738ea4a0ecf3805172e45737b8644d6e79e2af0 // set_auditor business picks any
https://sepolia.voyager.online/tx/0x32c32756813e39fac8acfcf192c2f8ac4f33e249084c31fd92f70dfc12282a // set_threshold v1 (2nd registry)
https://sepolia.voyager.online/tx/0x4aa73302f3800883039e1c59b8d7af6e0c4a6b5ea9baff4b3cf25b34573b338 // declare 3rd registry (class 0x2aa91d96, pass_claim)
https://sepolia.voyager.online/tx/0x7b1bf869f9f10bf6fa6e41e78c13f30a4e5e97d93c39101e1cd74fa93c7efe6 // deploy 0x1ce71384... block 14496137
https://sepolia.voyager.online/contract/0x1ce7138415c267093450c95241c0a02e1e5cd1b4db52452149fa05f36d6ead6 // current registry (pass_claim)
https://sepolia.voyager.online/tx/0x6d4dfcb17cebbb5e3eda8f3f88852c11a4d9118fb1cb4ae4734552762423cbd // set_threshold v1 (current)
https://sepolia.voyager.online/tx/0x33851aa8d9f132ed8e9c4afe68465a9b3d8b50986b2fd0be80561cbba730a74 // stage5 leg1 transfer 0.5
https://sepolia.voyager.online/tx/0x7b6756ca63e0c983fd28b3cb37bfc248f288dc64b8ebc2a39f8468a833aaa05 // submit pass:true
https://sepolia.voyager.online/tx/0x374424a5f99d1c9047f9c51d556b339f0667c39d07d4f9e5d0c1389b651b5fc // stage5 leg2 transfer 1.5
https://sepolia.voyager.online/tx/0x16474a55fe9cace50829e0c0ad4315e4525df3b6bb3e06ba502554d39cce643 // submit pass:false
https://sepolia.voyager.online/tx/0x24b3673562f3cb7c76e2438b9ac61abd338e7c836e3e10bbf30c3fed1a003e8 // stage5 leg3 transfer 0.5
https://sepolia.voyager.online/tx/0x684c7324814098ef07744b088c9141cce8f5350c856bba5b7269a018d3db709 // submit pass:false is_duplicate:true
https://sepolia.voyager.online/tx/0x2ebcb608ac9a941161bd1b2d8b95fab2ab77872a6fd42b95027926ff6a7d44b // declare payroll (class 0x14b998a9)
https://sepolia.voyager.online/tx/0x3683754c050a22be071925beebd6cffeb10322d8ff49e635ef2cbdd2cb893f1 // deploy payroll block 14496872
https://sepolia.voyager.online/contract/0x48a2b7e6566a915e34bea7a285212df5463a95a5900bd522575197191c25068 // payroll anonymizer
https://sepolia.voyager.online/tx/0x1ae70fe852a8c61dd27c48919c66532d2d73482cfb97ff83d232aa29baefe19 // payroll batch invoke 0.3+0.2 open notes
```

## Repro
```powershell
pnpm --filter @starkaudit/audit-sdk add @starkware-libs/starknet-privacy-sdk
node --import tsx/esm --env-file=.env ./scripts/register.ts
```
