# Architecture

This describes the system as actually built and deployed — not the
original plan (an earlier design used a 3D scroll-driven frontend and a
different database schema; both were fully replaced during development
and are not reflected here). For the frontend's visual design system
specifically, see [`design-system.md`](design-system.md). For the
Attestcoin Protocol integration specifically, see
[`attestcoin-integration.md`](attestcoin-integration.md).

## Overview

Four independent subprojects, deployed separately, sharing one set of
contract ABIs as the single source of truth between them:

```
groundwork/
├── contracts/     Foundry — BillPay, GroundworkASC, CreditVault,
│                  BillValidator, SoulboundBillRecord
├── worker/        Python — Sepolia event listener + Attestcoin proof
│                  submission (Render Cron Job)
├── backend/       FastAPI — SIWE auth, dashboard reads, bill/KYC
│                  upload + validator review, notifications (Render)
├── frontend/      Next.js — wallet connect, dashboard, upload/KYC/
│                  borrow/validator pages (Vercel)
└── shared/abis/   Generated contract ABIs, imported by worker and
                   backend directly; frontend inlines the small subset
                   it actually calls (see frontend/lib/abis.ts)
```

## Two credit-building paths, one contract

Both paths ultimately call the same function —
`CreditVault.recordVerifiedPayment` — so the vault doesn't care which
path produced a verified payment, only that one did.

### Automated path (cryptographically verified)

```
Wallet ──payBill()──▶ BillPay.sol (Sepolia)
                              │ emits BillPaid
                              ▼
                        Worker (Render Cron Job)
                              │ fetches Attestcoin Protocol proof
                              ▼
                     GroundworkASC.sol (Creditcoin)
                              │ verifies via Block Prover Precompile,
                              │ extracts BillPaid from verified tx bytes
                              ▼
                     CreditVault.recordVerifiedPayment
                              │
                              ▼
                  Worker writes score_history (Supabase)
                              │
                              ▼
                  Frontend (Supabase Realtime subscription)
```

The worker never touches the user's funds — it only ever submits a
*proof*. `borrow()`/`repay()` are always signed directly by the
borrower's own wallet.

### Manual path (validator-reviewed)

```
Wallet ──submitBill()──▶ BillValidator.sol (Creditcoin, on-chain)
   │                              │
   │ uploads document              │ pays a small review fee
   ▼                              ▼
Backend ──▶ Supabase Storage    (pending)
                                    │
                     Validator reviews on /validator
                                    │
                      approveBill() / rejectBill()
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
     CreditVault.recordVerifiedPayment    SoulboundBillRecord.mint
     (same function as the automated path)  (non-transferable receipt)
                    │
                    ▼
       Notification (in-app via Supabase Realtime,
                      Telegram push to the validator)
```

Both KYC and bill review outcomes push a notification to the submitting
wallet (in-app, via a Supabase Realtime-backed bell) and to the
validator (Telegram), so nobody has to poll `/validator` manually.

## Collateral step-down: tiered, not flat

`CreditVault.recordVerifiedPayment` looks up an amount-tiered step-down
rather than applying a flat rate — a larger verified payment earns a
bigger one-time cut to the required collateral ratio (300% starting,
110% floor). Full tier table, the reasoning behind it, and a real
cross-currency constraint this surfaced between the two recorder paths
(Sepolia ETH-wei vs. tCTC-wei converted from a real-world amount): see
[`collateral-tiers.md`](collateral-tiers.md).

## Identity gate

Both paths sit behind a KYC step — collects the fields a real provider
would, reviewed by the same validator (not auto-approved), but performs
no actual identity verification. Clearly labeled as simulated everywhere
it's shown in the product. This was a deliberate choice over a real
third-party KYC integration, which was ruled out on cost grounds for a
zero-budget hackathon project rather than skipped silently.

## Database (Supabase Postgres)

- **`bill_events`** — automated-path payment records, written by the
  worker with a service-role key.
- **`score_history`** — time-series of score/collateral-ratio changes,
  written by the worker, read live by the frontend via Realtime.
- **`bill_submissions`** — manual-path upload metadata (storage path,
  document hash), service-role only.
- **`kyc_submissions`** — KYC form data + document path, status, review
  outcome, service-role only.
- **`notifications`** — in-app notification rows, anon-SELECT RLS
  (mirrors data that's already effectively public via on-chain state).
- **`worker_state`** — the worker's scan cursor, since Render Cron Jobs
  have no persistent disk between runs.

RLS policy: service-role bypasses it entirely (worker, backend writes);
anonymous/JWT-scoped reads are limited to what's already publicly
readable on-chain (`score_history`, `bill_events`) or explicitly
per-wallet (`notifications`). `bill_submissions` and `kyc_submissions`
have no public policies at all — only the backend's service-role client
touches them.

## Backend API (FastAPI)

```
POST /api/auth/nonce, /api/auth/verify      — SIWE
GET  /api/dashboard/{wallet}                — score, ratio, loan status
GET  /api/score-history/{wallet}            — time series
POST /api/bills/{bill_id}/upload            — manual-path document upload
GET  /api/bills/mine                        — caller's own submissions
GET  /api/validator/all-bills               — validator-only
GET  /api/kyc/status/{wallet}               — public, no auth
POST /api/kyc/submit                        — SIWE required
GET  /api/kyc/validator/all-submissions     — validator-only
POST /api/kyc/validator/{wallet}/review     — validator-only
POST /api/notifications/bill-reviewed       — re-reads the bill on-chain
                                                before writing, so it
                                                can't be spoofed
```

Upload validation (content-type allowlist, size cap, server-generated
storage paths — never a client-supplied filename) is shared between the
bill and KYC upload routes via `backend/uploads.py`.

## Frontend (Next.js)

Key pages: `/` (marketing), `/dashboard` (score, payment history, SBT
receipts), `/upload` (manual-path submission), `/kyc` (identity gate),
`/borrow` (collateral/loan), `/validator` (review queue, validator-only).

Score/collateral-ratio reads go straight to `CreditVault` via wagmi, not
through the backend — the contract is the actual source of truth and
this keeps the dashboard accurate even if the backend/worker are
momentarily behind. Live updates come from Supabase Realtime
subscriptions on `score_history`, not polling.

## Deployment

| Component | Platform | Why |
|---|---|---|
| Frontend | Vercel | native Next.js support |
| Backend | Render (Web Service) | persistent web process for FastAPI |
| Worker | Render (Cron Job, `--once` per run) | no free-tier Background Worker; Cron Jobs bill per actual runtime |
| Database / Auth / Realtime / Storage | Supabase | one service covers all four |
| `BillPay.sol` | Ethereum Sepolia | required source chain for the Attestcoin Protocol |
| Everything else on-chain | Creditcoin CC3 Testnet | required by submission rules |
