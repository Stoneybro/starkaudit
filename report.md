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
Stage 4 `AuditRegistry` `contracts/src/audit_registry.cairo` `snforge` + deploy Sepolia.

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
https://sepolia.voyager.online/tx/0x4620f601f14403bd30e7d588418ce98ff3abce76e82ff01b5048335316ac169 // set_threshold
```

## Repro
```powershell
pnpm --filter @starkaudit/audit-sdk add @starkware-libs/starknet-privacy-sdk
node --import tsx/esm --env-file=.env ./scripts/register.ts
```
