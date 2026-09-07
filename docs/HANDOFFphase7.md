# Groundwork — Handoff (end of Phase 6.5 session)

Read this first in a new chat. This supersedes `docs/HANDOFFphase6.md`,
which is now historical — everything in it about Phases 0-5 is still
accurate, but its "Next" section is what this whole session was spent on.
Submission deadline: **September 13, 2026, 06:00** — about 6 days out as
of this handoff.

## What this project is

**Groundwork** — undercollateralized micro-credit on Creditcoin, built for
the BUIDL CTC 2026 Fall hackathon (Attestcoin Protocol theme, DeFi track).
Real-world bill payments — either attested automatically on Ethereum
Sepolia via the Attestcoin Protocol, **or now uploaded manually and
reviewed by a validator** — progressively lower the collateral ratio
required to borrow on Creditcoin.

## READ THIS FIRST — where things stand right now

**Both credit-building paths are live, deployed, and verified
end-to-end on real testnets:**

1. **Automated path** (Phase 1-6): pay a bill on Sepolia -> worker attests
   it -> `GroundworkASC` verifies -> `CreditVault` records it. Unchanged
   this session except the contracts underneath were redeployed (see
   below).
2. **Manual upload path** (new this session): connect wallet -> sign in
   with SIWE -> upload a bill document + claim an amount (in USD, EUR,
   GBP, NGN, CAD, BTC, ETH, or tCTC directly — auto-converted) -> pay a
   small tCTC fee -> a validator reviews the document and approves or
   rejects on-chain. Approval mints a non-transferable "receipt" NFT and
   records the payment on `CreditVault`, exactly like the automated path.

Both paths write to the same `CreditVault`, so a wallet's score/collateral
ratio reflects payments from either path indistinguishably — which is
correct, since `CreditVault` was already designed to be recorder-agnostic
(see the v3 `isRecorder` redesign from last session).

## What changed this session — full contract redeploy + two new contracts

### 1. CreditVault v3 + GroundworkASC redeployed (the item Phase 6 left
   "written, not yet deployed")

The deploy script (`contracts/script/DeployCreditcoin.s.sol`) was
actually **broken** at the start of this session — it still called
`vault.setASC()`, a function v3 had already removed in favor of
`addRecorder()`. This meant `forge build`/`forge test` were failing to
compile, not just "not yet deployed." Fixed, then deployed for real:

| Contract | Address | Status |
|---|---|---|
| `CreditVault.sol` (v3) | `0xe5233ee60688A151AB47F788E164eA9BB013AB05` | **Live** |
| `GroundworkASC.sol` (redeployed, points at v3 vault) | `0x182F1DbfE77784bC2f575233829A253c4bCC7D16` | **Live**, authorized as recorder |

Verified with a real end-to-end payment before moving on: paid a bill,
watched the worker submit the proof against the new contracts, confirmed
`scoreOf` went from 0 to 1 on-chain.

Old v2 addresses (`CreditVault` `0x21209299...`, `GroundworkASC`
`0x77e07d86...`) are now dead — nothing points at them. `BillPay.sol`
(Sepolia) and `EvmV1Decoder` are untouched since Phase 1.

### 2. BillValidator.sol + SoulboundBillRecord.sol (new — the "validator/
   upload system" Phase 6 scoped down to)

| Contract | Address |
|---|---|
| `BillValidator.sol` | `0x63E11DFA6E0141d52ceB0Bac88B41aAf273e9c28` |
| `SoulboundBillRecord.sol` | `0x19B9BC1905Fba793A4ff469262B2626fd74c6F6f` |

- **Single hardcoded validator**, no staking/slashing/rotation — the
  validator address is the deployer wallet, **`0xeb190150aD31C3578511F2Cc552A730930Ef5493`**.
  Deliberately simplest-possible for the demo timeline (decided this
  session, matches the "scoped down given the timeline" language already
  in the Phase 6 handoff).
- Submission fee: `0.0005 tCTC`, forwarded straight into `CreditVault`'s
  lending pool on submission — win or lose the review, it adds to
  borrowable liquidity. No refund on rejection (friction fee, not a
  stake).
- Approval mints a `SoulboundBillRecord` (non-transferable ERC-721)
  directly inside `approveBill` — one token per approved bill, can never
  be transferred (including via `approve`/`setApprovalForAll`, both
  disabled outright).
- Both contracts authorized: `CreditVault.addRecorder(BillValidator)` and
  `SoulboundBillRecord.addMinter(BillValidator)` — confirmed via
  `isRecorder`/`isMinter` reads, both `true`.
- 58/58 tests passing across the full Foundry suite (`BillPay`,
  `GroundworkASC`, `CreditVault`, `BillValidator`, `SoulboundBillRecord`).

`shared/abis/CreditVault.json`, `GroundworkASC.json`, `BillValidator.json`,
`SoulboundBillRecord.json` all regenerated as bare arrays (not full Forge
artifacts — same gotcha as always, see "Known gotchas" below).

## Backend — three new routes, all genuinely SIWE-authenticated

`backend/chain_bills.py` (new) mirrors `chain.py`'s pattern for reading
`BillValidator` state — `get_bill()`, `get_pending_bill_ids()`,
`get_next_bill_id()`, `get_validator_address()`.

`backend/routers/bills.py` (new):

```
POST /api/bills/{bill_id}/upload      — recomputes SHA-256 server-side against
                                         the on-chain documentHash before storing;
                                         requires caller == bill's on-chain payer
GET  /api/bills/mine                  — every bill the signed-in wallet submitted,
                                         real on-chain status per bill
GET  /api/validator/all-bills         — every bill, any status; requires
                                         caller == the one validator address
```

All three require the existing SIWE JWT (`backend/auth.py`,
`/auth/nonce` + `/auth/verify`) — this was built in Phase 3 but never
actually used by the frontend until this session (Phase 5's dashboard
deliberately skipped it for direct on-chain reads instead). Upload and
validator-review genuinely need wallet-ownership proof that can't be done
client-side, so it was worth wiring in.

`GET /api/validator/all-bills` and `GET /api/bills/mine` deliberately
share one underlying full scan (`range(get_next_bill_id())`) rather than
each maintaining separate pending/history logic — this means the
validator's pending queue, the validator's review history, and a
submitter's own status view can never drift out of sync with each other.
Fine at demo scale; would need pagination or an off-chain indexer if the
bill count ever grew large, since it's an O(n) chain-read scan on every
request.

New Supabase migration: `supabase/migrations/0007_bill_submissions.sql` —
a `bill_submissions` table (deliberately **no status column**, since
`BillValidator.bills(billId)` on-chain is the real source of truth) and a
**private** `bill-documents` Storage bucket (zero RLS policies —
service-role key only, which is what makes signed URLs actually mean
something).

`backend/requirements.txt` gained `python-multipart==0.0.20` (required
for FastAPI's `UploadFile`).

## Frontend — two new pages, one new hook set

### `/upload` (new)

- Connect wallet -> SIWE sign-in (new `frontend/lib/useSiweAuth.ts` hook)
- Enter an amount in **USD, EUR, GBP, NGN, CAD, BTC, ETH, or tCTC
  directly** — non-tCTC currencies are converted live
  (`frontend/lib/useCtcConversion.ts`) using Creditcoin mainnet's real
  CTC/USD market price (CoinGecko id `creditcoin-2` — **not**
  `creditcoin`, a different unrelated token) as a stand-in, since testnet
  tCTC itself has no real value. Fiat rates from `open.er-api.com`
  (free, no key). If either API fails, the UI falls back to letting the
  user enter tCTC directly rather than blocking the whole page — this
  makes the upload flow depend on two live third-party services at demo
  time, worth being aware of before a live demo.
- Pick a file -> browser computes SHA-256 via `crypto.subtle.digest` ->
  wallet calls `BillValidator.submitBill()` directly (pays the fee) ->
  billId is read off the `BillSubmitted` event's first indexed topic
  (not assumed from `nextBillId`, which could race) -> file is POSTed to
  the backend.
- "Your submissions" list at the bottom shows every bill the connected
  wallet has submitted with its real status (pending/approved/rejected).
- Linked from `/dashboard` as a proper button ("Have a bill you paid
  off-chain? Submit it for review ->") — was initially just small text,
  upgraded after feedback.

### `/validator` (new, unlisted — no route-level gating; the backend's
   validator-address check is the real gate)

- Same SIWE sign-in.
- "Pending review" section — approve/reject each bill directly via
  wallet (chain-switch to Creditcoin is handled automatically before
  either action — this was missing initially and caused a real
  wagmi chain-mismatch error, now fixed).
- "Review history by wallet" section — every decided bill, grouped by
  payer address, showing final status.

### Other frontend changes

- `frontend/lib/abis.ts` gained `BILL_VALIDATOR_ABI` +
  `BILL_VALIDATOR_ADDRESS`.
- `frontend/components/sections/Resolution.tsx` (the Roadmap section)
  redesigned — was a flat 2x2 grid of plain paragraph cards, now reuses
  the existing "old value -> new value" chip/arrow motif from
  `HowItWorks.tsx` (the `300% -> 110%` treatment) so it visually matches
  the rest of the site's design language instead of looking like the odd
  section out.
- `frontend/package.json` gained the `siwe` npm package.

## Real bugs hit and fixed this session (don't rediscover these)

1. **`DeployCreditcoin.s.sol` was broken** — called removed `setASC()`.
   Fixed to use `addRecorder()`. This is why `forge build` looked fine
   right up until you actually needed to deploy.
2. **`claimed_amount` precision bug** — `chain_bills.get_bill()` returns
   a Python `int` (wei), which FastAPI would serialize as a JSON number.
   Any amount above ~9 quadrillion wei loses precision through
   `JSON.parse` in the browser (JS's 2^53 safe-integer limit). Fixed by
   sending it as a string everywhere it crosses the API boundary; the
   frontend converts back via `BigInt(...)`.
3. **`/validator` page missing chain-switch** — approve/reject would fail
   with a wagmi chain-mismatch error if the wallet was still on Sepolia
   from an earlier action. Fixed to switch chains before either write,
   same pattern `/upload` and `/borrow` already had.
4. **CORS trailing-slash mismatch** — Render's `CORS_ALLOWED_ORIGINS` had
   `https://groundwork-defi.vercel.app/` (trailing slash); the browser's
   actual `Origin` header never includes a path, so it sent
   `https://groundwork-defi.vercel.app` (no slash) and got rejected.
   One character, real CORS failure, only visible on the live Vercel
   site — `curl` and local dev both worked fine, which made this
   confusing to diagnose. Fixed by removing the trailing slash.
5. **Render backend crashed on deploy** — `chain_bills.py` reads
   `BILL_VALIDATOR_ADDRESS` from env at *module import time*, and it
   wasn't set on the Render backend web service (only added locally).
   Crashed with `KeyError` on every boot until added there directly.
   Reinforces the standing gotcha: **local `.env` and Render env vars are
   always separate**, updating one never updates the other.
6. Local `.env.local` had `NEXT_PUBLIC_CREDIT_VAULT_ADDRESS` still
   pointing at the **dead v1** vault (which happens to share an address
   with `BillPay` on Sepolia — the known CREATE-address-collision quirk
   from Phase 1). Production/Vercel was correct the whole time; this was
   local-dev-only. Fixed.
7. `NEXT_PUBLIC_DEMO_PAYEE_ADDRESS`/`_2` were missing locally, producing
   a visible "not configured" error on `/dashboard` — turned out
   production had them set correctly all along
   (`0xeb190150aD31C3578511F2Cc552A730930Ef5493` /
   `0x82678967EAf1c7492e3C7F3CCD584ce8dCEb7b16`, deployer + relayer
   wallets), it was purely a local `.env.local` gap.

## Known, accepted risks (new this session, plus carried over)

- **Currency-conversion dependency on two live third-party APIs**
  (CoinGecko, open.er-api.com) at demo time — has a graceful fallback
  (switch to entering tCTC directly) but worth testing right before any
  live demo in case either is down or rate-limiting.
- **`/api/bills/mine` and `/api/validator/all-bills` are O(n) full scans**
  over every bill ever submitted, on every request — completely fine at
  demo scale (a handful of test bills), would need real pagination or an
  indexer before this could handle meaningful volume.
- **Single hardcoded validator, no rotation without a redeploy** —
  same deliberate scoping as the rest of this feature.
- **`npm audit`: 26 vulnerabilities (24 moderate, 2 high)**, one more
  than Phase 4's count (the `siwe` package added one). Same accepted
  reasoning as before — all in transitive wallet-connector deps, `--force`
  would risk breaking wallet connect this close to the deadline.
- Upload/validator backend routes now have **real SIWE auth** — this is
  an upgrade from the original "no auth for demo" plan discussed at the
  start of the session; decided it was worth the small extra frontend
  sign-in step since the auth infrastructure already existed unused.

## Known, working gotchas (carried over from Phase 6, still true, plus new)

- **`contracts/.env`'s actual var is `PRIVATE_KEY`**, no `DEPLOYER_ADDRESS`
  — derive with `cast wallet address --private-key $PRIVATE_KEY`.
- **`forge create` needs `--broadcast` before `--constructor-args`**, or
  the constructor args greedily swallow it.
- **`forge script` still panics** with `prevrandao not set` on Creditcoin
  CC3 Testnet — always use `forge create`/`cast send` directly there.
  Also: expect a harmless `mixHash` deserialization `ERROR` log line from
  `alloy_provider` on every Creditcoin `cast send`/`forge create` call —
  same root cause, doesn't affect the actual transaction.
- **`shared/abis/*.json` must be bare ABI arrays** — regenerate with the
  same `python3` snippet as before (see Phase 6 handoff), now covering
  `BillValidator`/`SoulboundBillRecord` too.
- **Render env vars are separate from local `.env`, always** — this bit
  us twice this session (item 5 above, and the worker `vault=` log line
  showing the old address until a redeploy actually rolled out).
- **CORS origins need exact string matches, including trailing slashes**
  — new gotcha this session, see item 4 above.
- **`vercel env pull` defaults to the `development` environment** —
  pulling with no `--environment` flag will look empty even when
  production has real values set. Use `--environment=production`
  explicitly when checking what's actually live.
- **A FastAPI module-level `os.environ["X"]`** (no `.get()` fallback)
  will crash the whole app at import time, not just the one route that
  uses it — `chain_bills.py` follows the same pattern as `chain.py`
  deliberately (fail loud on missing config), but it means a single
  missing env var takes down `/health` too, not just the bill routes.

## How Angel wants to work (unchanged, still applies)

- Bugs delivered as direct corrected files, not explained first.
- Syntax/typecheck (`tsc --noEmit` / `forge test` / `python3 -m
  py_compile`) before any file is considered done.
- `python3 << 'PYEOF'` heredocs for file writes with special characters —
  never bash heredocs.
- Terminal commands copy-pasteable one at a time, with checkpoints
  between major steps.
- Every delivered file's destination repo path stated explicitly, every
  time, as a table.
- Ask before major, expensive-to-reverse decisions rather than guessing
  — this is why the SIWE-vs-no-auth call and the fee-destination/
  validator-set design questions got asked explicitly this session
  before any code was written.
- `HANDOFF.md`-equivalent at session end for seamless resumption — this
  file (named `HANDOFFphase7.md` to avoid clobbering `HANDOFFphase6.md`,
  same pattern as prior sessions).

## Not yet done — open items, in priority order, ~6 days to Sept 13

1. **Mocked KYC form** — the last unbuilt item from Phase 6's roadmap.
   Decided already (Phase 6): no Civic (not free), a fully free, honestly-
   labeled mocked form instead — collects the fields a real flow would,
   gates the upload/borrow flow the same way, documented plainly as
   simulated. Not started this session at all.
2. **`docs/demo-script.md` is still a stub** — needs a real walkthrough
   now that both credit-building paths (automated + manual upload) are
   live. Should cover: pay-a-bill-on-Sepolia path AND the upload +
   validator-review path, since the second one is entirely new and a
   judge won't know it exists unless the demo shows it.
3. **Mobile responsiveness** — never explicitly checked for `/upload` or
   `/validator` (carried over from Phase 4/5's same open item on the
   rest of the site). The currency dropdown + amount input row on
   `/upload` in particular hasn't been checked at narrow widths.
4. **`docs/attestcoin-integration.md`'s contract table** — updated this
   session to reflect v3 as current and add `BillValidator`/
   `SoulboundBillRecord`, see the diff in this same commit.
5. Optional cleanup: a few local-only test/scratch files were
   deliberately kept out of git this session
   (`dump_repo.sh`, `get_test_jwt.py`, `patch_abis.sh`,
   `patch_dashboard_upload_link.sh`, `patch_upload_link_bigger.sh`) —
   fine to delete locally once done with them, they were never committed.

## Deployed addresses — quick reference (Creditcoin CC3 Testnet unless noted)

| Contract | Address | Status |
|---|---|---|
| `BillPay.sol` | `0xF0572C9E81943374f8A707F6821710D2262E8B22` | Sepolia, live since Phase 1 |
| `EvmV1Decoder` | `0x16b79d87f11883bb57a3d42480804B637e5a2f8D` | Live since Phase 1 |
| `CreditVault.sol` (v3) | `0xe5233ee60688A151AB47F788E164eA9BB013AB05` | **Live** |
| `GroundworkASC.sol` | `0x182F1DbfE77784bC2f575233829A253c4bCC7D16` | **Live**, wired to v3 vault |
| `BillValidator.sol` | `0x63E11DFA6E0141d52ceB0Bac88B41aAf273e9c28` | **Live** |
| `SoulboundBillRecord.sol` | `0x19B9BC1905Fba793A4ff469262B2626fd74c6F6f` | **Live** |

Dead/superseded: `CreditVault` v2 (`0x21209299...`), `GroundworkASC` v2
(`0x77e07d86...`), `CreditVault`/`GroundworkASC` v1 (see
`docs/attestcoin-integration.md`).

Validator address = deployer wallet = `0xeb190150aD31C3578511F2Cc552A730930Ef5493`.
Relayer wallet (worker) = `0x82678967EAf1c7492e3C7F3CCD584ce8dCEb7b16`.
