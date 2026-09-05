# StarkAudit — the whole project, explained in plain words

*This document was written by reading only the code in this repository — the Cairo contracts, the TypeScript SDK, the scripts, and the website. No project documentation was used. Every claim below can be checked against the files named in each section.*

---

## 1. What is this project? (the one-paragraph version)

StarkAudit is a working demo of **private payments that come with a built-in compliance report**. A business pays someone with a token called STRK on a blockchain called Starknet, and the payment itself is hidden from the public — nobody can see who paid whom, or how much. At the same time, for every payment the business attaches a tiny mathematical "report card". An auditor (think: accountant or regulator) can read all the report cards and learn exactly one thing about each payment: whether it obeyed the business's spending rule (for example, "no single payment above 1 STRK"), and whether the exact same payment was submitted twice. The auditor still never learns the amounts or the people involved.

The project has four parts that make this happen:

1. **Smart contracts** (written in a language called Cairo) — the rule-keeper that lives on Starknet.
2. **A TypeScript SDK and a set of scripts** — the toolbox that talks to the contracts and to an existing "privacy pool".
3. **A website** (Next.js) — one dashboard for businesses, one for auditors.
4. **A ZK circuit folder** — a planned proof component that is currently only a placeholder (explained honestly in section 9).

---

## 2. Words you need first (no blockchain background assumed)

- **Blockchain / Starknet** — a public computer that anyone can read and no one controls alone. Programs on it are called **contracts**. Every action ("transaction") and every piece of stored data on it is public, forever.
- **Contract** — a program living on Starknet. Think of a vending machine with rules baked in: anyone can call its functions, and its memory ("storage") is publicly readable.
- **STRK** — the money token used here. Like dollars but with 18 decimal places; all code counts in the tiny unit ("wei"). 1 STRK = 1,000,000,000,000,000,000 wei.
- **Wallet** — an app that holds your secret keys and signs transactions (the website supports Ready / Argent / Braavos browser wallets).
- **Testnet (Sepolia) vs mainnet** — a free rehearsal network vs the real one. This project runs on Sepolia; mainnet addresses are also wired in the code.
- **Hash (specifically Poseidon)** — a mathematical blender: feed it any list of numbers, it outputs one huge number ("fingerprint"). Same input → same output. You cannot go backwards from output to input. Change one input digit and the output changes completely.
- **Commitment** — a hash that "commits" you to a hidden value. Publishing `hash(secret)` proves you fixed a secret without showing it. Later you can reveal the secret and everyone checks the hash matches.
- **felt252** — Starknet's basic data type: one very large number (up to ~76 digits). Text is stored as numbers too: the word "starkaudit1" is written `0x7374617263617564697431`. A list of these numbers is written `Span<felt252>`.
- **Zero-knowledge proof (ZK)** — a way to convince everyone that "I know secret numbers with property X" without revealing the numbers. A **prover** builds the proof; a **verifier** checks it cheaply.
- **NaCl box (X25519)** — standard public-key encryption: anyone can lock a message **to** someone's public key; only that person's secret key can open it. Used here like a sealed envelope pinned to a public bulletin board.
- **Privacy pool** — an existing Starknet system (built by Starkware, used here as a dependency) that turns public STRK into "private notes" and lets you spend them without revealing who paid whom.
- **Note** — a secret ticket inside the privacy pool that represents some amount of STRK. Only someone with the right **viewing key** can read what a note contains.
- **Viewing key** — a random secret number that unlocks your notes. Generated once (scripts/derive_viewing_key.ts) and registered with the pool.
- **Nullifier** — a one-time "ticket stub" published when a note is spent. It proves this note was used, so it can never be spent twice — but the stub itself says nothing about the amount or the parties.
- **Open note** — a special kind of note whose amount is deliberately public (the code uses salt = 1 for these). Used for payroll payouts where the *amount* may be known but the *sender/receiver* stay hidden.

---

## 3. The problem, in plain words

Normal blockchain payments are like writing every invoice on a public wall: amount, sender, receiver — all visible to anyone, forever. Companies cannot pay salaries or suppliers that way.

The privacy pool solves the payment part: money goes in, and comes out as secret notes that can be spent silently.

But that creates the opposite problem: **an auditor sees nothing at all.** A company under audit must be able to *prove* it follows rules (spending limits, no double-payments) without *showing* its books.

StarkAudit sits exactly in that gap: keep the payments private, but give the auditor just enough mathematical evidence to do their job — and nothing more.

---

## 4. The three clever tricks at the heart of it

All of this lives in `packages/audit-sdk/src/build_witness.ts` and `packages/audit-sdk/src/types.ts`.

### Trick 1 — The blind report card (audit commitment)

For each payment, the business computes:

```
audit_commitment = poseidon( "starkaudit1", amount, salt, counterparty, period )
```

- `"starkaudit1"` is just a label number (a "tag") so this hash can't be confused with other uses.
- **amount** — the payment size (secret).
- **salt** — a random number that makes the hash unguessable even if you know everything else (otherwise an auditor could guess "is it 5 STRK?" and check).
- **counterparty** — a hash of who got paid.
- **period** — e.g. `20260903` for "September 3rd, 2026".

Only this fingerprint goes on-chain. The auditor collects fingerprints but cannot open them. The salt is what makes it truly blind — that's why the code comments call it "blinded".

### Trick 2 — The duplicate detector (dup commitment)

```
dup_commit = poseidon( "starkaudit2", counterparty, amount, period )   ← NO salt
```

Deliberately **without** a salt, so it's deterministic: pay the same person the same amount in the same period twice → identical fingerprint → the contract spots the repeat. (Trade-off the code openly notes: because there's no salt, someone who already knows the amount, person, and date could confirm their guess. The code accepts this because the auditor is the engaged, trusted party.)

### Trick 3 — Proving which payment you're reporting (nullifier, note_id, enc_amount)

The business proves its report is about a **real, actually-spent note** by recomputing the pool's own three numbers from the note's secret internals (`channel_key`, `token`, `index`, `salt`, viewing key):

- `nullifier` — the ticket stub the pool published when the note was spent.
- `note_id` — the note's address inside the pool.
- `enc_amount` — a mask-plus-amount value the pool stores on-chain (its low 128 bits).

In `scripts/stage5.ts`, before submitting anything, the script checks on-chain that the recomputed nullifier actually exists (`nullifier_exists`). If the math were wrong, it aborts. So every report is cryptographically glued to a real payment that the pool already processed — while the amount inside the report stays hidden.

The tags ("starkaudit1/2/3" and the pool's own "NULLIFIER_TAG:V1" etc.) live in `packages/audit-sdk/src/types.ts` as `TAGS`. The comment trail says they were verified against the pool's published values, and `scripts/stage3.ts` wrote `test-vectors/vector1.json` with `enc_match: true` against the real Sepolia chain — the nullifier was then confirmed on-chain during stage 5.

---

## 5. The privacy pool and the demo journey ("stages")

The scripts folder is literally a step-by-step demo run against Starknet Sepolia. Each script is one stage, and each prints a "gate" — a fact you can verify on the public block explorer (Voyager):

| Stage | Script (scripts/) | What it does |
|---|---|---|
| setup | `derive_viewing_key.ts` | Generates your secret viewing key (a random number; NOT derived from your wallet key). |
| 1 | `register.ts` | Registers the viewing key with the privacy pool (public event `ViewingKeySet`). |
| 2 | `shield.ts` | Turns public STRK into a private note: approve, then deposit 2 STRK. Deposit amount is public; ownership becomes hidden. |
| 3 | `stage3.ts` | Reads the private note via the pool's discovery service, recomputes nullifier/note_id/enc_amount in TypeScript, compares with the chain. Result saved to `test-vectors/vector1.json`. |
| 4 | `deploy_registry.ts`, `registry_setup.ts` | Deploys the AuditRegistry; registers the business; auditor sets the threshold commitment. |
| 4.5 | `dist_keygen.ts` → auditor dashboard → `sync_package.ts` | The sealed-envelope threshold handover (section 8). |
| 5 | `stage5.ts` | The heart of the demo: three private payments — 0.5 STRK (below threshold → pass), 1.5 STRK (above → fail), 0.5 STRK again to the same payee+period (duplicate → fail) — with a report card submitted for each, and all three outcomes verified on-chain. |
| 6 | `deploy_payroll.ts`, `payroll.ts` | Private payroll: spends one 0.5 STRK note, pays two "employees" via open notes (0.3 + 0.2, amounts public, identities hidden) through the PayrollAnonymizer contract. Checks the helper ends empty. |
| 7 | (the website) | Wallet-connected dashboards for business and auditor. |
| 8 | `seed_mainnet.ts` | A mainnet-ready version of the same flow (partially scaffolded). |

One operational rule the code enforces everywhere: **notes "mature" 10 blocks after the transaction that created them.** Scripts call `waitForMaturity(...)` (in the SDK's `connect.ts`) before the next private action, and every private transaction is proven against a block that is at least 10 blocks behind the tip (`getProvingBlockId` returns `head − 10`). The scripts also retry flaky RPC calls and add a 30% safety margin when estimating fees.

---

## 6. The smart contracts (`contracts/src/src/`)

Cairo is Starknet's programming language. A contract has **storage** (its own memory, publicly readable), **functions** others can call, and **events** (announcements it publishes, which websites listen to). This repo has two real contracts and one test-only token.

### AuditRegistry (`audit_registry.cairo`) — the compliance ledger

Storage: registered businesses, each business's chosen auditor, per-business threshold commitments + versions, per-business duplicate windows (default 7 days), all submitted results (keyed by nullifier), per-business first-seen timestamps for duplicate detection, and the sealed-envelope material (section 8). There is no global auditor.

Key functions:

- `register_business()` — anyone can register *themselves* (open on purpose so demo judges can use fresh wallets).
- `set_auditor(auditor)` — a business names its auditor. Open by design: any wallet picks the auditor for *itself*.
- `set_threshold_commitment(business, hash)` — **that business's auditor only** (`NO_AUDITOR` if the business never named one, `NOT_AUDITOR` otherwise). Publishes `poseidon("starkaudit3", threshold, salt)` and bumps that business's version counter. The actual threshold number never goes on-chain — only the fingerprint.
- `set_duplicate_window(business, seconds)` — that business's auditor only. How long a repeat counts as a duplicate (default 7 days = 604800 seconds).
- `submit_proof(...)` — the main event. Anyone may call it (an accepted demo trade-off, noted in code comments). Steps, in order:
  1. **Anti-replay**: each nullifier can be reported once (`ALREADY_SUBMITTED` otherwise).
  2. It stores the caller as the `business`, the note_id, both commitments, and the submitter's 1-bit `pass_claim` (their claimed verdict — the *amount* can never go on-chain because transaction data is public).
  3. **Duplicate detection (per submitter business)**: if this `dup_commit` was first seen *by the same business* within that business's window → `is_duplicate = true`. The contract then overrides the claim: `pass = pass_claim && !is_duplicate`. On-chain you get a trustworthy verdict — pass / fail / duplicate — with zero amounts revealed.
  4. Emits `ProofSubmitted` (nullifier, business, pass, is_duplicate, plus the two honesty flags below).
- `flag_exception(business, nullifier)` — that business's auditor only; raises a manual "needs attention" event.
- View functions: `get_result`, `is_registered`, `get_auditor(business)`, `get_threshold_commitment(business)`, `get_threshold_version(business)`, `get_duplicate_window(business)`, and the sealed-envelope functions of section 8.

Two honesty flags stored per result, both currently fixed by design:
- `offchain_verified = true` — the *proof itself* is not yet verified on-chain (see section 9), so a backend/indexer double-checks it.
- `unverified_binding = false` — the glue to the pool's note format *was* confirmed (stage 3 vector), so this fallback flag is off.

### PayrollAnonymizer (`payroll_anonymizer.cairo`) — the payroll splitter

A small, careful contract used in stage 6. It is callable **only by the privacy pool** (`CALLER_NOT_PRIVACY` guard — a plain account can't invoke it). The pool first pulls the money out of a private note and hands it to this contract; then the contract:

1. Takes a list of payee entries (note_id + token + amount), built by the client.
2. Checks: 1..128 entries, every entry uses the expected token, and the total never exceeds what the contract actually holds (`INSUFFICIENT_INPUT` — it can't invent money).
3. Approves the pool to pull back exactly that total.
4. Returns the list to the pool as "credit instructions", so each payee receives an **open note** — amount visible, identity hidden.

A nice robustness detail (with its own test, `test_privacy_invoke_donation_does_not_brick`): if someone dumps extra tokens into the contract as a "donation", payroll still works — only the exact total is approved and pulled; the dust just sits there.

### MockERC20 (`mock_erc20.cairo`) — fake money for tests only

A minimal token with open minting, used by the test suite. Never deployed for real.

The contracts are built with Scarb (Cairo's build tool; toolchain `starknet = "2.10.1"`, edition 2024_07 per `contracts/src/Scarb.toml`) and tested with **starknet-foundry (snforge)** — `contracts/src/tests/` holds 29 tests (23 for the registry, 6 for payroll) covering per-business access control, per-business threshold versioning and duplicate isolation, submit/anti-replay behavior, event emission, the payroll guard rails, and the sealed-envelope rules.

---

## 7. The TypeScript SDK (`packages/audit-sdk/`)

A small private library (not published to npm) named `@starkaudit/audit-sdk`. It wraps two things: the **starknet-privacy-sdk** (Starkware's toolkit for the pool) and **starknet.js** (the general Starknet library). Files and their jobs:

- **`connect.ts`** — connection plumbing: builds the RPC connection and signer account, holds the pool addresses for Sepolia and mainnet, and implements the maturity/proving-block rules from section 5. Everything from the privacy SDK is re-exported through here so scripts have one import point.
- **`types.ts`** — the shared shapes (`AuditWitness` = everything needed to describe one audited payment) and the `TAGS` constants.
- **`build_witness.ts`** — the math of section 4: builds the audit commitment, dup commitment, threshold commitment, and derives nullifier/note_id/enc_amount; plus `buildPublicInputs` (the six numbers a real proof would take as public inputs) and `checkMateriality` (the plain `amount <= threshold` pre-check).
- **`submit.ts`** — sends the report card to the registry (`submitProof`) and the auditor's exception flag (`flagException`).
- **`prover.ts`** — a client for the **Starkscan prover relay** (mainnet proving service at `api.starkscan.co`): submit a transaction to be proven, poll the job until it succeeds, with careful handling of every failure mode (retryable vs. "do NOT resubmit" states, delivered-once results that must be persisted immediately, attestations that expire after 300 seconds). This is the mainnet counterpart of the Sepolia proving service.
- **`distribution.ts`** — the sealed-envelope crypto of section 8 (seal/open threshold packages with NaCl box, pack/unpack them into the felt format the contract stores).

---

## 8. The sealed envelope: how the auditor shares the secret spending rule

Here's a subtle chicken-and-egg problem the code solves elegantly:

- The business needs the **actual threshold number** (e.g. 1 STRK) to build its report cards.
- But the threshold commitment on-chain is just a fingerprint — you can't extract the number from it.
- And nobody wants the auditor emailing secret numbers around.

The solution, spread across the contract, the SDK (`distribution.ts`), and three scripts:

1. **The business publishes a "mailbox"** — an X25519 encryption public key — on-chain via `set_distribution_key` (script: `dist_keygen.ts`; the matching secret goes only into `.env` as `BUSINESS_DIST_SECRET`, which is gitignored).
2. **The business's auditor drops a sealed envelope into that mailbox**: `share_threshold_package(...)` stores an encrypted package containing `(threshold, salt, version)` — that business's auditor only. Encryption uses NaCl box (X25519 + XSalsa20-Poly1305), with a fresh one-time key and nonce per package. The 88-byte ciphertext is chopped into three 31/31/26-byte chunks because of how Starknet numbers work (that's the `eph_low/eph_high/nonce/c0/c1/c2` you see in the contract).
3. **The business opens its own mailbox**: `sync_package.ts` reads the package from the chain, decrypts it with the secret, and then — importantly — **checks the opened numbers against the public fingerprint**: it recomputes `poseidon("starkaudit3", threshold, salt)` and refuses to continue unless it matches the on-chain commitment and the version matches the current on-chain version. A tampered, stale, or wrong package is rejected before anything uses it.
4. The opened values are written to `threshold-package.json` (gitignored — it contains live secrets), and `stage5.ts` refuses to run without it, so **the threshold is never hardcoded anywhere**.

The exact same sealing logic is duplicated in the website (`apps/web/src/lib/distribution.ts`) because the browser dashboard can't import the Node SDK package — the file headers explicitly warn to keep the two byte-layouts identical. The repo even has a self-test for this crypto: `scripts/dist_roundtrip_check.ts` (seal → open → verify commitment → reject wrong keys → reject tampering).

---

## 9. The ZK circuit — the honest status

A folder `circuits/` exists with `circuits/src/materiality.cairo`. Right now it is a **stub**: the file spells out exactly what the future proof would establish (five constraints binding the commitments, the threshold comparison `amount <= threshold`, and the note's identity numbers) and then says, in its own words: *"TODO: Implement after Stage 3 test vector is confirmed... For now this file is a documentation stub"* with an empty `main()`.

Consequently, the deployed contracts take the **"offchain_verified" path**:

- `contracts/interfaces/i_verifier.cairo` defines the *interface* for a future on-chain proof verifier but has no implementation — the file itself says a Stwo-compatible verifier is still to be chosen.
- `submit_proof` accepts the `proof` and `public_inputs` arrays and stores them as-is, marking each result `offchain_verified = true`. Scripts actually submit empty arrays here (see `scripts/stage5.ts`).
- In the meantime, the trust anchor is the **nullifier check** (section 4, trick 3): the report must reference a nullifier the pool actually published, which the stage 5 script verifies on-chain before submitting, plus the auditor's off-chain re-verification against the stored commitments.

So the current demo proves "this report is glued to a real payment" via on-chain cross-checks, and leaves "the claimed pass/fail verdict was computed correctly" to the auditor's off-chain check plus a future ZK circuit. The code is upfront about this everywhere.

---

## 10. The website (`apps/web/`)

A Next.js 16 + React 19 + Tailwind app ("web" package). Three pages:

### `/` — marketing landing page
Hero, problem, how-it-works, features, use cases. Pure presentation (static components in `src/components/home/`).

### `/business` — the business dashboard
An onboarding flow plus three views behind a sidebar:

1. **Connect wallet** — `useWallet` discovers installed browser wallets (Ready/Argent/Braavos), filters out non-Starknet wallets like MetaMask, restores the last session, and creates a `WalletAccountV6` — the starknet.js account type that also speaks the STRK20 "Wallet API" privacy methods.
2. **Register** — one click sends `register_business` to the registry (with a nice touch: if the network call *fails*, the app shows a retryable error instead of pretending you're not registered, since registration lives on-chain and is never lost by a bad connection).
3. **Settings** (`AuditorPanel`) — pick your auditor (`set_auditor`).
4. **Payments** (`PaymentsPanel`) — two actions:
   - **Shield**: turn public STRK into private shielded balance.
   - **Pay privately**: send a private payment to any Starknet address.
   
   Both go through the wallet's privacy methods (`strk20InvokeTransaction`) — the *wallet itself* builds and proves the private transaction; the website never touches viewing keys. The code maps wallet error codes to plain English (e.g. "PRIVACY_LEAK" → "the wallet blocked this because it would weaken your privacy — shield first, then pay in a separate transaction").
5. **Activity** (`ActivityPanel`) — your payment history. Locally typed amounts are kept **only in the browser's localStorage**; the chain only ever shows hashes and booleans.

The shielded balance read (`strk20Balances`) triggers a wallet consent prompt, so the app deliberately queries it only on first load and on explicit refresh — never on tab switches (see `providers.tsx` for the quiet query-client settings).

### `/auditor` — the auditor workspace
Same shell, four tools:

1. **Tests/Thresholds** (`ThresholdsPanel`) — set the threshold commitment (it computes `poseidon("starkaudit3", threshold, salt)` in the browser and stores *only* the hash on-chain, keeping the numbers in memory just for this session), set the duplicate window, flag exceptions.
2. **Distribution** (`DistributionPanel`) — the sealed-envelope sender: lists all registered businesses with their on-chain mailboxes, and seals + shares the threshold package per business or all at once.
3. **Findings** (`FeedFindings`) — the live feed of every `ProofSubmitted` event: nullifier, business, pass/fail/duplicate flags — no amounts, by design.
4. **Analytics** (`FeedAnalytics`) — counts and pass/fail/duplicate statistics over the feed.

The data layer (`src/lib/registry.ts`) reads the registry's events directly from an RPC node with a comment that says it plainly: *"this data layer only reads nullifiers, commitment hashes, business addresses and boolean flags. Amounts and counterparties are never fetched and never rendered."*

### Under the hood
`lib/starknet.ts` (chain constants, event selectors, Voyager links), `lib/payments.ts` (STRK formatting, transaction-status polling, reading public pool `Deposit` events for shield history), `lib/distribution.ts` (browser copy of the sealing crypto), `hooks/useProofFeed.ts` (polling the registry feed). The `.env.local` wires it to Sepolia with public values only — the only secrets in the whole repo live in gitignored files.

---

## 11. How to run it (from the code's own wiring)

The repo is a **pnpm workspace** (`pnpm-workspace.yaml`) with three packages: `apps/web`, `packages/audit-sdk`, and the root scripts. Node ≥ 24.

```bash
pnpm install                                   # install everything

# Contracts (needs Scarb + starknet-foundry):
cd contracts/src && scarb build                # build Cairo contracts
snforge test                                   # run the ~30 Cairo tests

# Contracts → chain (uses .env: STARKNET_RPC_URL, ACCOUNT_ADDRESS, ACCOUNT_PRIVATE_KEY):
pnpm tsx scripts/deploy_registry.ts
pnpm tsx scripts/deploy_payroll.ts

# Demo journey (stages above, all read .env):
npx tsx scripts/derive_viewing_key.ts          # put VIEWING_KEY in .env
pnpm tsx scripts/register.ts
pnpm tsx scripts/shield.ts
pnpm tsx scripts/stage3.ts                     # writes test-vectors/vector1.json
pnpm tsx scripts/registry_setup.ts
node --import tsx/esm --env-file=.env ./scripts/dist_keygen.ts      # business mailbox
node --import tsx/esm --env-file=.env ./scripts/sync_package.ts     # open the envelope
pnpm tsx scripts/stage5.ts                     # the three-payment demo
pnpm tsx scripts/payroll.ts                    # private payroll demo

# Crypto self-check (offline, no chain needed):
node --import tsx/esm ./scripts/dist_roundtrip_check.ts

# Website (uses apps/web/.env.local):
pnpm --filter web dev                          # http://localhost:3000
```

Configuration files worth knowing: `snfoundry.toml` (contract test/build settings — the RPC URL is scrubbed to a placeholder so no API key ships in a tracked file), `contracts/Scarb.toml` + `contracts/src/Scarb.toml` (Cairo toolchain 2.10.1, snforge_std v0.63.0), `.env.example` (the template listing every variable the scripts need), and `strk20.json` (an empty scaffold where demo transactions/links get recorded). A tiny inconsistency worth knowing: the circuits folder pins an older snforge tag (v0.39.0) — another hint that it's the untouched stub.

**Security note:** every genuinely sensitive file is kept out of git: `.env*` (real keys/URLs), `threshold-package.json` (live threshold + salt), and `starkli-account.json` / account artifacts (gitignored; the public-only account file was untracked from the repo). Two things were previously exposed in git *history* and should be treated as burned: an Alchemy RPC key (introduced in commit `73ccd38`, was in `snfoundry.toml`) and a demo viewing key (was in a since-deleted `report.md`, commit `b0a7dc5`) — rotate the Alchemy key and don't reuse that viewing key.

---

## 12. The whole story in one flow

Here is the full journey of one payment, end to end:

```
 SETUP (once)
   Business wallet ──register_business()──▶ AuditRegistry
   Business runs dist_keygen ──publishes X25519 "mailbox"──▶ AuditRegistry
   Auditor sets threshold ──poseidon("starkaudit3", T, salt)──▶ AuditRegistry (hash only)
   Auditor seals {T, salt, version} ──NaCl box to the mailbox──▶ AuditRegistry
   Business runs sync_package ──decrypt + check hash──▶ threshold-package.json (local)

 EVERY PAYMENT
   1. Business shields STRK into the privacy pool (public deposit → private note)
   2. Business pays privately (wallet proves and sends the private transaction;
      the pool publishes only a nullifier — a blind "ticket stub")
   3. Business backend recomputes from the note's secrets:
        audit_commitment = poseidon("starkaudit1", amount, salt, payee, period)
        dup_commit       = poseidon("starkaudit2", payee, amount, period)
        nullifier / note_id / enc_amount  (must match the pool's own numbers)
   4. Business calls registry.submit_proof(nullifier, note_id, both commits, enc_amount,
        pass_claim)                    ← amounts NEVER leave the browser/backend
   5. Contract: checks replay, checks duplicate window, overrides
        pass = pass_claim && !is_duplicate, emits ProofSubmitted
   6. Auditor website reads ProofSubmitted events → sees pass / fail / duplicate
        for every payment, and nothing else.
```

What the auditor's screen shows: `nullifier 0x72c9…, business 0x5678…, PASS` — and that is genuinely all there is to see.

---

## 13. File map (what lives where)

```
starkaudit/
├── contracts/
│   ├── Scarb.toml                  workspace config for Cairo code
│   ├── interfaces/i_verifier.cairo interface for a future on-chain proof verifier (stub)
│   └── src/
│       ├── Scarb.toml              Cairo toolchain 2.10.1 + snforge_std
│       └── src/
│           ├── lib.cairo           module list (the three contracts)
│           ├── audit_registry.cairo    the compliance ledger (~400 lines)
│           ├── payroll_anonymizer.cairo the payroll splitter (~110 lines)
│           └── mock_erc20.cairo    test-only token
│       └── tests/                  25 snforge tests (19 registry + 6 payroll)
├── circuits/
│   ├── Scarb.toml
│   └── src/materiality.cairo       ZK proof circuit — documented stub, empty main()
├── packages/audit-sdk/src/
│   ├── index.ts    connect.ts  types.ts  build_witness.ts
│   ├── submit.ts   prover.ts   distribution.ts
├── scripts/                        the staged demo (sections 5, 8, 11)
├── apps/web/                       Next.js website (landing + 2 dashboards)
├── test-vectors/vector1.json       stage-3 verification artifact (real Sepolia data)
├── snfoundry.toml  package.json  pnpm-workspace.yaml  .env.example
└── .gitignore                        (env files, account artifacts and threshold-package.json are excluded)
```

---

## 14. Cheat sheet — the ten sentences to remember

1. StarkAudit = private STRK payments **plus** a blind compliance report for every payment.
2. The privacy pool (existing Starkware infrastructure) does the hiding; StarkAudit does the reporting.
3. A report card is three hashes + the pool's own nullifier/note_id/enc_amount — never an amount.
4. The salt in the audit commitment is what makes the report truly blind; the dup commitment deliberately has no salt so repeats are detectable.
5. The contract's job is bookkeeping + duplicate detection: pass = claimed-pass AND not-a-duplicate.
6. The spending rule travels from auditor to business as an encrypted "sealed envelope" stored on-chain, opened only by the business, and verified against a public fingerprint.
7. The ZK circuit is not built yet — today's trust comes from on-chain nullifier cross-checks and the auditor's off-chain verification, and the code says so honestly.
8. The website has two dashboards (business / auditor); private payments are executed by the wallet itself, never by the website.
9. Everything secret lives in gitignored files (.env, threshold-package.json); everything on-chain is public by design.
10. The scripts folder is a guided demo: shield → pay → report → verify, in seven stages that each print a checkable "gate".

---

*Document generated from the codebase at commit `1da8828` (branch `main`). No project documentation was consulted; all file references point into the repository so every claim can be verified directly.*

