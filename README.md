# Groundwork

**Credit built from what's real.**

Undercollateralized micro-credit on Creditcoin: attested real-world bill
payments on Ethereum Sepolia, verified via the Attestcoin Protocol,
progressively lower the collateral ratio required to borrow on Creditcoin —
built for someone with zero crypto capital but a provable payment history.

Built for BUIDL CTC 2026 Fall (Attestcoin Protocol theme), DeFi track.

## Why

Overcollateralized DeFi lending is out of reach for most people who
actually need credit, because it requires capital you don't have in the
first place. Groundwork replaces the collateral requirement with a
trustless, cryptographically verified real-world payment history instead.

## How it works

1. Pay a bill on Sepolia (`contracts/src/BillPay.sol`).
2. A Python worker (`worker/`) detects the event, waits for attestation,
   and submits the proof to Creditcoin via the Attestcoin Protocol.
3. `GroundworkASC.sol` verifies the proof; `CreditVault.sol` records the
   payment and lowers the caller's required collateral ratio.
4. Once the threshold is crossed, the user can `borrow()` directly —
   the relayer never touches their funds, only the proof.

See `docs/attestcoin-integration.md` for the full technical breakdown of
the Attestcoin Protocol integration (required submission document).

## Repo layout

```
contracts/   Foundry project — BillPay.sol (Sepolia), GroundworkASC.sol + CreditVault.sol (Creditcoin)
worker/      Python readability worker (Render background service)
backend/     FastAPI (Render web service)
frontend/    Next.js + React Three Fiber (Vercel)
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

Phase 0 (repo scaffold, toolchain verified) complete. See
`docs/build-roadmap.md` for the full phase-by-phase plan.

## Deployment

| Component | Platform |
|---|---|
| `contracts/` | Sepolia + Creditcoin CC3 Testnet |
| `worker/` | Render (Background Worker) |
| `backend/` | Render (Web Service) |
| `frontend/` | Vercel |
| Database/Auth/Realtime | Supabase |
# groundwork
