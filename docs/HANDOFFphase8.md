# Groundwork — Handoff (end of Phase 8 session)

Read this first in a new chat. This supersedes `docs/HANDOFFphase7.md` and
everything before it — that history is still accurate but this file is
the current source of truth. Submission deadline: **September 13, 2026,
06:00**.

## What this project is

**Groundwork** — undercollateralized micro-credit on Creditcoin, built for
the BUIDL CTC 2026 Fall hackathon (Attestcoin Protocol theme, DeFi track).
Real-world bill payments, attested on Ethereum Sepolia via the Attestcoin
Protocol, progressively lower the collateral ratio required to borrow on
Creditcoin. A second, fully manual path (upload a bill, pay a small fee,
a permissioned validator approves/rejects) exists alongside the automated
one. As of this session, **both paths are now gated behind a mocked KYC
step that also requires the same validator's approval**, and both KYC and
bill review outcomes push a notification to the user (in-app) and to the
validator (Telegram).

## READ THIS FIRST — where things stand right now

The **entire stack is live and working end-to-end**, including everything
built this session:

- Automated path: pay bill on Sepolia → worker attests → score updates →
  borrow/repay. Unchanged since Phase 7.
- Manual path: `/upload` → `BillValidator.submitBill` (on-chain) → doc
  upload to Supabase → validator reviews on `/validator` → approve/reject
  on-chain → **notification fires** (new this session).
- **KYC gate (new this session, in two iterations):** `/kyc` → SIWE
  sign-in → form + ID document upload → submitted as `pending` → the same
  validator reviews it on `/validator` (a plain backend call, not
  on-chain — KYC has no smart contract behind it) → approve sets
  `status='approved'`, unlocking `/upload` and `/borrow`; reject sets
  `status='rejected'` with a reason and a resubmit path. **KYC originally
  auto-verified on submit — this was deliberately changed mid-session to
  require validator approval, matching the honesty bar the rest of the
  mocked flow holds itself to.**
- **In-app notifications (new this session):** a bell icon in `Nav`,
  visible whenever a wallet is connected, showing KYC/bill review
  outcomes for that wallet specifically. Backed by Supabase Realtime, not
  a backend endpoint.
- **Telegram push to the validator (new this session):** fires on every
  new bill upload and every new KYC submission, so the validator doesn't
  have to keep `/validator` open polling. Best-effort — never blocks the
  actual submission if it fails.
- **A real mobile-responsiveness pass (new this session):** several
  concrete overflow/clipping bugs found and fixed — see "Mobile
  responsiveness" section below.

Not yet done: `docs/demo-script.md` (still a stub from Phase 5), a full
end-to-end dry run covering everything built this session, and the
README/submission form. See "Next: before Sept 13" at the bottom.

## Deployed contract addresses (unchanged this session)

Same as `HANDOFFphase7.md` / `docs/attestcoin-integration.md` — no
contracts were touched this session. KYC has **no on-chain component at
all**; it's Supabase + backend only. Quick reference:

| Contract | Chain | Address |
|---|---|---|
| `BillPay.sol` | Ethereum Sepolia | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `CreditVault.sol` (v3) | Creditcoin CC3 Testnet | `0xe5233ee60688A151AB47F788E164eA9BB013AB05` |
| `GroundworkASC.sol` (redeployed) | Creditcoin CC3 Testnet | `0x182F1DbfE77784bC2f575233829A253c4bCC7D16` |
| `BillValidator.sol` | Creditcoin CC3 Testnet | `0x63E11DFA6E0141d52ceB0Bac88B41aAf273e9c28` |
| `SoulboundBillRecord.sol` | Creditcoin CC3 Testnet | `0x19B9BC1905Fba793A4ff469262B2626fd74c6F6f` |

Validator wallet (also used for KYC review): `0xeb190150aD31C3578511F2Cc552A730930Ef5493`
Relayer wallet (worker): `0x82678967EAf1c7492e3C7F3CCD584ce8dCEb7b16`

## New/changed files this session, with exact destinations

### Database (Supabase — run these in order via the SQL editor; CLI isn't set up in this environment)

| Migration | What it does |
|---|---|
| `supabase/migrations/0008_kyc_submissions.sql` | Creates `kyc_submissions` table, service-role-only access |
| `supabase/migrations/0009_kyc_documents.sql` | Swaps a typed ID number for an uploaded document; adds private `kyc-documents` storage bucket |
| `supabase/migrations/0010_kyc_validator_review.sql` | Adds `status`/`reviewed_at`/`rejection_reason` columns; grandfathers pre-existing auto-verified rows to `approved` |
| `supabase/migrations/0011_notifications.sql` | Creates `notifications` table, anon-SELECT RLS (same pattern as `score_history`/`bill_events` — see reasoning in the file itself) |

### Backend (`backend/`)

| File | Status | Purpose |
|---|---|---|
| `routers/kyc.py` | new | `GET /api/kyc/status/{wallet}` (public), `POST /api/kyc/submit` (SIWE, multipart), `GET /api/kyc/validator/all-submissions` (validator-only), `POST /api/kyc/validator/{wallet}/review` (validator-only) |
| `notifications.py` | new | `create_notification()` helper — writes only, reads happen via Supabase directly from the frontend |
| `routers/notifications.py` | new | `POST /api/notifications/bill-reviewed` — frontend calls this *after* an on-chain bill approve/reject confirms, since the backend never sees that tx directly; re-reads the bill from-chain before writing, so it can't be spoofed |
| `telegram_notify.py` | new | `notify_validator()` — plain Bot API POST, fails silently if env vars unset |
| `routers/bills.py` | edited | `upload_bill_document` now calls `notify_validator()` after a successful upload |
| `main.py` | edited | wires in `kyc` and `notifications` routers |
| `requirements.txt` | edited | added explicit `requests==2.34.2` (was already resolved transitively via `web3`, now pinned directly since `telegram_notify.py` imports it) |

**New env vars needed on Render:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_VALIDATOR_CHAT_ID`, `PUBLIC_FRONTEND_URL` (used to build the `/validator` link in Telegram messages). Setup steps for getting a bot token/chat ID are documented in `telegram_notify.py`'s own docstring.

### Frontend (`frontend/`)

| File | Status | Purpose |
|---|---|---|
| `app/kyc/page.tsx` | new | The KYC form — SIWE sign-in, name/DOB/country/ID-type + ID-document upload, shows pending/approved/rejected state if already submitted |
| `components/KycGate.tsx` | new | Wraps `/upload` and `/borrow`'s real content; shows one of four states (none/pending/approved/rejected) based on `useKycStatus` |
| `lib/useKycStatus.ts` | new | Public no-auth hook: `GET /api/kyc/status/{wallet}` |
| `components/NotificationBell.tsx` | new | Bell in `Nav`; reads + subscribes directly via Supabase (anon key + Realtime), not the backend. Unread state is a client-side `localStorage` timestamp, not a real read/unread column |
| `components/sections/Nav.tsx` | edited | Added the bell; tightened mobile padding/sizing to compensate |
| `app/upload/page.tsx` | edited | Wrapped in `<KycGate>` |
| `app/borrow/page.tsx` | edited | Wrapped in `<KycGate>` |
| `app/validator/page.tsx` | edited | Added a full second section ("Identity verification") below the existing bills section — same pending/history pattern, but KYC approve/reject is a **plain backend call**, not an on-chain tx, and fires the bill-reviewed-style notification via `create_notification` server-side directly |
| `components/sections/Resolution.tsx` | edited | Mobile fix — Roadmap's "today → next" line no longer force-nowraps into a silently-clipped overflow |
| `components/sections/PaymentHistory.tsx` | edited | Mobile fix — rows stack vertically below `sm:` instead of packing label+date and status+links into one tight row |
| `components/sections/Hero.tsx` | edited | Fixed a dead `#connect` anchor (stale since Phase 6 moved wallet-connect to `/dashboard`) — primary CTA now `Link`s to `/dashboard` |

## Real bugs hit and fixed this session (don't rediscover these)

1. **Two files got committed under their literal download filenames instead of their destination paths** — `backend/notifications.py` and `backend/routers/notifications.py` were briefly `backend/notifications_helper.py` and `backend/routers/notifications_router.py` in a real push, which crashed Render with `ModuleNotFoundError`/`ImportError` since `main.py`/`kyc.py` import them by their *intended* names. Fixed by renaming correctly. **Lesson: always verify destination filenames match import statements before pushing, especially when a batch of files shares a similar base name (`notifications.py` the helper vs. `notifications.py` the router, in different directories).**
2. **`backend/venv/` (2900+ files, ~22MB) got fully committed** in an earlier push because a `.gitignore` fix was written but never actually applied before `push.sh` ran with `git add -A`. Fixed by `git rm -r --cached backend/venv` + confirming `.gitignore` covers `venv/` and `backend/venv/`. It's gone from the latest commit but still sits in git history — not worth rewriting history for mid-hackathon, just be aware `.git` is permanently ~22MB heavier.
3. **`NEXT_PUBLIC_API_URL` pointing at production Render while testing locally** produced a plain `{"detail":"Not Found"}` that looked like a backend bug but was just hitting a deployed backend that didn't have the new routes yet. Lesson: when a route "doesn't exist" unexpectedly, check which backend the frontend is actually configured to hit before assuming the code is wrong.
4. **`NotificationBell`'s dropdown overflowed on mobile even after capping its width.** Root cause: `absolute right-0` anchors to the *bell's own position*, not the viewport edge — capping width alone can't fix a positioning-origin problem if the anchor point itself isn't at the true screen edge. Real fix: `fixed inset-x-4 top-20` on mobile (viewport-anchored), reverting to the original bell-relative `absolute` dropdown at `sm:` and up.
5. **A wallet-switch data flash** — switching wallets without disconnecting could briefly show the *previous* wallet's notifications before the new fetch resolved. Fixed by clearing state immediately on address change plus a `cancelled` guard against a late-arriving response for an address the user has since switched away from.
6. **Notification dropdown only closed by clicking the bell again** — added a `mousedown` listener (only while open) that closes on any click outside a `ref`-tracked container.
7. **Several wallet addresses displayed inline in `flex justify-between` rows with no `truncate`/`min-w-0`/`shrink-0`** in `/validator` — a 42-character unbroken string in a flex row **will** overflow a phone-width card, not just "might." Fixed four spots. General lesson for any future page showing addresses: always pair a long unbroken string with `truncate` + `min-w-0` inside a flex container, and `shrink-0` on its sibling.

## Mobile responsiveness — current state

A genuine code-level audit was done this session (not a visual/screenshot pass — Claude's sandbox network can't reach the live `*.vercel.app` domain; only package registries and GitHub are allow-listed). Confirmed safe with no changes needed: `Hero`, `Benefits`, `Features`, `FAQ`, `Footer`, `HowItWorks`, `Dashboard`, the decorative blob backgrounds (`BrandMotion`, `TileGridBackground`, the layout-level blob layer — all properly `overflow-hidden`-contained), and `/kyc`/`/upload`/`/borrow`'s core forms (already flex-col-first from how they were originally built).

**`Context.tsx`, `Climax.tsx`, `FeatureVerify.tsx`, `FeatureStepDown.tsx` are confirmed dead code** — not imported anywhere in `page.tsx`, despite `design-system.md` §6 referencing their retirement. Don't spend time auditing or updating them; they can be deleted whenever someone wants to clean up, but doing so wasn't in scope this session.

**Still not done:** an actual real-device or DevTools-emulated visual check of any of this session's fixes. Angel confirmed the earlier round of fixes worked visually; the deeper pass (Resolution, PaymentHistory, Hero) has been code-reviewed and syntax-checked (via `esbuild` parse, not a real browser) but not yet eyeballed. Do that before assuming it's fully done.

## Known, working gotchas carried over from earlier phases (still true, still apply)

Everything in `HANDOFFphase6.md`'s "Known, working gotchas" section is unchanged — `PRIVATE_KEY` not `DEPLOYER_PRIVATE_KEY`, `forge create --broadcast` ordering, `forge script`'s `prevrandao` panic on Creditcoin, bare-ABI-array requirement for `shared/abis/*.json`, lowercased `wallet_address` everywhere, separate Render vs. local env vars, `vercel env rm` before `vercel env add` on an existing var, never a private key in `NEXT_PUBLIC_*`, and no Supabase CLI in this environment (paste raw SQL into the dashboard instead).

## How Angel wants to work (unchanged, still applies)

- Thorough concept explanations before syntax/code.
- Bugs delivered as direct corrected files, not explained first, once a root cause is found.
- Diagnostic output before fixes, verification commands after every change.
- Individual files handed over directly with the exact repo destination path stated as a table, every time — never zip archives.
- A git script for pushing (`push.sh` at repo root) with clear instructions on where to push. **Always run `git status --short` and actually read it before committing** — this session had two real incidents (venv, misnamed files) that a careful read of `git status` before commit would have caught immediately.
- Public GitHub repos for all meaningful work.
- Ask before major, expensive-to-reverse decisions rather than guessing (this is why KYC's auto-verify-vs-validator-review question got raised and changed mid-session rather than assumed either way from the start).

## Next: before Sept 13, 06:00 (priority order)

1. **A full end-to-end dry run**, start to finish, from a couple of fresh wallets, covering: automated Sepolia path, manual upload path, KYC gate (submit → validator review → notification), and the Telegram push. This hasn't been done once since everything in this session landed together — this is where gaps between phases actually surface, per `build-roadmap.md`'s own testing strategy.
2. **`docs/demo-script.md`** — still a stub. Needs to cover both credit-building paths plus the new KYC gate, timed against the real thing (target under 3 minutes per the original spec), written *after* the dry run above so it reflects reality rather than the plan.
3. **A real visual mobile check** — DevTools device emulation at minimum, a real phone ideally — of this session's mobile fixes (bell, Resolution, PaymentHistory, Hero's CTA). Code-reviewed and syntax-checked, not yet eyeballed.
4. **README / submission form** — not yet finalized.
5. Optional, lower priority: delete the confirmed-dead `Context.tsx`/`Climax.tsx`/`FeatureVerify.tsx`/`FeatureStepDown.tsx` files as repo cleanup; git history still carries the 22MB `venv` blob if anyone ever wants to rewrite history (not urgent).
