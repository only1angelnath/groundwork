# Groundwork — Handoff (end of Phase 6.1 session)

Read this first in a new chat. This supersedes `docs/HANDOFFphase5.md` and
everything before it — that history is still accurate but this file is the
current source of truth. Submission deadline: **September 13, 2026, 06:00**
(extended from the original Sept 6).

## What this project is

**Groundwork** — undercollateralized micro-credit on Creditcoin, built for
the BUIDL CTC 2026 Fall hackathon (Attestcoin Protocol theme, DeFi track).
Real-world bill payments, attested on Ethereum Sepolia via the Attestcoin
Protocol, progressively lower the collateral ratio required to borrow on
Creditcoin. Targets people with no existing crypto capital — the exact
group Creditcoin's own blog names as underserved by overcollateralized
lending.

## READ THIS FIRST — where things stand right now

The **live production site is stable and fully working** end-to-end: pay a
bill → worker attests it → score updates → borrow/repay against it. That
loop has been proven repeatedly on real testnets, including recovering
from two real production bugs (see "Bugs fixed this session" below).

**What's mid-flight and NOT yet deployed:** `CreditVault` v3 — a
multi-recorder redesign (see "Next: finish the validator/upload system"
below) — is written and passing 26/26 local Foundry tests, but has **not
been deployed**. The live site is still running on the v2 `CreditVault`
(repay()-capable, single-ASC-recorder). Do not assume v3 is live until
you've redeployed it and updated every downstream address, following the
exact same sequence used for the v1→v2 redeploy (documented below).

## Current site structure (changed this session)

- **`/` (landing)** — pure marketing: Hero → Benefits → Features →
  HowItWorks → FAQ → Resolution (now a **Roadmap** section — see below —
  ending in a single "Get Started" button that routes to `/dashboard`).
  No wallet connection happens on this page anymore.
- **`/dashboard`** — the actual app: `ConnectButton` at top, then
  `Dashboard` (credit standing, pay-a-bill buttons, live status tracker)
  and `PaymentHistory` (paginated, latest-first, live via Realtime).
- **`/borrow`** — deposit collateral → `borrow()`, view active loan,
  `repay()`. Correctly labeled in **tCTC** (Creditcoin's native currency)
  after a labeling bug fix this session — see below.
- **`Nav`** — has a "Dashboard" link and a "Get Started" button that both
  route straight to `/dashboard`; other links (`Benefits`/`How it
  Works`/`FAQ`/`Roadmap`) now use `/#anchor` instead of bare `#anchor`, so
  they work correctly from `/borrow` and `/dashboard` too (previously
  silently broken off the landing page).

The **Resolution** section (bottom of landing page) was repurposed from an
inline "connect your wallet here" CTA into a **Roadmap** section, listing
the genuinely-deferred v2 items (decentralized validator staking, lender
marketplace, real biller integrations, full KYC) with a single CTA into
`/dashboard`. This was a deliberate response to "the landing page is too
long, and connect-wallet placement should move" — connecting now has
exactly one home (`/dashboard`'s top), not two.

## Deployed contract addresses (current, live)

| Contract | Chain | Address | Status |
|---|---|---|---|
| `BillPay.sol` | Ethereum Sepolia | `0xF0572C9E81943374f8A707F6821710D2262E8B22` | Live since Phase 1, untouched |
| `CreditVault.sol` (v2, repay-capable) | Creditcoin CC3 Testnet | `0x21209299B5B21F0f599f19aF5C1a9D8EF96cC74A` | **Live** — v3 not yet deployed |
| `GroundworkASC.sol` | Creditcoin CC3 Testnet | `0x77e07d8626E506498D01F8B504305C856473A6b4` | **Live**, wired to the v2 vault above |
| `EvmV1Decoder` library | Creditcoin CC3 Testnet | `0x16b79d87f11883bb57a3d42480804B637e5a2f8D` | Unchanged since Phase 1 |

Older, superseded `CreditVault`/`GroundworkASC` addresses (pre-repay, v1)
are documented in `docs/attestcoin-integration.md`'s history for the
record but are dead — nothing points at them anymore.

## Bugs fixed this session (all confirmed resolved in production)

1. **Realtime never fired** — `Dashboard`'s Supabase filter used wagmi's
   checksummed (mixed-case) address, but the worker writes
   `wallet_address` lowercased. Postgres `eq.` is case-sensitive. Fixed by
   lowercasing the filter everywhere on the frontend.
2. **Borrow page threw a chain-mismatch error** instead of prompting a
   network switch. Fixed by explicitly calling `useSwitchChain` before
   every write on both `/borrow` and the Dashboard's pay-bill buttons,
   rather than trusting wagmi's implicit switching.
3. **`submitter.py` treated RPC `"already known"` as fatal** — a mempool
   duplicate-broadcast race (nonce visibility lag on public testnet RPC),
   not a real failure. This alone stalled the worker cursor at block
   `11608476` for **two full days** before being caught. Fixed by waiting
   for the already-pending transaction's receipt (hash computed locally
   from the signed tx) instead of raising.
4. **`shared/abis/*.json` got the wrong shape** — a `cp` step during the
   v1→v2 redeploy copied full Forge build artifacts (dict with
   `abi`/`bytecode`/`metadata`) instead of bare ABI arrays, breaking
   `submitter.py`'s contract loading locally. Fixed by re-extracting just
   `.abi`, plus a defensive unwrap added to `_load_abi()` itself.
5. **`score_history`'s dedup key collided across the v1→v2 redeploy** —
   the original `unique(wallet_address, score)` constraint assumed score
   is monotonic *forever*, which broke the instant score reset to 0 on
   redeploy and started climbing back through the same small integers.
   This silently merged real new writes into stale historical rows.
   Fixed (independently, by whoever last touched `listener.py` — the
   version found this session was already ahead of Claude's own first
   attempt) by deduping on `creditcoin_tx_hash` instead — a genuine 1:1
   identity per verification event, immune to redeploys entirely. See
   `supabase/migrations/0005b_score_history_txhash_dedup.sql`.
6. **`/borrow` mislabeled tCTC as "ETH"** everywhere — `CreditVault` lives
   on Creditcoin CC3 Testnet, so borrow/repay move native tCTC, not ETH.
   Bill payments (Sepolia) are correctly ETH. Relabeled, with a line
   explaining the deliberate cross-chain currency split.

Net effect: the attestation pipeline, once genuinely fixed, has processed
many real payments cleanly. Remaining slowness some payments show is the
**Attestcoin Prover's own attestation latency** (observed 130s–9min in
practice, slower than the ~15s the docs describe) — not a bug. The
frontend now shows a real `bill_events`-status-driven step tracker
(pending → proof_fetched → verified) instead of guessing a timeout.

## UI additions this session

- Live payment-status tracker on `/dashboard` (replaces the old fixed
  90s-timeout "waiting" message entirely)
- Paginated Payment History (10/page, latest-first, live-updating only on
  page 1 to avoid yanking the list out from under someone mid-read)
- Loading skeletons/spinners across `Dashboard` and `PaymentHistory`
- Migration `0006_anon_read_bill_events.sql` opened anon SELECT on
  `bill_events` (mirroring `0004`'s reasoning for `score_history` — this
  data is already public via Sepolia's own explorer)

## Next: finish the validator/upload system

This is the actual remaining scope before Sept 13, agreed in stages this
session rather than attempted all at once (a hard-learned lesson from
this same session's contract-redeploy risk):

1. **`CreditVault` v3 — DONE, not yet deployed.** Replaced the single
   `asc` address + one-time `setASC()` with a `mapping(address => bool)
   isRecorder` + `addRecorder()`/`removeRecorder()` (owner-only, callable
   any number of times). `onlyASC` → `onlyRecorder`. The contract no
   longer cares *which* recorder called `recordVerifiedPayment` — this
   is what lets multiple validators (not just `GroundworkASC`) record
   verified payments later. 26/26 tests passing locally, including
   `test_MultipleRecorders_BothCanRecordPayment` proving two independent
   validator addresses can each record for the same payer.

   **To deploy:** same sequence as the v1→v2 redeploy —
   `forge create` both `CreditVault` and `GroundworkASC` (immutable
   `creditVault` reference means ASC must be redeployed too), then
   `addRecorder(newAscAddress)` instead of the old `setASC`. Update every
   downstream env var (worker `.env` + Render, backend `.env` + Render,
   Vercel `NEXT_PUBLIC_CREDIT_VAULT_ADDRESS`), regenerate
   `shared/abis/CreditVault.json` (bare array, not full artifact — see
   bug #4 above), and re-verify with `cast call` before touching any UI.

2. **`BillValidator.sol`** — not yet written. New contract: user submits
   a bill (pays a small CTC fee), a validator from a small **permissioned**
   set (deliberately not full staking/slashing — that's v2 roadmap,
   scoped down given the timeline) approves or rejects on-chain, calling
   `CreditVault.recordVerifiedPayment` via the same `isRecorder`
   mechanism above.

3. **`SoulboundBillRecord.sol`** — not yet written. Non-transferable
   ERC-721, minted on validator approval — the permanent on-chain
   receipt tying a verified bill to a wallet.

4. **Bill upload + validator review UI** — not yet built. Needs Supabase
   Storage for the uploaded document, a `bill_submissions` table + RLS,
   an upload form, and a minimal validator review view (list pending,
   approve/reject).

5. **KYC — decided this session: no Civic (not free, zero budget).**
   Going with a fully free, honestly-labeled **mocked KYC form** instead
   — collects the fields a real flow would, gates the upload/borrow flow
   the same way, documented plainly as simulated for the demo. No
   third-party dependency, no cost.

## Known, working gotchas (don't rediscover these)

- **`contracts/.env`'s actual var is `PRIVATE_KEY`**, not
  `DEPLOYER_PRIVATE_KEY`. No `DEPLOYER_ADDRESS` var exists — derive with
  `cast wallet address --private-key $PRIVATE_KEY`.
- **`forge create` needs `--broadcast` explicitly** on this Foundry
  version (older versions broadcast by default). It must come *before*
  `--constructor-args`, or `--constructor-args` greedily swallows it as
  an extra constructor argument.
- **`forge script` still panics** with `header validation error:
  prevrandao not set` on Creditcoin CC3 Testnet — always use `forge
  create`/`cast send` directly for Creditcoin-side deploys.
- **`shared/abis/*.json` must be bare ABI arrays**, never a full Forge
  build artifact — see bug #4 above. Regenerate with:
  ```bash
  python3 -c "
  import json
  for name in ['GroundworkASC', 'CreditVault']:
      with open(f'contracts/out/{name}.sol/{name}.json') as f:
          artifact = json.load(f)
      with open(f'shared/abis/{name}.json', 'w') as f:
          json.dump(artifact['abi'], f, indent=2)
  "
  ```
- **`wallet_address` must always be lowercased** on both write (worker)
  and read (frontend filters) — Postgres string equality is
  case-sensitive and wagmi returns checksummed mixed-case addresses.
- **Render env vars are separate from local `.env`** — updating one does
  not update the other. Both the worker cron job's and backend web
  service's Render dashboard env vars need manual updates after any
  contract redeploy, then a manual redeploy trigger.
- **`vercel env add` fails silently-ish** (errors, doesn't overwrite) if
  the var already exists — use `vercel env rm <NAME> production` first.
- **Never paste a private key into a `NEXT_PUBLIC_*` var** — happened
  once this session with the relayer key, caught immediately, rotated.
  `NEXT_PUBLIC_*` vars are shipped to the browser and are public.
- **Browsers can silently reuse a stale same-named download** instead of
  creating `(1)`, overwriting a file you think is new with old content.
  If a fresh file's content doesn't seem to have landed, check
  `ls -t ~/Downloads/<name>*` for duplicates before assuming the code is
  wrong.
- **Supabase CLI isn't set up in this environment** — apply migrations by
  pasting the raw SQL into the Supabase dashboard's SQL editor instead of
  `supabase db push`.

## How Angel wants to work (unchanged, still applies)

- Bugs delivered as direct corrected files, not explained first.
- Typecheck (`tsc --noEmit`) / compile (`forge test`,
  `python3 -m py_compile`) before any file is considered done.
- Every delivered file's destination repo path stated explicitly, as a
  table, every time.
- Ask before major, expensive-to-reverse decisions (contract redeploys,
  dropping a subsystem, currency/chain choices) rather than guessing.
- `HANDOFF.md` at session end for seamless resumption — this file.
