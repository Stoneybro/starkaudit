# StarkAudit in plain words

This document explains the whole project simply. You don't need to know Cairo
or cryptography. Everything below comes from reading the actual code.

---

## 1. What is StarkAudit?

StarkAudit lets a business **pay people with private money** on Starknet, while
still giving an **auditor** a way to check the books.

Normal crypto payments are public: anyone can see who paid whom and how much.
StarkAudit hides the who and the how-much, but keeps a trail of tamper-proof
receipts so an auditor can later confirm every payment followed the rules —
without the amounts ever appearing in public.

Think of it like sealed envelopes moving between locked boxes, with a referee
who can open envelopes only when the rules say so.

---

## 2. The two users

There are exactly two kinds of users, each with their own screen:

**The business** (someone who pays people — salaries, freelancers, vendors).
They connect a wallet, register the business, put money into the private
system ("shielding"), and send private payments. They can also watch a history
of everything they did.

**The auditor** (the referee, e.g. an accounting firm). The business picks one
auditor. The auditor sets a spending test — for example "no single payment
above 1 STRK" — plus a duplicate-detection window, reviews a live feed of
payment outcomes (pass / fail / duplicate), sees aggregate statistics, and can
publicly flag a suspicious record as an exception.

---

## 3. The money journey, step by step

Money moves through four stages. Each one is visible in the code:

**Step 1 — Register.** The business calls `register_business` on the registry
contract (a one-time transaction), then picks its auditor with `set_auditor`.
Separately, anyone who holds private money has a **viewing key** — a master
key that opens all of their *own* sealed envelopes. It is registered with the
privacy pool once (inside the wallet app, which never shows it to StarkAudit),
and the business backend keeps its own in a private settings file. The auditor
does not hold anyone's viewing key: what the auditor gets to see is the public
trail — fingerprints, pass/fail outcomes, timing — plus the right to raise
exception flags.

**Step 2 — Shield (go private).** The business moves public STRK tokens into a
shared privacy pool. This takes **two transactions**: first approving the pool
to take the tokens, then the actual deposit. This step is deliberately public —
everyone can see *who* deposited and *how much*. Inside the pool, the money
becomes a **private note**: think of it as cash sealed in an envelope. New
envelopes need about 10 blocks (~a minute or so) before they can be spent;
this waiting period is enforced everywhere in the code.

**Step 3 — Pay privately.** To pay someone, the business's wallet tears up one
of its envelopes and creates new ones — one for the recipient, one for the
change. The torn-up half is called a **nullifier**, and it is published: since
each envelope tears exactly once, a published torn half proves the money can't
be spent twice, without revealing whose envelope it was or what was inside.
Nobody watching can tell sender, recipient, or amount. There is also a batch
version: the payroll contract lets one private payment split out to several
payees in a single transaction.

**Step 4 — Leave an audit trail.** After each private payment, the business
backend files a record with the registry contract: a set of fingerprints (see
section 4) plus a claim of "this payment passed the auditor's test." The
registry checks for duplicates automatically and stores the outcome. The
auditor watches these outcomes arrive in real time.

---

## 4. Fingerprints instead of data (how privacy + auditing coexist)

The registry never stores amounts or names. It stores **fingerprints** —
one-way scrambles of the data (the code makes them with a scrambling function
called Poseidon). A fingerprint reveals nothing, but if you know the original
data you can re-scramble it and check it matches. There are four of them:

- **`audit_commitment`** — fingerprint of (amount + a random salt + recipient
  + time period). The salt is like adding static noise so nobody can guess the
  amount by trying every number. This is what ties a payment to its audit
  record without showing anything.
- **`dup_commit`** — fingerprint of (recipient + amount + period) with *no*
  salt, on purpose. Because it has no noise, the registry can spot when the
  exact same payment fingerprint shows up twice inside the auditor's time
  window and mark it a duplicate automatically.
- **`nullifier`** — the torn envelope half. Proves real money moved (the code
  checks it against the pool) and prevents double-spending.
- **`threshold_commitment`** — the auditor's spending limit, fingerprinted with
  the auditor's own secret salt. Everyone can see the fingerprint and its
  version number, but nobody can read the limit back out of it.

Each payment record also carries small true/false flags: did it pass, is it a
duplicate, was anything left unverified, and was the proof checked off-chain
(see section 7).

---

## 5. The spending test and the locked-box delivery

The auditor's test ("no payment above X") has to reach the business somehow —
the business needs the number to build its payment records — but posting it
publicly would defeat the point. The code solves this with **locked boxes**:

1. The business publishes a public lock (a distribution key) on the registry.
2. The auditor puts the limit number + salt + version number in a box, locks
   it so only the business's private key opens it, and stores the locked box
   on the registry, stamped with the current test version.
3. The business's backend script fetches the box, unlocks it, checks the
   contents match the public fingerprint, and saves the numbers to a local
   file that is never uploaded anywhere. If anything doesn't match, the script
   refuses to continue.

Everyone can see locked boxes being delivered, but only the intended business
can open its own. This replaced an earlier plan of just messaging the numbers
around.

---

## 6. The parts of the codebase (the map)

**Smart contracts** (`contracts/src/src/`) — the on-chain rules. There are two
real ones plus a toy:
- `audit_registry.cairo` — the notebook: business registrations, auditor
  assignments, test fingerprints + versions, locked-box delivery, payment
  records, duplicate detection, exception flags. All readable by anyone.
- `payroll_anonymizer.cairo` — the splitter: in one private transaction, takes
  money from the pool, divides it among several payees, and returns the
  leftovers as private change. It can never create money — the code checks it
  only hands out what it actually holds.
- `mock_erc20.cairo` — fake play money used only in automated tests. Never
  deployed for real (the deploy scripts don't reference it).

**The website** (`apps/web/src/`) — the actual product, a Next.js app with
three areas: a public landing page, the **business workspace** (Settings tab
for the auditor choice, Payments tab for shielding + paying, Activity tab for
history), and the **auditor workspace** (Tests tab for the spending limit and
duplicate window, Findings feed, Analytics). It talks to the user's wallet
(Ready/Argent/Braavos) for signatures and private balances, and reads history
from both the device and the blockchain.

**The toolbox** (`packages/audit-sdk/src/`) — helper code used by the demo
scripts: connecting to Starknet, building payment records (witnesses),
submitting them, talking to the proving service, and the lock/unlock
(seal/open) routines for the locked boxes.

**The scripts** (`scripts/`) — the step-by-step demo pipeline, run in order:
register → shield → check the math against the chain → run sample payments
(one passing, one over the limit, one duplicate) and file their records →
run a batch payroll. Each script refuses to continue if the previous step's
proof isn't verifiable, so a green run means the whole loop genuinely worked.

---

## 7. What's real and what's still placeholder (read this before demoing)

Honest inventory, straight from the code:

- **Real:** the privacy pool connection, the wallet signing, private notes and
  nullifiers, the two-step shield, duplicate detection on-chain, locked-box
  threshold delivery, exception flagging, both dashboards.
- **Placeholder:** the final cryptographic proof-check on the registry.
  Submitting a record stores the proof bytes with an `offchain_verified` flag
  set, meaning "checked by our helper software, not by the blockchain
  itself." The app shows this as a warning badge on every affected record —
  never as a silent pass. The duplicate check and the viewing-key disclosure
  path are the enforcement that works today; the on-chain proof checker is
  explicitly marked as arriving later.
- **Test-only:** the fake token, and any mock data or mock flows (none of them
  are in the real product's paths).

## 8. Rules the system lives by

A few behaviors that show up everywhere in the code, so they don't surprise
you: new private money can't be spent for ~10 blocks; shielding always takes
two wallet approvals (approve, then deposit) plus a small network fee on top
of the pool's own fee; the wallet — not the app — holds all private keys and
asks permission before sharing balances; payment records can only be filed
once per torn envelope (repeats are rejected); and the auditor can always
raise a public exception flag on anything, which is the backstop for anything
automation misses.
