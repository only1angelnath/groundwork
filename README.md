# Groundwork

**Credit built from what's real.**

Undercollateralized micro-credit on Creditcoin: real-world bill payments —
either attested automatically on Ethereum Sepolia via the Attestcoin
Protocol, or uploaded manually and reviewed by a validator — progressively
lower the collateral ratio required to borrow on Creditcoin, built for
someone with zero crypto capital but a provable payment history.

Built for BUIDL CTC 2026 Fall (Attestcoin Protocol theme), DeFi track.

## Why

Overcollateralized DeFi lending is out of reach for most people who
actually need credit, because it requires capital you don't have in the
first place. Groundwork replaces the collateral requirement with either a
trustless, cryptographically verified real-world payment history, or a
manually-reviewed one when the payment can't be made on-chain.

## How it works

Two paths, both writing to the same `CreditVault`:

**Automated (Sepolia attestation):**
1. Pay a bill on Sepolia (`contracts/src/BillPay.sol`).
2. A Python worker (`worker/`) detects the event, waits for attestation,
   and submits the proof to Creditcoin via the Attestcoin Protocol.
3. `GroundworkASC.sol` verifies the proof; `CreditVault.sol` records the
   payment and lowers the caller's required collateral ratio.

**Manual (upload + validator review):**
1. Upload a bill document and claim an amount at `/upload` — pay a small
   review fee.
2. A validator reviews the document at `/validator` and approves or
   rejects it on-chain via `BillValidator.sol`.
3. Approval records the payment on `CreditVault.sol` (same effect as the
   automated path) and mints a non-transferable `SoulboundBillRecord.sol`
   receipt.

Once the threshold is crossed either way, the user can `borrow()`
directly — the relayer/validator never touches their borrowed funds,
only the proof or the review decision.

See `docs/attestcoin-integration.md` for the full technical breakdown of
the Attestcoin Protocol integration (required submission document), and
`docs/HANDOFFphase7.md` for the current, detailed state of the project.

## Repo layout

```
contracts/   Foundry project — BillPay.sol (Sepolia); GroundworkASC.sol,
             CreditVault.sol, BillValidator.sol, SoulboundBillRecord.sol (Creditcoin)
worker/      Python attestation worker (Render Cron Job)
backend/     FastAPI (Render Web Service) — SIWE auth, bill upload/review routes
frontend/    Next.js (Vercel)
shared/abis/ Generated contract ABIs, single source of truth across worker/backend/frontend
docs/        Technical documentation and demo script
```

## Local development

Each subproject has its own `.env.example` — copy to `.env` and fill in
before running.

```bash
# contracts
cd contracts && forge build && forge test

# worker
cd worker && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# backend
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload

# frontend
cd frontend && npm install && npm run dev
```

## Status

Both credit-building paths are live end-to-end on real testnets: the
automated Sepolia-attestation flow, and the manual upload + validator
review flow. **See `docs/HANDOFFphase7.md` for the current state and
open items** — a mocked KYC form and a finished demo script are the main
remaining pieces before submission.

## Deployment

| Component | Platform |
|---|---|
| `contracts/` | Sepolia + Creditcoin CC3 Testnet |
| `worker/` | Render (Cron Job, every 1 min) |
| `backend/` | Render (Web Service) — https://groundwork-web-service.onrender.com |
| `frontend/` | Vercel — https://groundwork-defi.vercel.app |
| Database/Auth/Realtime/Storage | Supabase |
