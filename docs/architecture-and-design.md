# Groundwork — Full Build Plan
### Undercollateralized Micro-Credit, built from real-world proof, on Creditcoin via the Attestcoin Protocol

This plan was built consulting the `3d-web-experience`, `scroll-experience`, `frontend-design`, and `supabase-postgres-best-practices` skills, so the design and system choices below follow their patterns rather than generic defaults. It covers branding first (so architecture and design both serve one story), then system architecture, then the 3D/scroll frontend plan.

---

## 1. Branding

**Name: Groundwork**

The product literally builds a credit foundation from real, verifiable activity — "starting from the ground up" is not a metaphor tacked on afterward, it's the actual mechanic (each attested payment lowers your required collateral, brick by brick, until you can borrow). It also reads well outside crypto — a name a non-crypto judge or a real borrower could say out loud without translation.

**Tagline:** *"Credit built from what's real."*
**Secondary line (for the mechanic, used in-product):** *"Every payment you make, proven. Every proof, a step toward a loan you don't need collateral to unlock."*

**Voice:** plain, structural, unhurried. No hype words ("revolutionary," "disrupting"), no crypto-insider jargon in user-facing copy — "verified" not "attested" in the UI (save "attested" for the technical/README layer), "proof" not "cryptographic commitment." Per the frontend-design skill's writing guidance: name things by what the user controls, not by how the system is built. A user "pays a bill and proves it," not "triggers a cross-chain oracle attestation."

**Visual identity — token system**

*Color (named, not generic):*
| Token | Hex | Use |
|---|---|---|
| `concrete-50` | `#F2F3F1` | Primary light background — cool, poured-concrete gray, deliberately *not* warm cream |
| `concrete-900` | `#14171C` | Dark "vault" section background — charcoal with a cool blue undertone, not pure black |
| `rebar-700` | `#3A4048` | Structural lines, dividers, the tower's steel elements |
| `brass-500` | `#C08A2E` | Primary accent — construction-signage brass/ochre, warmer and more yellow than the cliché terracotta |
| `clay-600` | `#B54A34` | Secondary accent, used sparingly for risk/collateral-ratio callouts only |
| `paper-100` | `#FBFAF7` | Card surfaces on light sections |

*Type (two roles, deliberately structural):*
- **Display:** a bold geometric slab serif (e.g. Roboto Slab / Zilla Slab, bold weights only) — slab serifs read as *built*, blueprint-like, load-bearing. Used large, tight tracking, for headlines only.
- **Body:** a clean grotesk sans (Inter or General Sans) for all reading copy — no personality competition with the display face.
- **Data/mono:** JetBrains Mono for anything that's real verified data — wallet addresses, tx hashes, the live score number, collateral ratios. Putting real data in monospace visually separates "marketing copy" from "provable fact" throughout the page, which matters a lot for a trust product.

*Layout concept:* alternating light (`concrete-50`) and dark (`concrete-900`) full-viewport sections — light sections are "the real world" (paying a bill, a home, a shipment), dark sections are "the vault" (attestation, the chain, the unlock). The alternation itself carries meaning instead of being decorative.

*Signature element:* a single custom 3D object — the **Groundwork Tower**, a modular scaffold/rebar structure that visibly gains a block every time the scroll-story reaches a "verified payment" beat, with its structural lines lighting up brass-gold as each block attests, culminating in a vault door at the top opening to reveal the unlocked loan. This is the one aesthetic risk worth spending on — everything else on the page stays quiet so this object reads as the memorable thing.

---

## 2. System Architecture

```
┌─────────────────────┐      pays bill (wagmi tx)     ┌──────────────────────┐
│   Next.js Frontend   │ ─────────────────────────────▶│  Sepolia: BillPay.sol │
│   (Vercel)           │                                │  emits BillPaid(...)  │
│                       │◀───── reads dashboard data ───┤                       │
└──────────┬────────────┘                                └───────────┬──────────┘
           │                                                          │ event picked up
           │ REST (FastAPI)                                          ▼
           │                                              ┌───────────────────────┐
           │                                              │ Python Readability     │
           │                                              │ Worker (Render bg svc) │
           │                                              │ web3.py listener       │
           │                                              │ → Prover REST API      │
           │                                              │ → submits proof        │
           │                                              └───────────┬────────────┘
           │                                                          │ verified proof
           ▼                                                          ▼
┌──────────────────────┐   writes score/history   ┌──────────────────────────────┐
│  FastAPI (Render)     │◀─────────────────────────┤ Creditcoin CC3 Testnet        │
│  reads/writes         │                           │ GroundworkASC.sol             │
└──────────┬─────────────┘                          │ CreditVault.sol                │
           │                                        │ (verifies via BlockProver      │
           ▼                                        │  precompile, updates score,    │
┌──────────────────────┐                            │  gates borrow())               │
│ Supabase Postgres     │                            └──────────────────────────────┘
│ (+ Auth via SIWE,      │
│  + Realtime)           │
└──────────────────────┘
```

**Why this shape, given the deployment tools available:** the Sepolia event listener has to be a long-running process (it holds an open filter/subscription), which fits Render's Background Worker service type — not Supabase Edge Functions, which are short-lived and better suited to the request/response FastAPI-adjacent work. Supabase's Postgres + Realtime does double duty: it's both the read cache for the dashboard (so the frontend never waits on a live RPC call) and the mechanism that pushes "your score just updated" to the frontend live, which is what makes the 3D tower feel alive during a demo instead of requiring a manual refresh.

---

## 3. System Design

### 3.1 Contracts

**Sepolia — `BillPay.sol`**
```solidity
function payBill(address payee) external payable;
event BillPaid(address indexed payer, address indexed payee, uint256 amount, uint256 timestamp);
```
Minimal on purpose — one function, one event. The "payee" is a small fixed set of demo billers (utility, rent) seeded at deploy time.

**Creditcoin CC3 Testnet — `GroundworkASC.sol` + `CreditVault.sol`**
```solidity
// GroundworkASC.sol — verification layer
function verifyBillProof(bytes calldata proof) external returns (address payer, uint256 amount, uint256 timestamp);
// internally calls the BlockProver precompile (0x...0FD2)

// CreditVault.sol — business logic
function recordVerifiedPayment(address payer, uint256 amount, uint256 timestamp) external; // ASC-only
function scoreOf(address payer) external view returns (uint256);
function collateralRatioOf(address payer) external view returns (uint256); // starts at 300%, steps down per verified payment, floors at e.g. 110%
function borrow(uint256 amount) external; // requires msg.value collateral matching collateralRatioOf(msg.sender)
event ScoreUpdated(address indexed payer, uint256 newScore);
event LoanUnlocked(address indexed borrower, uint256 amount, uint256 collateralRatio);
```
`borrow()` is called directly by the user's wallet, not the relayer — the relayer only ever submits the *proof*, never moves the user's borrowed funds, which is a meaningfully better trust story for a lending product and avoids giving the backend custody it doesn't need.

### 3.2 Database (Supabase Postgres)

Following the `supabase-postgres-best-practices` skill: index every foreign key and every filter column, use a partial index for the worker's job queue since it only ever queries the pending subset, and put RLS on from day one rather than bolting it on later.

```sql
create table users (
  wallet_address text primary key,
  created_at timestamptz not null default now()
);

create table bill_events (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  sepolia_tx_hash text not null unique,
  payee text not null,
  amount numeric not null,
  status text not null default 'pending_attestation', -- pending_attestation | attested | failed
  attested_at timestamptz,
  created_at timestamptz not null default now()
);
create index bill_events_wallet_created_idx on bill_events (wallet_address, created_at);
create index bill_events_pending_idx on bill_events (status) where status = 'pending_attestation';

create table score_history (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  score integer not null,
  collateral_ratio integer not null, -- basis points, e.g. 30000 = 300%
  recorded_at timestamptz not null default now()
);
create index score_history_wallet_time_idx on score_history (wallet_address, recorded_at);

create table loans (
  id bigint generated always as identity primary key,
  wallet_address text not null references users(wallet_address),
  amount numeric not null,
  collateral_ratio integer not null,
  creditcoin_tx_hash text not null,
  created_at timestamptz not null default now()
);
create index loans_wallet_idx on loans (wallet_address);

alter table bill_events enable row level security;
alter table score_history enable row level security;
alter table loans enable row level security;
create policy "read own rows" on bill_events for select using (wallet_address = auth.jwt() ->> 'wallet_address');
create policy "read own rows" on score_history for select using (wallet_address = auth.jwt() ->> 'wallet_address');
create policy "read own rows" on loans for select using (wallet_address = auth.jwt() ->> 'wallet_address');
```
The worker writes with a service-role key (bypasses RLS by design); the frontend only ever reads with the user's own SIWE-derived JWT, so RLS alone guarantees one wallet can never see another's bill history or score.

### 3.3 API (FastAPI, Render)

```
POST /api/auth/siwe            — verify SIWE signature, issue Supabase-compatible JWT
GET  /api/dashboard/{wallet}   — score, collateral_ratio, loan_eligibility, recent bill_events
GET  /api/score-history/{wallet} — time series for the chart / tower block count
POST /api/bills/submit         — records a submitted tx_hash as pending (worker independently verifies on-chain; this is just so the UI can show "pending" immediately without waiting for the worker's next poll)
```

### 3.4 Worker (Python, Render Background Worker)

```
1. web3.py filter on Sepolia BillPay.BillPaid, poll every ~10s
2. on new event → upsert bill_events row (idempotent on tx_hash)
3. wait for attestation window (~15s per Attestcoin protocol timing)
4. requests.get(prover-api)/build proof payload
5. web3.py: submit proof to GroundworkASC.verifyBillProof on Creditcoin (relayer key, funded from testnet faucet)
6. on success: update bill_events.status = 'attested', insert score_history row, check threshold, update users' loan_eligibility flag
7. Supabase Realtime picks up the row insert and pushes it to any subscribed frontend client automatically — no extra work needed for the "live" feel
```

### 3.5 Deployment mapping

| Component | Where | Why |
|---|---|---|
| Next.js frontend | Vercel | free tier, native Next.js support, matches your existing stack |
| FastAPI | Render (Web Service) | free tier web service, matches your existing stack |
| Python readability worker | Render (Background Worker) | needs to hold a persistent event listener — not a fit for Supabase Edge Functions' short-lived model |
| Postgres + Auth + Realtime | Supabase | one service covers DB, SIWE-based auth, and the live-push mechanism that makes the demo feel alive |
| Sepolia contract | Sepolia testnet | required source chain for Attestcoin Protocol today |
| Creditcoin contracts | Creditcoin CC3 Testnet | required by submission rules (must be deployed on testnet) |

---

## 4. Frontend Design — 3D Scroll Experience

### Real-site inspirations, and exactly what's being borrowed from each

- **Apple product pages (apple.com/iphone, Vision Pro):** a single 3D object stays pinned in the viewport while the camera path is scrubbed to scroll position, with typography revealing in sync. *Borrowed technique:* `@react-three/drei`'s `<ScrollControls>` driving camera position off `scroll.offset`, combined with GSAP `ScrollTrigger` pins for the section handoffs — this is exactly the pattern in the `3d-web-experience` skill's "Scroll-Driven 3D" section.
- **Stripe.com:** restrained, confidence-building motion — animated data visuals that feel like evidence, not decoration. *Borrowed technique:* the background "attestation flow" behind the hero is a cheap animated gradient/particle shader, not a heavy 3D scene, kept subtle enough that it never competes with the tower.
- **Linear.app marketing site:** dark, precise sections with frosted-glass panels for technical detail. *Borrowed technique:* the "vault" (`concrete-900`) sections use glass-panel cards for the on-chain mechanics (proof submitted, ASC verified, score updated) — this is where the mono-font data readouts live.
- **NYT / Pudding-style scrollytelling:** sticky narrative copy beside a synced visual, horizontal panels for step sequences. *Borrowed technique:* the 3-step mechanic walkthrough (pay → attest → unlock) uses the horizontal-scroll pinned-panel pattern from the `scroll-experience` skill.
- **Bruno Simon's portfolio:** proof that a single well-crafted 3D object can carry an entire site. *What's explicitly NOT borrowed:* his gratuitous, playful looseness — the `3d-web-experience` skill's own anti-pattern warns against "3D for 3D's sake," and a lending product needs restraint, not whimsy. The tower is expressive but never toy-like.

### Story beats (full page, single continuous scroll)

1. **Hook — full viewport.** `concrete-50` background. The Groundwork Tower renders as a bare foundation slab, low-poly, quiet. Headline in the slab serif: *"Credit built from what's real."* A single scroll-cue.
2. **Context — the named problem.** Split layout: left column states the real gap in plain language (undercollateralized lending is out of reach if you don't already hold crypital capital — paraphrased from Creditcoin's own stated problem), right column is a real-number callout (a large mono-font statistic) — earned here because it's a genuine data point driving the narrative, not decoration.
3. **Journey — the mechanic, pinned horizontal sequence.** Three panels, each pinned while its beat plays:
   - *Panel A (light):* a bill gets paid on Sepolia → a block visibly appears at the tower's base.
   - *Panel B (dark, "vault" tone):* the block's edges light up brass-gold as the proof is verified — a glass panel beside it shows the real attested data in mono type (amount, timestamp, tx hash — actual demo data, not placeholder).
   - *Panel C (light):* a gauge beside the tower eases the collateral-ratio number down as blocks stack, tied 1:1 to real `score_history` rows.
4. **Climax — the unlock.** Camera pulls back, the tower's vault door (top block) swings open, light bloom (restrained, no confetti), and the actual loan terms render in mono type next to it.
5. **Resolution.** Dashboard preview card + "Connect wallet to start your Groundwork" CTA. Footer carries the trust signals a lending product needs: testnet disclaimer, GitHub link, audit-credit mention if applicable.

### Implementation stack

- **3D:** React Three Fiber + drei (`ScrollControls`, GLTF model for the tower, Draco-compressed, target <2MB)
- **Scroll orchestration:** GSAP `ScrollTrigger` for pins and section handoffs, Lenis for the base smooth-scroll feel underneath it
- **UI layer:** Tailwind + a handful of shadcn/ui components for the dashboard panels (not the 3D scene itself)
- **Data layer:** wagmi/RainbowKit for wallet connect and the Sepolia bill-pay transaction; Supabase client for realtime dashboard updates

### Performance and accessibility (non-negotiable per the skills' anti-patterns)

- Tower model kept under 100K polys, Draco-compressed GLB, loaded with a real progress indicator (per the "No Loading State" anti-pattern) — never a blank frame.
- `prefers-reduced-motion` respected globally: the entire scroll sequence degrades to a static illustrated version of the tower with simple fade-ins, no scrub, no camera movement.
- Mobile: parallax intensity and poly count reduced below a `768px` breakpoint per the scroll-experience skill's mobile guidance; heavy shader background swapped for a static gradient.
- All content (the real numbers, the mechanic explanation) lives in the DOM, never rendered only inside canvas — so it's readable without JS and doesn't tank SEO or accessibility.

---

## Next step

This plan is ready to build against. The next concrete steps, in order, are: (1) `BillPay.sol` + `GroundworkASC.sol` + `CreditVault.sol`, (2) the Python readability worker, (3) the FastAPI + Supabase schema, (4) the Next.js/R3F frontend. Say the word and I'll start with the contracts.
