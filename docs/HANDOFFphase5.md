# Groundwork — Handoff (end of Phase 5 deploy/integration session)

Read this first in a new chat. This supersedes `docs/HANDOFFphase4.md`,
which is now historical (Phase 4 frontend rebuild only — everything below
covers what happened after that, deploying and integrating everything).
Submission deadline: **September 6, 2026, 23:59 ET.**

## READ THIS FIRST — critical open item

**The frontend has no bill-payment or dashboard UI yet.** `Resolution.tsx`
only renders `ConnectButton` — there is no "Pay a bill" action anywhere,
and no view of the connected wallet's score or collateral ratio. Contracts,
worker, and backend are all real and working; the deployed frontend is
currently just marketing copy plus a wallet-connect button. **This must be
built before the project is a demoable, judgeable loan product** — right
now it's infrastructure, not a product a judge can actually use.

### Product clarification reached this session (read before building)

A mid-session pause happened over confusion about payer/payee/lending
roles. Resolved as follows — this is the actual architecture, confirmed
against the real deployed contracts, not a proposal:

- **`CreditVault.sol` IS the lender, directly.** It holds a balance
  (`receive()` is payable) and `borrow(amount)` pays the caller straight
  from that balance, gated by `requiredCollateralRatioOf(caller)`.
  Groundwork is not a guarantor or credit-score provider for some other
  lending platform — no such integration exists anywhere in this codebase.
- **Payer** = the connected wallet, always. They sign `BillPay.payBill()`
  and later `CreditVault.borrow()` directly — the worker/backend/relayer
  never touch either transaction, only the *proof* of the Sepolia payment
  in between.
- **Payee** = whoever the bill was nominally paid to. The protocol doesn't
  care who this is — `BillPay.payBill(payee)` just emits an event; the
  attestation pipeline only cares that a payment happened. Real-world
  biller integration (so `payee` means something to an actual landlord/
  utility company) is explicitly out of scope for this hackathon. For the
  demo, payee is symbolic — use a fixed address you already control
  (deployer or relayer wallet) rather than asking a judge to type one in.

### UI decisions already made (before running out of credit)

- **Dashboard reads score/collateral directly on-chain** via wagmi
  (`useReadContract` against `CreditVault.scoreOf` /
  `requiredCollateralRatioOf`) — not through the backend API. No SIWE/JWT
  dependency in the frontend, always accurate, matches CreditVault being
  the actual source of truth (same principle `worker/listener.py`'s own
  `_write_score_history` docstring already states).
- **Live updates via Supabase Realtime** on `score_history`, matching the
  original design doc's intent (`build-roadmap.md`'s sequence flow:
  "Supabase Realtime — pushes row — Frontend"). **Requires a new
  migration** — `score_history`'s current RLS
  (`supabase/migrations/0001_bill_events_and_score_history.sql`) only
  allows `authenticated` role reads with a matching JWT claim, but the
  frontend has no SIWE-issued Supabase JWT (deliberately, per the decision
  above). Realtime is gated by the same RLS as REST reads, so an anon-key
  subscription currently gets nothing. Fix: add anonymous SELECT on
  `score_history` — justified because this data is already publicly
  readable directly on-chain via `scoreOf`/`requiredCollateralRatioOf`
  regardless, so RLS isn't actually protecting anything confidential here.
  This also matches the landing page's own "Transparent by Design" copy
  section. Do NOT loosen `bill_events`' RLS the same way without thinking
  it through separately — it carries payee/amount detail per-row, a
  slightly different judgment call than the score/ratio mirror.

### Not yet built — the actual next steps

1. **Demo payee address** — user was about to paste their deployer wallet
   address as the fixed demo payee when this session ended. Get that
   address first before writing the pay-bill button.
2. **`supabase/migrations/0004_anon_read_score_history.sql`** — new
   migration adding an anon SELECT policy on `score_history` (see above).
3. **`frontend/lib/supabase.ts`** — Supabase client using
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already
   set as Vercel env vars from this session — just needs the client
   wrapper code).
4. **`frontend/lib/abis.ts`** — the frontend currently has ZERO contract
   ABI imports anywhere (checked: `providers.tsx`, `wagmi.ts` — neither
   references `shared/abis/`). Next.js can't easily import from
   `../shared/abis` outside the `frontend/` root without extra webpack
   config, and contracts are frozen/deployed at this point, so the
   pragmatic fix is a small inlined ABI-fragment file (just `payBill`,
   `scoreOf`, `requiredCollateralRatioOf` — not the full ABIs), clearly
   commented as mirroring `shared/abis/*.json`.
5. **`frontend/components/sections/Dashboard.tsx`** — new component,
   shown when `useAccount().isConnected`:
   - Reads `scoreOf`/`requiredCollateralRatioOf` via `useReadContract`
   - Subscribes to Supabase Realtime on `score_history` filtered to the
     connected wallet, updating local state on new rows (after step 2's
     migration lands)
   - "Pay a bill" button — `useWriteContract` calling
     `BillPay.payBill(demoPayeeAddress)` with a fixed small ETH amount
     (e.g. 0.001 ETH, matching the Phase 1 proof-of-concept's amount)
   - Transaction status feedback via `useWaitForTransactionReceipt`
     (pending → confirmed)
6. **Wire `<Dashboard />` into `frontend/app/page.tsx`**, after
   `<Resolution />`.

## What's deployed and verified working (all confirmed live this session)

| Component | Platform | Status |
|---|---|---|
| Contracts | Sepolia + Creditcoin CC3 Testnet | Deployed Phase 1, unchanged |
| `worker/` | Render Cron Job (`python listener.py --once`, `*/1 * * * *`) | Live, caught up to Sepolia tip |
| `backend/` | Render Web Service (`uvicorn main:app --host 0.0.0.0 --port $PORT`) | Live at https://groundwork-web-service.onrender.com, `/auth/nonce` + `/docs` verified |
| `frontend/` | Vercel | Live at https://groundwork-defi.vercel.app |
| Database/Auth/Realtime | Supabase | `worker_state` table added for cron cursor persistence |

### Worker — Render Cron Job specifics

Deployed as a **Cron Job**, not a Background Worker — Render has no free
tier for Background Workers ($7/mo minimum), but Cron Jobs bill per actual
runtime with a **$1/mo minimum**, which is what this actually costs.

- Root directory: `worker`, build: `pip install -r requirements.txt`,
  command: `python listener.py --once`, schedule: `*/1 * * * *`
- `listener.py` gained a `scan_once()` function + `--once` CLI flag (single
  pass, no loop/sleep) alongside the original `run_forever()` (unchanged,
  still there for a future Background Worker deploy if ever wanted)
- Since Cron Jobs have no persistent disk, `worker/state.py`'s local
  `last_block.json` can't survive between runs. Added
  `get_last_scanned_block()`/`set_last_scanned_block()` to
  `supabase_client.py`, backed by a new `worker_state` table
  (`supabase/migrations/0003_worker_state.sql`). Verified: cursor
  round-trips through Supabase correctly across consecutive runs, both
  locally and on live Render cron executions.
- Env vars: `SEPOLIA_RPC_URL`, `BILLPAY_CONTRACT_ADDRESS`,
  `CREDITCOIN_TESTNET_RPC_URL`, `GROUNDWORK_ASC_ADDRESS`,
  `CREDIT_VAULT_ADDRESS`, `RELAYER_PRIVATE_KEY`, `PROVER_API_URL`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LISTENER_START_BLOCK=11527294`

### Backend — Render Web Service specifics, two real bugs fixed

1. **Python version**: Render defaulted to 3.14.3, which has no prebuilt
   `pydantic-core` wheel yet — pip tried compiling from source via
   maturin/Rust and failed (Render's build filesystem is read-only for the
   cargo cache). Fixed via `backend/.python-version` pinning `3.11.9`
   (Render's `runtime.txt` mechanism is deprecated; `.python-version` or
   the `PYTHON_VERSION` env var are current).
2. **`abnf`/`siwe` incompatibility**: `siwe==4.4.0`'s bundled grammar files
   redefine the `ALPHA` core rule, which a newer `abnf` release (siwe's own
   `pyproject.toml` only constrains `abnf` to `>=2.2,<3`, wide enough to
   resolve the newest 2.x) now rejects at import time
   (`abnf._parser_python.GrammarError`). Fixed by pinning
   `abnf==2.3.1` explicitly in `backend/requirements.txt`. Verified locally
   in a clean venv before deploying.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`,
  `CREDITCOIN_TESTNET_RPC_URL`, `CREDIT_VAULT_ADDRESS`,
  `CORS_ALLOWED_ORIGINS=http://localhost:3000,https://groundwork-defi.vercel.app`

### Frontend — Vercel specifics, three real bugs fixed

1. **MetaMask "Malicious—flagged as unsafe" warning** on the original
   domain `groundwoork.vercel.app` — almost certainly a typosquat-pattern
   false positive (real word + one extra letter is a classic phishing
   domain shape). Fixed by renaming to `groundwork-defi.vercel.app`.
2. **Vercel dashboard env var UI was unreliable** ("change to Config"
   wouldn't save) — worked around entirely via the Vercel CLI
   (`vercel env add <NAME> production`) instead. All six
   `NEXT_PUBLIC_*` vars are set this way now; if any need updating, prefer
   `vercel env add`/`vercel env rm` over the dashboard UI.
3. **WalletConnect QR modal crash**: `Uncaught Error: invalid border=0`,
   inside `@walletconnect/ethereum-provider`'s bundled modal, on the
   *latest available* RainbowKit (`2.2.11` — confirmed no newer version
   exists). Tried force-overriding `@walletconnect/ethereum-provider` to
   `2.24.0` via `package.json`'s `overrides` — this made it WORSE (crashed
   on every page load, not just the QR modal; reverted immediately). Real
   fix: removed the WalletConnect connector entirely from
   `frontend/lib/wagmi.ts` — switched from `getDefaultConfig` to
   `connectorsForWallets` with an explicit list (`metaMaskWallet`,
   `coinbaseWallet`, `injectedWallet`). `injectedWallet` already covers any
   EIP-6963 browser-extension wallet generically (confirmed: SafePal
   connects fine through it with no dedicated connector needed) — so no
   real functionality was lost, only the broken QR-scan-a-mobile-wallet
   path. **Known limitation going forward**: no way to connect via a
   mobile wallet by scanning a QR code. Demo path is MetaMask or SafePal
   via browser extension.

### Mobile responsiveness — one real bug found and fixed

`Hero.tsx`'s content wrapper used a **fixed height**
(`h-[26rem] sm:h-[30rem]`), sized for desktop's 2-3 line headline. On
mobile, the same headline wraps to 4-5 lines, overflowing the fixed box —
since `TileGridBackground` (the hero's animated background) uses
`absolute inset-0` relative to that same box, the *next* section
(`Earn credit. Risk less.`) started exactly where the fixed height ended,
visually overlapping the overflowed subhead and both CTA buttons
("Get Started"/"See how it works") on every phone size tested (iPhone SE
through 16 Pro Max, Pixel 7 — only the tablet-width Nest Hub Max was
unaffected, since it hits the desktop breakpoint). Fixed by changing
`h-` to `min-h-` — grows on mobile, visually identical on desktop since
content already fit within the minimum there. Confirmed fixed via
DevTools emulation AND a real phone against the live Vercel deploy.

## Known, accepted risks (carried over, still true)

- **`npm audit`: 24 vulnerabilities (22 moderate, 2 high)**, all in
  transitive dependencies of RainbowKit's wallet-connector code. Verified
  `npm audit fix` (non-forced) resolves zero of them — every fix path
  needs `--force`, bumping `wagmi` 2.x→3.x, which RainbowKit 2.2.11 may
  not support. Documented conscious tradeoff, not an oversight — see
  `docs/HANDOFFphase4.md` for the original reasoning, still valid.
- `gsap`, `lenis`, `@react-three/drei`, `@react-three/fiber`, `three` are
  still listed in `frontend/package.json` even though the 3D/GSAP tower
  was fully removed in Phase 4. Unused bundle weight — safe to prune
  later, not urgent.

## How Angel wants to work (unchanged, still applies)

- Bugs delivered as direct corrected files, not explained first.
- Syntax/typecheck (`tsc --noEmit` / `python3 -m py_compile`) before any
  file is delivered.
- `python3 << 'PYEOF'` heredocs for file writes with special characters —
  never bash heredocs for this.
- Terminal commands copy-pasteable one at a time, with checkpoints between
  major steps.
- Every delivered file's destination repo path stated explicitly, every
  time, as a table.
- Ask before major, expensive-to-reverse decisions rather than guessing —
  this is exactly why the payer/payee/lending-model question got paused
  and clarified before more code was written, rather than guessed at.
- `HANDOFF.md` at session end for seamless resumption — this file.

## Where everything lives (unchanged from HANDOFFphase4.md, still accurate)

See `docs/HANDOFFphase4.md`'s "Where everything lives" section for the
full frontend file tree — nothing moved, only `lib/wagmi.ts` and
`components/sections/Hero.tsx` changed content (not location) this
session, and the new files listed under "Not yet built" above don't
exist yet.
