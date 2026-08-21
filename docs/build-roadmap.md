# Groundwork — Build Roadmap & Architecture Finalization

This is the execution plan that turns the previous architecture/design doc into an actual build order — repo structure, tooling choices, phase-by-phase milestones against the Sept 6 deadline, exact interfaces between components, and what gets cut first if time runs short.

---

## 1. Repo structure

One repo, four independent subprojects — each deploys separately (Render/Vercel both support "root directory" per-service), but they live together so contract ABIs and API types never drift out of sync.

```
groundwork/
├── contracts/          # Foundry project
│   ├── src/
│   │   ├── BillPay.sol          (Sepolia)
│   │   ├── GroundworkASC.sol    (Creditcoin)
│   │   └── CreditVault.sol      (Creditcoin)
│   ├── test/            # forge test — unit tests before anything touches a testnet
│   └── script/           # forge script — deploy scripts, one per chain
├── worker/              # Python readability worker (Render bg service)
│   ├── listener.py       # web3.py event filter on Sepolia
│   ├── prover_client.py  # requests-based Prover REST API client
│   ├── submitter.py      # web3.py submission to Creditcoin ASC
│   └── requirements.txt
├── backend/             # FastAPI (Render web service)
│   ├── main.py
│   ├── routers/
│   ├── db.py             # Supabase/Postgres client
│   └── requirements.txt
├── frontend/             # Next.js (Vercel)
│   ├── app/
│   ├── components/tower/  # R3F scene
│   └── package.json
├── shared/
│   └── abis/              # generated ABIs, single source of truth for worker + backend + frontend
└── docs/
    ├── README.md           # submission requirement
    ├── attestcoin-integration.md   # submission requirement: technical doc
    └── demo-script.md
```

**Tooling choice — Foundry over Hardhat:** faster local iteration (`forge test` runs in seconds), `forge script` deploys to both Sepolia and Creditcoin CC3 Testnet from the same repo without a JS build step, and since the ASC/CreditVault contracts are deliberately minimal, you don't need Hardhat's heavier plugin ecosystem. If you're already more comfortable in a JS toolchain this is a fair place to swap to Hardhat instead — flag it now if so, before contracts are scaffolded.

---

## 2. Phase-by-phase build order

Today is Aug 14; submission deadline is Sept 6, 23:59 ET (~23 days). Plan to have a submittable build by Sept 3 and reserve the last 3 days entirely for the demo video, docs, and buffer — not for new code.

### Phase 0 — Setup (Aug 14–15, ~1 day) — ✅ DONE
- Repo scaffolded as above, Foundry initialized, Render/Supabase/Vercel projects created (empty, so env vars and deploy pipelines exist before you need them).
- Sepolia + Creditcoin CC3 Testnet RPC access confirmed, faucet funds pulled for both a deployer key and a separate relayer key (the relayer is what the worker uses — keep it separate from your personal deployer key).
- **Definition of done:** you can `forge test` an empty contract and see a Render "hello world" deploy succeed, before writing any real logic.

### Phase 1 — Contracts (Aug 16–20, ~5 days) — ✅ DONE
- `BillPay.sol` on Sepolia — one function, one event, unit tested.
- `GroundworkASC.sol` — proof verification via the BlockProver precompile. This is the highest-risk, least-familiar piece (Solidity + a precompile you haven't used before) — budget the most slack here, and do a throwaway "verify one proof, print the result" script first before wiring it into `CreditVault`.
- `CreditVault.sol` — score, collateral ratio, `borrow()`.
- Deploy both to their respective testnets, verify manually with `cast call` that a hand-submitted proof updates state correctly, before any Python worker exists to automate it.
- **Definition of done:** you can pay a bill on Sepolia, manually fetch a proof from the Prover REST API with `curl`, manually submit it with `cast send`, and watch the score update on Creditcoin — fully manual, zero automation, but the whole chain proven end-to-end.
- **Result:** genuinely achieved on real testnets, not simulated. Full addresses, tx hashes, and the real gotchas hit along the way (forge script's `prevrandao` panic on this chain, the `forge create --libraries` linking quirk) are in `docs/attestcoin-integration.md`, which is the canonical record — not duplicated here.

### Phase 2 — Worker (Aug 20–24, ~4 days, overlaps Phase 1's tail) — ⬅ NEXT UP
- `listener.py` — replace your manual "watch for the event" step with a real web3.py filter.
- `prover_client.py` — replace the `curl` step with `requests`.
- `submitter.py` — replace the `cast send` step with `web3.py`.
- Deploy to Render as a Background Worker; confirm it survives a restart (re-subscribes, doesn't double-process an event it already handled — idempotency on `sepolia_tx_hash` matters here).
- **Definition of done:** pay a bill on Sepolia and, with zero manual intervention, watch the score update on Creditcoin within the attestation window.

### Phase 3 — Backend + database (Aug 22–26, ~4 days, overlaps Phase 2)
- Supabase schema from the previous plan, RLS policies on from the first migration.
- FastAPI routes (`/api/dashboard`, `/api/score-history`, SIWE auth).
- Wire the worker's writes into the same Supabase project the backend reads from.
- **Definition of done:** the dashboard endpoint returns real data that changes as bills get paid, with no frontend yet — verified with `curl` or a REST client.

### Phase 4 — Frontend (Aug 24 – Sept 1, ~9 days, the longest phase — start as soon as the ABIs and API shapes are stable, don't wait for Phase 3 to fully finish)
- Days 1–2: layout, copy, light/dark section structure, wallet connect — no 3D yet, get the real content and real data flowing through a plain page first.
- Days 3–5: the Tower model (low-poly, Draco-compressed) and the base R3F scene, static, no scroll binding yet.
- Days 6–7: GSAP ScrollTrigger + Lenis wiring, pinned sections, the three-panel horizontal mechanic walkthrough.
- Days 8–9: wire the tower's block count and glow state to real `score_history` data via Supabase Realtime, so the demo shows *actual* on-chain state, not a scripted animation.
- **Definition of done:** the full story-beat sequence plays correctly on desktop and degrades correctly on mobile / with `prefers-reduced-motion`.

### Phase 5 — Integration, polish, submission (Sept 1–6)
- Sept 1–2: full end-to-end dry run, multiple times, from a clean wallet — this is where you'll find the gaps between phases.
- Sept 3: freeze new features. Anything not done by now is cut (see cut list below).
- Sept 4: record the demo video, write `attestcoin-integration.md` (the required technical doc — this is also a scored criterion, don't leave it to the last hour).
- Sept 5: submission form filled out, README finalized, buffer day for anything broken by the video recording process itself.
- Sept 6: submit early in the day, not at 23:59 — gives you slack for an upload failure or a last typo.

---

## 3. Interfaces between components (finalized so every phase can be built against a stable contract)

**Sepolia event → worker:**
```
BillPaid(address indexed payer, address indexed payee, uint256 amount, uint256 timestamp)
```

**Worker → Creditcoin:**
```
GroundworkASC.verifyBillProof(bytes proof) → (address payer, uint256 amount, uint256 timestamp)
CreditVault.recordVerifiedPayment(address payer, uint256 amount, uint256 timestamp)  // ASC-only caller
```

**Worker → Supabase (service-role key, bypasses RLS):**
```
upsert bill_events (sepolia_tx_hash, wallet_address, payee, amount, status)
insert score_history (wallet_address, score, collateral_ratio)
```

**Backend → Frontend:**
```
GET /api/dashboard/{wallet}
→ { score: int, collateral_ratio_bps: int, loan_eligible: bool, recent_bills: [...] }

GET /api/score-history/{wallet}
→ [{ score, collateral_ratio_bps, recorded_at }, ...]   // drives both the chart and the tower's block count
```

**Frontend → Sepolia (direct, via wallet, not through the backend):**
```
BillPay.payBill(payee) — user signs directly, backend never touches this transaction
```

**Frontend → Creditcoin (direct, via wallet):**
```
CreditVault.borrow(amount) — user signs directly; the relayer only ever submitted the proof, never this
```

---

## 4. Sequence flows

**Bill payment → score update (the core loop):**
```
User wallet ──payBill()──▶ Sepolia BillPay.sol ──emits BillPaid──▶ Worker listener
Worker ──waits ~15s attestation window──▶ Prover REST API ──proof──▶ Worker
Worker ──verifyBillProof(proof)──▶ Creditcoin GroundworkASC ──verified──▶ CreditVault.recordVerifiedPayment
CreditVault ──emits ScoreUpdated──▶ (worker also writes directly to Supabase, doesn't rely on indexing the emitted event)
Supabase Realtime ──pushes row──▶ Frontend (tower gains a block, gauge moves)
```

**Loan unlock:**
```
Frontend reads loan_eligible=true from /api/dashboard
User wallet ──borrow(amount)──▶ Creditcoin CreditVault.borrow()  (collateral checked on-chain against current ratio)
CreditVault ──emits LoanUnlocked──▶ Worker or a lightweight indexer writes a `loans` row to Supabase
Frontend ──shows the vault-door-opens climax sequence
```

---

## 5. Testing strategy

- **Contracts:** `forge test` for `CreditVault`'s collateral-ratio math specifically — this is the one piece of business logic where an off-by-one is embarrassing on stage. Test the threshold boundary explicitly (exactly at the floor, one payment short of it).
- **Worker:** run it against a local Anvil fork of Sepolia first, with a mocked Prover API response, before ever pointing it at the real testnet — this catches idempotency and retry bugs cheaply.
- **Backend:** a handful of `pytest` cases against a local Supabase instance (Supabase CLI supports this) — mainly checking RLS actually blocks cross-wallet reads, since that's the one bug class that's embarrassing rather than just broken.
- **Frontend:** manual QA pass on an actual phone (not just Chrome DevTools' mobile emulation — the scroll-experience skill flags iOS momentum scrolling as a specific, real-device-only failure mode), plus a `prefers-reduced-motion` pass.
- **End-to-end:** the Sept 1–2 dry runs above, run from a completely fresh wallet each time, are the real test — automated tests won't catch "the demo doesn't feel convincing."

---

## 6. Cut list, if time runs short (in the order to cut them)

1. Full 3D degrade path for low-end mobile — fall back to a simple static hero image with the same copy, keep the desktop scroll experience intact.
2. The Stripe-style animated gradient/particle background behind the hero — a static gradient is a fine substitute and nobody will notice its absence.
3. Chart visualization of score history beyond the tower itself — the tower *is* the visualization; a separate line chart is nice-to-have, not need-to-have.
4. Multiple demo billers (utility + rent) — cut to one biller type if needed, the mechanic reads identically either way.
5. **Never cut:** the core loop (pay → attest → score updates → unlock), the technical documentation, and the demo video — these are the actual scored submission requirements.

---

## 7. Biggest real risk — resolved in Phase 1

The riskiest unknown in this plan was `GroundworkASC.sol`'s call into the BlockProver precompile — the one piece neither of us had hands-on experience with, and on the critical path for everything downstream. Phase 1's manual proof-of-concept (`curl` + `cast send`, no automation) resolved it: the interface, struct layouts, and precompile address were all confirmed against real published source (`@gluwa/usc-contracts`, `@gluwa/usc-sdk`) rather than guessed, and the full flow — pay a bill, fetch a proof, submit it, watch the score update — was proven on real testnets. See `docs/attestcoin-integration.md` for addresses, tx hashes, and the real engineering gotchas hit along the way.

The next risk worth naming for Phase 2: the Python worker needs to replicate this manual flow unattended (listen for events, wait for attestation, fetch proofs, submit them, handle failures/retries) — same principle applies, budget slack for it rather than assuming the manual-to-automated translation is trivial.

Ready to start Phase 2 whenever you are.
