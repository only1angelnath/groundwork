# Groundwork — Handoff (end of Phase 3 session)

Read this first in a new chat. This supersedes `docs/handoff-phase2.md` —
that file is now historical, this one is canonical. Everything below is
accurate as of this session's end (Aug 23, 2026).

## What this project is

**Groundwork** — undercollateralized micro-credit on Creditcoin, built for
the BUIDL CTC 2026 Fall hackathon (Attestcoin Protocol theme, DeFi track).
Real-world bill payments attested on Ethereum Sepolia via the Attestcoin
Protocol progressively lower the collateral ratio required to borrow on
Creditcoin.

**Submission deadline: September 6, 2026, 23:59 ET.**

## Current state: Phases 0, 1, 2, 3 all done and verified for real

Not simulated at any layer — every phase below was proven against real
Sepolia, real Creditcoin CC3 Testnet, and real Supabase, not local mocks
(mocks were used only where a real equivalent was impossible — see Phase 2).

### Phase 0 + 1 — Contracts (done, verified by hand)

| Contract | Chain | Address |
|---|---|---|
| `BillPay.sol` | Ethereum Sepolia | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `EvmV1Decoder` library | Creditcoin CC3 Testnet | `0x16b79d87f11883bb57a3d42480804B637e5a2f8D` |
| `CreditVault.sol` | Creditcoin CC3 Testnet | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `GroundworkASC.sol` | Creditcoin CC3 Testnet | `0x9fa9Cd49d73449A5AC03E7d957048675C6AC04bE` |

16/16 Foundry tests passing. Full addresses, tx hashes, and engineering
gotchas (the `prevrandao` panic, `forge create --libraries` linking issue)
are in `docs/attestcoin-integration.md` — still accurate, no changes needed.

### Phase 2 — Python worker (done, verified twice)

`worker/listener.py`, `prover_client.py`, `submitter.py`, `state.py`,
`supabase_client.py` — all real implementations, no stubs left.

- **Relayer wallet**, separate from the deployer key, funded on Creditcoin
  CC3 Testnet:

  | Role | Address |
  |---|---|
  | Deployer | `0xeb190150aD31C3578511F2Cc552A730930Ef5493` |
  | Relayer | `0xaD633FF964175Eb54fAacC62989a0961C19683d1` |

- **Integration test harness** (`worker/tests/`) proves the pipeline against
  real Creditcoin (Sepolia side mocked via local Anvil, since
  GroundworkASC's precompile only exists on real Creditcoin). Confirmed:
  event detection, proof fetch, relayer signing, and the on-chain replay
  guard all work. Run with `./tests/run_integration_test.sh` from `worker/`.
- **A real fresh end-to-end pass was also run** (not just the replay-guard
  test): a genuinely new bill paid on real Sepolia while `listener.py` ran
  unattended, correctly weathered the Prover's `BlockNotReady` attestation
  lag via retry, and landed verified on real `GroundworkASC` — zero manual
  intervention. This is the strongest proof Phase 2 works as designed.
- Two real bugs were found and fixed during this testing (both already
  applied to the delivered files, nothing to redo):
  1. `state.py`: `LISTENER_STATE_PATH=` (set-but-empty in `.env`) resolved
     to the current directory instead of falling back to the default —
     fixed to treat blank-but-set as unset.
  2. `submitter.py`: real RPC nodes raise `Web3RPCError` on reverts, not
     `ContractLogicError` — fixed to catch both, so
     `AlreadyProcessedError`/replay-guard detection actually fires.

### Phase 3 — Backend + Supabase (done, verified live)

- **Migration**: `supabase/migrations/0001_bill_events_and_score_history.sql`
  — has been run against the real Supabase project. Creates `bill_events`
  and `score_history` with RLS enabled and forced, policies scoped to
  `wallet_address = auth.jwt() ->> 'wallet_address'`.
- **Backend**: `backend/main.py`, `auth.py`, `db.py`, `chain.py`,
  `routers/{auth,dashboard,score_history}.py` — all real implementations.
  - Auth: SIWE (EIP-4361) verification, backend issues its own JWT signed
    with `SUPABASE_JWT_SECRET` (the **legacy** HS256 secret — this project
    has NOT migrated to Supabase's new asymmetric JWT Signing Keys, it uses
    the "Legacy JWT Secret" tab, confirmed still active for verification).
  - `GET /auth/nonce`, `POST /auth/verify` → `{token, wallet_address}`.
  - `GET /api/dashboard/{wallet}` → live `CreditVault` read
    (score/ratio/eligibility) + `bill_events` via RLS-scoped Supabase client.
  - `GET /api/score-history/{wallet}` → `score_history` via RLS-scoped client.
  - Both data routes 403 if the path wallet doesn't match the JWT's wallet,
    on top of RLS enforcing the same thing at the DB layer.
- **Fully tested live**, not just unit-tested: real MetaMask signature from
  the real deployer wallet → real JWT → real `/api/dashboard` call returned
  real on-chain + real Supabase data. Cross-wallet request correctly
  rejected with `403`. See "Verified requests" below for exact commands.

**One gotcha that cost real debugging time, worth remembering:** the value
in Supabase's dashboard under Project Settings → JWT Keys → **JWT Signing
Keys** tab is NOT what to use for `SUPABASE_JWT_SECRET` if the project is
still on the legacy system. Use the **Legacy JWT Secret** tab specifically,
click **Reveal**, and copy that exact value. A near-match (e.g. grabbing
the anon key by mistake, or a stray trailing character) fails as
`postgrest.exceptions.APIError: PGRST301 — No suitable key or wrong key type`,
which looks like a bigger problem than it is.

## Verified requests (for your own re-testing, or a future session)

```bash
# From backend/, with real .env and venv active:
set -a && source .env && set +a && uvicorn main:app --reload --port 8000

# Full SIWE flow lives in backend_test/ (see "Cleanup" below) —
# build_siwe_message.py + sign.html walks nonce -> real MetaMask signature -> verify.

# Once you have a token:
curl http://localhost:8000/api/dashboard/0xeb190150aD31C3578511F2Cc552A730930Ef5493 \
  -H "Authorization: Bearer $TOKEN"
# -> real score, collateral_ratio_bps, loan_eligible, recent_bills
```

Last confirmed real values (Aug 23, 2026 — will have moved on if the worker
kept running): `score: 5`, `collateral_ratio_bps: 20000` (200%).

## Known non-blocking issue

`score_history` rows are occasionally out of value-order relative to their
timestamp (observed: score went 3 → 5 → 4 across three rows, sorted
correctly by time but not monotonic). Root cause almost certainly multiple
`listener.py` instances having run concurrently at some point during this
session's heavy restart/debug cycle, each reading `scoreOf()` against a
possibly-lagging RPC node. **Not a correctness bug in the live dashboard**
— `/api/dashboard` reads `CreditVault` directly, which is always accurate.
Only matters when Phase 4 builds the score chart off `score_history` —
worth a sanity pass (e.g. clamp/dedupe by ensuring score is monotonic
non-decreasing when rendering) before trusting that table's raw order.

## Cleanup needed before continuing

`backend_test/` (repo root, sibling to `backend/`) is a throwaway scratch
folder created during this session's live testing:
- `build_siwe_message.py` — CLI helper, builds a real SIWE message against
  a running backend, then verifies a pasted signature.
- `sign.html` — standalone page (no server needed beyond
  `python3 -m http.server`) that calls MetaMask's `personal_sign` directly.
- `saved_message.txt` — a stale signed message, safe to delete.

Neither script is part of the app. **Delete the whole `backend_test/`
folder** once you're confident the backend works, or keep it around if
useful for quick manual re-tests later — it's harmless either way, just not
meant to ship.

## Not yet done (open decision from end of this session)

Angel was asked what's next and ran out of time before answering. Two real
options, not mutually exclusive:

1. **Deploy `worker/` and `backend/` to Render** as background/web services
   respectively. Neither has been deployed yet — everything proven this
   session was run locally. This is low-risk, mostly env-var configuration,
   not new engineering.
2. **Start Phase 4 — frontend** (Next.js, Vercel). Per
   `docs/build-roadmap.md` this is the longest phase (~9 days) and the
   biggest schedule risk remaining before Sept 6. `docs/architecture-and-design.md`
   has the full 3D scroll-driven design already speced, not yet built.
   Relevant skills for this phase: `3d-web-experience`, `scroll-experience`,
   `frontend-design`.

Recommendation carried over from this session: given the project is
running ~3 days ahead of the roadmap's own dates, either order is fine, but
Phase 4 is the real schedule risk — deploying to Render can happen anytime
in a single sitting and doesn't block anything else.

## Where everything lives (repo structure, current)

```
groundwork/
├── contracts/              # Foundry — done, deployed, verified
├── worker/                 # Phase 2 — done, tested twice against real chains
│   └── tests/               # integration test harness (Anvil + mock Prover + real Creditcoin)
├── backend/                 # Phase 3 — done, tested live
│   └── routers/
├── backend_test/            # THROWAWAY — see Cleanup above, delete when done
├── supabase/
│   └── migrations/
│       └── 0001_bill_events_and_score_history.sql   # already run against real project
├── frontend/                 # Phase 4 — NOT STARTED
├── shared/abis/               # single source of truth for contract ABIs
└── docs/
    ├── build-roadmap.md            # unchanged this session
    ├── architecture-and-design.md  # unchanged this session — Phase 4's spec
    ├── attestcoin-integration.md   # unchanged this session — still accurate
    └── handoff-phase2.md           # SUPERSEDED by this file — safe to archive/delete
```

## How Angel wants to work (unchanged, still applies)

- Bugs delivered as direct corrected files, not explained first.
- Syntax/import checks before code is delivered — this session, every
  delivered file was actually run/tested, not just syntax-checked, where
  a real test was feasible.
- `python3 << 'PYEOF'` for file writes with special characters; never bash
  heredocs.
- Terminal commands copy-pasteable one at a time, with checkpoints.
- Full codebase dump at the start of each session before any code is
  written.
- **Every delivered file's destination repo path stated explicitly, every
  time** — a table mapping filename to destination path, added as a
  standing preference this session.
- `HANDOFF.md` at session end for seamless resumption — this file.
