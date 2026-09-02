# StarkAudit — Stage 0/1/2/3 Report

## Done
- **Env:** `node 24.18.1`, `pnpm 10.34.4`, `gh auth read:packages` (Stoneybro), `.npmrc` fixed, SDK `0.14.3-rc.6` installed.
- **SDK wiring:** `packages/audit-sdk/src/connect.ts:60` `createPrivateTransfers` with `BigInt(VIEWING_KEY)`, `PROVING_SERVICE_URL=https://transaction-prover.alpha-sepolia.sw-dev.io`, `INDEXER_URL` `35.192.48.142:8080` → fallback `ContractDiscovery` (indexer `ConnectTimeout`), `SEPOLIA_POOL 0x0254a6...d91`, `provingBlockId=head-10`, `tip:0n`, conditional `proofFacts`.
- **Account:** Switched Argent `0x075fcf...` (fails `argent/multicall-failed`) to OZ `0x03132f147f5f210b448bc9d2ece5193bea38d51cfdd4a02dc1ef015e41d72eed` (`class 0x05b4b53...` Sepolia declared). Deployed `0x60fd8f...` `block 14447951`. Funded `100 STRK`. Approved pool `1000 STRK` `0x7e35890...` `block 14447994`. On-chain `ViewingKeySet` `public_key 0x127d692588d68ff3e3b9bfa142cf558f4f9c26826aaf6f9ddae5e3d3b1ee927` matches `VIEWING_KEY 157373...1350`.
- **Register:** `scripts/register.ts` `tx 0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906` `block 14448022` **SUCCEEDED** `ViewingKeySet`. Fee `l2_gas 119542080` `overall_fee 5934832810840042176`.
- **Shield:** `scripts/shield.ts` `2 STRK` `tx 0x5a77cefdb4655c92cd3d71c76f571e730a19a03d43c3ee9ec4ed78fd59fd816` `block 14449033` **SUCCEEDED** `Deposit` (fallback `ContractDiscovery` `get_num_of_channels 0x0` `autoSetup:true`). Second run `tx 0x721c69bd4d7971aed8d0612c2e14086a0234072b2410b16e1942800807c1942` `14450492` also succeeded — now **2** private `2 STRK` notes (`index 0` `salt 853135...622`, `index 1` `salt 804162...280`, same `channel_key 171221...3745`).
- **Stage 3 (partial):** `scripts/stage3.ts` `14449033→14450940` mature, `discoverNotes` (fallback `ContractDiscovery` `get_num_of_channels 0x0`) found `2` notes (`index 0` `0xa0d9e...1c` `2 STRK`, `index 1` `0x54408...fe4` `2 STRK`; vector only covers `index 0`). Recomputed `poseidon` tags `NULLIFIER_TAG:V1 0x4e554c...31` `ENC_AMOUNT_TAG:V1 0x454e43...31` `NOTE_ID_TAG:V1 0x4e4f54...31`, `note_id 0xa0d9e...1c` matches on-chain, `enc low 0x85de...1c` matches `packed` `0xa44ed712...` `& ((1<<128)-1)`. **Nullifier NOT chain-verified** — `nullifier_exists` `false` is tautology (`wrong nullifier also not exists`); `build_order.md:53` requires one `transfer` to publish `UseNote` nullifier and compare. `vector1.json` `match:true` overstates — `enc/note_id` verified, nullifier pending `transfer`.

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
https://sepolia.voyager.online/tx/0x7b390c5bbb2e453d7f7ed6021fd40e2c28637257d64bde8750a636e4482e906
https://sepolia.voyager.online/tx/0x5a77cefdb4655c92cd3d71c76f571e730a19a03d43c3ee9ec4ed78fd59fd816
https://sepolia.voyager.online/tx/0x721c69bd4d7971aed8d0612c2e14086a0234072b2410b16e1942800807c1942
https://sepolia.voyager.online/contract/0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91
https://sepolia.voyager.online/contract/0x03132f147f5f210b448bc9d2ece5193bea38d51cfdd4a02dc1ef015e41d72eed
```

## Repro
```powershell
pnpm --filter @starkaudit/audit-sdk add @starkware-libs/starknet-privacy-sdk
node --import tsx/esm --env-file=.env ./scripts/register.ts
```
