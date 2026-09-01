# ShadowAudit — Private Payroll + Compliance Without Disclosure (STRK20 Private Sprint)

**One-sentence pitch:** A live Starknet mainnet payroll rail where businesses pay privately through STRK20, batch via one anonymizer, and prove to auditors in ZK that every payment followed the rules — without revealing a single amount.

Live pool: `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` (SN_MAIN) · Deadline Sept 7 23:59 UTC · `strk20.json` ships `>=3` mainnet pool txs, contracts, demo + 3-min video.

---

## 1. Why this wins (lean)

Judging `Depth 30% | Product 30% | Innovation 25% | Docs 15%`. Infrastructure that only watches the pool loses depth.

| Criterion | Lean win |
|---|---|
| **Depth 30%** | `Privacy SDK` (business holds `k` as `BigInt`), `Wallet API` (payees), `Shield -> UseNote` + **1 anonymizer** `PayrollAnonymizer` `privacy_invoke` (`Span<OpenNoteDeposit>`, `approve`, `balance-delta`) = every rubric surface in one app |
| **Product 30%** | Day-0 shielding flow, real relayer tx, Voyager `Deposit`/`Nullifier` events, dashboard on Pages — not testnet |
| **Innovation 25%** | `IDEA-21/22` selective-disclosure without escrowing `k`; rule proved, data never disclosed |
| **Docs 15%** | Trust table == code, hidden-vs-visible honest, `MIT`, Voyager links |

Built for `RFP-11 Private payroll` + `IDEA-22 Compliance infra`.

## 2. Problem

1. **Full disclosure** - share `k` encrypted at `SetViewingKey` `viewing-keys.md:53`, auditor sees everything.
2. **Screening** - FPI signature since `v0.14.3` `compliance.md:14` only sanctions.

No way to prove `amount <= threshold` + `no duplicates` without showing amounts.

## 3. Solution (lean, no scope creep)

**Pay privately, prove after:**

- `Shield (public Deposit)` -> `10` blocks maturity -> `Private transfer` (`UseNote` publishes `nullifier = h(NULLIFIER_TAG, channel_key, token, index, 0, owner_private_key)` `notes-and-nullifiers.md:68`, `enc_amount = h(ENC_AMOUNT_TAG, channel_key, token, index, 0, salt)+amount` `viewing-keys.md:25`) or batch via `PayrollAnonymizer` `withdraw->helper distributes->approve pool->credit open note (amount public, owner hidden)` `helpers__privacy-invoke.md:13`.
- **After settlement**, business backend (SDK key-holder, never Wallet API) generates `audit_commitment = h(PRIVATE_AUDIT_TAG, amount, salt, counterparty, period)` (blinded) + `dup_commit = h(DUP_TAG, counterparty, amount, period)` (deterministic, no salt) + Cairo ZK proof bound to `nullifier + enc_amount + note_id = h(NOTE_ID_TAG, channel_key, token, index, 0)` `notes-and-nullifiers.md:52`. Registry verifies (or stores with `offchain_verified` flag) and checks `dup_commit` uniqueness within window.
- Auditor posts `threshold_commitment = h(threshold, auditor_salt)` once, then sees only `pass/fail`, `is_duplicate`, `exceptions`. Never amounts.

Pool untouched; no contract sees a private amount in clear.

## 4. Actors

| Actor | Does | Knows |
|---|---|---|
| Business | Shields, pays (SDK), builds witness, submits | amounts, `k` (`BigInt`), `channel_key`, `salt`, `threshold` |
| Payees | Receive via Wallet API (Ready, `Register` required) | own receipts |
| Auditor | Sets `threshold_commitment` + window, reviews | threshold, `pass/fail`, nullifiers, timing |
| Chain | Stores commitments, verifies or marks `offchain_verified` | hashes, booleans, nullifiers |

## 5. Components (P0 only)

1. **App** - `createPrivateTransfers({account, viewingKeyProvider: BigInt(k), provingProvider:{url,chainId:SN_MAIN}, discoveryProvider: IndexerDiscoveryProvider, pool})` `cairoVersion:"1"`, `AddressMap` `BigInt` keys, `discoverRequirement` -> `setup`.
2. **PayrollAnonymizer** - `fn privacy_invoke(deposits: Span<OpenNoteDeposit>) -> Span<OpenNoteDeposit>` (`CALLER_NOT_PRIVACY`, `approve`, `balance-delta`, `u256->u128`, `at most one invoke/tx`).
3. **Audit Circuit** - public `nullifier, note_id, enc_amount, threshold_commitment, audit_commitment, dup_commit` private `channel_key,token,index,salt,amount,k,counterparty,period,threshold`; constraints `audit_commitment`, `dup_commit`, `threshold_commitment`, `amount<=threshold`, `nullifier` + `enc_amount` binding + `note_id` slot.
4. **Verifier** - reuse Integrity/Herodotus fact-registry if available day1 EOD, else `offchain_verified:true` fallback (indexer verifies, README says so).
5. **AuditRegistry** - `businesses, auditor, threshold_commitment/version, duplicate_window, results:Map<nullifier,AuditResult>, dup_seen:Map<dup_commit,u64>` `submit_proof(nullifier,note_id,audit_commitment,dup_commit,enc_amount,proof)` -> storage check (`pool.view_note_payload(note_id)==enc_amount` if exists else offchain) -> verifier or offchain store -> duplicate check -> `ProofSubmitted(nullifier,pass,is_duplicate,unverified_binding,offchain_verified)`.
6. **Dashboard** - `apps/web` (`Next.js 16.3.4`, `starknet@10.4.0` pinned) `/business` + `/auditor` (event feed, `unverified/offchain` badges, never amount).

**Cut:** shadow accounts (RC-gated `0.14.3-rc.6`), AVNU/Ekubo swap, MPC hidden-threshold - moved to roadmap §9.

## 6. Tests

**T1 Materiality** `amount <= threshold` ZK bound to `nullifier+enc_amount` at `note_id`.
**T2 Duplicate** deterministic `dup_commit` windowed uniqueness; `dup_commit` is auditor-dictionary-attackable (low entropy, §9.5) - accepted for sprint, ZK set-membership is v2.

## 7. Flow

Setup: `register()` (once), `shield approve->deposit (autoSetup:true, wait head-10>receipt)` , auditor posts `threshold_commitment`.
Per batch: `transfer` or `invoke PayrollAnonymizer` with `deposits=[{note_id:openNoteIds[i], token, amount}]` as `InvokeExternal` calldata -> prove `provingBlockId=head-10, tip:0n, proofFacts` conditional -> `submit_proof` -> dashboard.

## 8. Trust

| Data | Business | Auditor | Public |
|---|---|---|---|
| amount, salt, `k`, `channel_key` | ✅ | ❌ | ❌ |
| threshold | ✅ | ✅ | `h(threshold)` |
| `audit/dup_commit` | ✅ | hash (auditor can brute `dup`) | hash |
| `nullifier, enc_*, Deposit, timing` | ✅ | ✅ | ✅ `compliance.md:44` |

## 9. Limitations

1. **Threshold known to business** - timestamped commitment + public frequency mitigates structuring.
2. **Binding needs correct Poseidon tags** `OPEN_NOTE_SALT=1 vs >=2`; gated by `test-vectors/vector1.json` `nullifier+enc_amount` match; else `unverified_binding:true`.
3. **Missing proof = exception** - nullifiers unlinkable without `k` `notes-and-nullifiers.md:87`, `flag_exception` manual.
4. **Anonymizer amounts public** `what-is-strk20.md:23`.
5. **`dup_commit` brute-forceable by auditor** - deterministic for dup detection; general public cannot cheaply but engaged auditor can.
6. **Fallbacks honest:** `unverified_binding` (tags unconfirmed) + `offchain_verified` (no pool view / no on-chain STARK verifier) render as warning badges, never silent pass.

## 10. Scope (6 days)

**P0 never cut (win):** test vectors, circuit + `AuditRegistry` (offchain fallback pre-authorized), `PayrollAnonymizer`, compliant/fail/duplicate private transfers, dashboard auditor view, mainnet `strk20.json` + video.
**P1/P2 cut:** swap, shadow accounts, MPC - roadmap.
**Out:** multi-auditor, historical backtest.

| Day | Focus |
|---|---|
| 1 | Pin web deps, verifier/day1 EOD hard stop (`offchain` fallback ok), pull `note->enc->nullifier` vector Sepolia |
| 2 | Circuit 1-5 vs vector, `PayrollAnonymizer` skeleton |
| 3 | `AuditRegistry` + `dup` wiring, SDK shield on mainnet |
| 4 | End-to-end payroll batch `transfer + invoke` on mainnet, harden prover tail |
| 5 | Dashboard (`auditor` feed), README trust table |
| 6 | Freeze `strk20.json (>=3 pool Succeeded)`, Voyager links, 3-min video (no amount visible) |

## 11. Success

- `SN_MAIN`: `AuditRegistry` + `PayrollAnonymizer` (+ reused verifier if found) ; `strk20.json` `Shield + Private pass + Private fail (+ Invoke)` all `Succeeded` pool events Voyager.
- Dashboard shows `pass/fail/duplicate` + warning badges, amounts nowhere.
- One-liner: *Private payroll that hides every payment but proves every rule on mainnet.*
