# Groundwork

**Undercollateralized micro-credit on Creditcoin — built for BUIDL CTC 2026 Fall (Attestcoin Protocol theme, DeFi track).**

Overcollateralized lending is unusable for the people who need credit
most — you need existing crypto capital to borrow more of it. Groundwork
inverts that: verified real-world bill payments progressively lower how
much collateral you need to borrow, from 300% down to a 110% floor.

🔗 **Live app:** https://groundwork-defi.vercel.app

---

## The problem

Undercollateralized lending needs a credit signal, and on-chain history
alone doesn't give you one if you're new to crypto. Off-chain credit
data doesn't transfer either. People with a genuine, provable payment
history — rent, utilities, any recurring bill — have no way to turn that
into on-chain trust.

## How Groundwork solves it

Two independent paths build the same credit signal, meeting at one
contract:

### 1. Automated path — cryptographically verified

1. Pay a bill on Ethereum Sepolia (`BillPay.payBill`) — emits a
   `BillPaid` event.
2. A Python worker picks up the event, waits for the
   [Attestcoin Protocol](https://creditcoin.org)'s attestation window,
   and fetches a real inclusion proof from the Attestcoin Prover.
3. The proof is submitted to `GroundworkASC` on Creditcoin CC3 Testnet,
   verified on-chain via the Block Prover Precompile, and the verified
   payment is recorded.
4. `CreditVault` steps the payer's required collateral ratio down —
   **no human in the loop, no self-reported data, cryptographically
   proven.**

### 2. Manual path — for bills that can't be paid on-chain

Rent, utilities, anything without a crypto-native payment rail:

1. Upload proof of payment, pay a small review fee, submit a claimed
   amount (`BillValidator.submitBill`).
2. A permissioned validator reviews the document and approves or
   rejects it on-chain.
3. On approval: the same `CreditVault` step-down applies, **and** a
   permanent, non-transferable ERC-721 (`SoulboundBillRecord`) is minted
   as an on-chain receipt.

### The credit mechanic

Every verified payment — either path — reduces the required collateral
ratio, **tiered by the payment's real size** rather than a flat rate: a
$100+ bill earns a bigger one-time cut than a $1 one. Ratio steps from
300% down to a 110% floor. See
[`docs/collateral-tiers.md`](docs/collateral-tiers.md)
for the full tier table and the reasoning behind it (including a real
cross-currency constraint between the two paths — Sepolia ETH vs.
tCTC-converted amounts — that shaped the design).

Once collateral is unlocked at a lower ratio, borrow directly against it
(`CreditVault.borrow`), and repay to reclaim collateral
(`CreditVault.repay`).

## What's real, and what's honestly simulated

We'd rather be specific than let a judge assume something works that
doesn't:

| | Status |
|---|---|
| Sepolia bill payments, Attestcoin Protocol proof generation and on-chain verification | **Real.** Proven repeatedly end-to-end on real testnets — see `docs/attestcoin-integration.md` for tx hashes. |
| Creditcoin CC3 Testnet deployment, collateral math, borrow/repay | **Real.** Live contracts, real transactions. |
| The manual validator review | **Real approval logic, single permissioned validator** — not a decentralized staking/slashing system. That's an explicit v2-roadmap item, not an oversight; doing it properly needs real economic design, not a rushed hackathon version. |
| Identity verification (KYC) | **Simulated, clearly labeled everywhere it appears.** Collects the fields a real provider would, gated by the same validator's approval (not auto-verified), but performs no actual identity check. We considered a free-tier real KYC provider and ruled it out (cost, scope) rather than fake it silently. |
| The lending pool | **Real liquidity, manually funded** — not a real multi-depositor pool with shares/yield. Anyone can send funds to it; there's no depositor accounting. Honest limitation, not hidden. |
| The Soulbound receipt NFT | **Real, minted on-chain**, currently a pure proof-of-verification artifact with no additional protocol effect (no loan-size bonus, etc.) — a deliberate scope decision, not a missing feature. |

## Architecture

Full breakdown (data flow for both paths, database schema, API routes,
deployment mapping): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Short version:

```
groundwork/
├── contracts/     Foundry — BillPay (Sepolia), GroundworkASC,
│                  CreditVault, BillValidator, SoulboundBillRecord
│                  (all Creditcoin CC3 Testnet)
├── worker/        Python — listens for Sepolia BillPaid events,
│                  fetches Attestcoin proofs, submits them on-chain
├── backend/       FastAPI — SIWE auth, dashboard/score-history reads,
│                  bill/KYC upload + validator review, notifications
├── frontend/      Next.js — wallet connect, dashboard, upload/KYC/
│                  borrow/validator pages
└── shared/abis/   Single source of truth for contract ABIs across
                   worker, backend, and frontend
```

**Data flow, automated path:**
```
Wallet → BillPay.payBill (Sepolia)
       → Worker (listens, fetches proof)
       → GroundworkASC.verifyBillProof (Creditcoin)
       → CreditVault.recordVerifiedPayment
       → Supabase (score_history, via worker)
       → Frontend (Realtime subscription)
```

**Data flow, manual path:**
```
Wallet → BillValidator.submitBill (on-chain) + document upload (Supabase)
       → Validator reviews on /validator
       → BillValidator.approveBill/rejectBill (on-chain)
       → CreditVault.recordVerifiedPayment + SoulboundBillRecord.mint
       → Notification (in-app + Telegram to validator)
```

## Deployed contracts (Creditcoin CC3 Testnet unless noted)

| Contract | Address |
|---|---|
| `BillPay.sol` (Ethereum Sepolia) | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `CreditVault.sol` | `0x7C458Ef4347D95449c021350e9FdCcb548474Bf4` |
| `GroundworkASC.sol` | `0xfc03a3912a8245AEDbb94a9F8459Ce576cfD8675` |
| `BillValidator.sol` | `0xB44C6EB9fd286Ec9dc87ECc23A05b876404D6C94` |
| `SoulboundBillRecord.sol` | `0x19B9BC1905Fba793A4ff469262B2626fd74c6F6f` |

Full deployment history, tx hashes, and technical write-up:
[`docs/attestcoin-integration.md`](docs/attestcoin-integration.md).

## Tech stack

- **Contracts:** Solidity, Foundry
- **Worker:** Python, web3.py
- **Backend:** FastAPI, Supabase (Postgres + Realtime + Storage), SIWE auth
- **Frontend:** Next.js, wagmi/RainbowKit, Tailwind
- **Infra:** Render (worker cron job + backend), Vercel (frontend), Supabase

## Running locally

### Contracts
```bash
cd contracts
forge install
forge test
```

### Worker
```bash
cd worker
pip install -r requirements.txt --break-system-packages
cp .env.example .env   # fill in RPC URLs, relayer key, Supabase creds
python listener.py --once
```

### Backend
```bash
cd backend
pip install -r requirements.txt --break-system-packages
cp .env.example .env   # fill in Supabase creds, contract addresses
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local   # fill in contract addresses, API URL
npm run dev
```

## What we'd build next

- Real staking/slashing for a decentralized set of validators, instead
  of one permissioned address.
- A real multi-depositor lending pool with shares and yield, instead of
  manually-funded liquidity.
- A real KYC integration once budget allows.
- Real-world biller integrations, so "payee" means something to an
  actual landlord or utility company rather than a demo wallet.

## Built by

[AngelNath](https://github.com/only1angelnath)

## License

MIT
