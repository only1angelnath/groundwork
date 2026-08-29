# Groundwork — Handoff (end of Phase 4 frontend session)

Read this first in a new chat. This supersedes `docs/handoff-phase2.md` and
the original `HANDOFF.md` from the Phase 0-3 session — both are now
historical. This file is canonical as of **Aug 29, 2026**. Submission
deadline is still **September 6, 2026, 23:59 ET — 8 days out.**

## What this project is

**Groundwork** — undercollateralized micro-credit on Creditcoin, built for
the BUIDL CTC 2026 Fall hackathon (Attestcoin Protocol theme, DeFi track).
Real-world bill payments attested on Ethereum Sepolia via the Attestcoin
Protocol progressively lower the collateral ratio required to borrow on
Creditcoin.

## Current state: Phases 0-3 done (unchanged), Phase 4 frontend rebuilt from scratch

### Phases 0-3 — Contracts, worker, backend (done, verified, untouched this session)

Nothing in this session touched contracts, the Python worker, or the
FastAPI backend. All of it is exactly as documented in the prior
`HANDOFF.md`: 16/16 Foundry tests passing, real Sepolia + Creditcoin CC3
Testnet deployments, worker verified twice including a real unattended
end-to-end run, backend SIWE auth + dashboard routes tested live with a
real MetaMask signature. See `docs/attestcoin-integration.md` for
addresses/tx hashes — still accurate, no changes needed.

One thing added in a prior session (not this one, but after the original
HANDOFF.md was written): `supabase/migrations/0002_score_history_dedup.sql`
— a `unique(wallet_address, score)` constraint preventing retry-caused
duplicate rows, with `worker/supabase_client.py`'s `insert_score_history`
updated to upsert on that key.

**Neither worker nor backend has been deployed to Render yet.** Still
local-only. This is unchanged from before and remains open.

### Phase 4 — Frontend: full rebuild, multiple pivots, now stable

This is the bulk of what changed. Read `docs/design-system.md` (new this
session) for the complete current design spec — palette, typography,
logo, component patterns, what not to reintroduce. Short version of how
it got here:

1. Started with the originally-specced concrete/brass industrial palette
   + a GSAP ScrollTrigger + Lenis + React Three Fiber tower that grew
   blocks and lit up as the visitor scrolled.
2. The 3D tower produced a long string of real, one-at-a-time bugs across
   a full session: texture `colorSpace` missing (rendered pure black),
   camera looking at the object's base instead of center (cropped the
   top), `Bounds` `clip` prop cutting off the idle rotation mid-swing, an
   `Environment` HDR fetch failure crashing the *entire* scene because
   `Suspense` alone doesn't catch a rejected promise (needed a real
   `ErrorBoundary`), and finally an unguarded `document.createElement`
   call in a texture generator throwing during Next's SSR pass. Each was
   fixed in turn, but it consumed the majority of a full session for a
   purely decorative element.
3. Full redesign was commissioned. Structural inspiration was pulled
   from real reference sites — **actually rendered with a headless
   browser (Playwright) and compared screenshot-to-screenshot**, not
   guessed from descriptions — specifically a "Meadow" real-estate UI
   concept, Arrakis, Level AI, and **Avon.xyz** (an onchain lending
   product, matched most closely). No assets, code, copy, or fonts from
   any of these were used — see the copyright note in
   `docs/design-system.md` §1, it matters if this gets checked.
4. Landed on: light/cream editorial palette, dusty-rose (`pink-400/500`)
   primary accent extracted from a person-supplied reference video's
   corner-tile color (the video itself was never used — Pinterest-sourced
   content neither of us held rights to; an original CSS/SVG animation
   recreating the same *motif* was built instead), brass-gold secondary
   accent, Fraunces serif headlines, glassmorphism throughout, hover
   effects everywhere, an isometric 3-tier tower logo (dark rose
   foundation → brass gold top, narrating the actual product mechanic).
5. 3D/GSAP/Lenis were fully removed, not just hidden — check the "what
   not to reintroduce" list in `docs/design-system.md` §7 before adding
   any of it back.

**Current page structure:** Nav → Hero → Benefits → Features → How It
Works → FAQ → Resolution (wallet connect) → Footer. Traditional
anchor-linked single page, no scroll-pinning.

## Known, accepted risks

### npm audit: 24 vulnerabilities (22 moderate, 2 high)

Run yourself with `npm audit` in `frontend/`. All 24 are in **transitive
dependencies of wallet-connector code inside RainbowKit** (axios via
`@coinbase/cdp-sdk`, `uuid` via `@metamask/sdk`, `ws` via
`@walletconnect/*`) — not in anything this project's own code touches
directly. Verified `npm audit fix` (non-forced) resolves **zero** of
them — every fix path requires `--force`, which would bump `wagmi` from
2.x to 3.x, a major version RainbowKit 2.2.11 may not even support.

**Decision made:** do not force-fix this close to the deadline and risk
breaking wallet connect, which took real effort to get working
correctly (chain switching, `showBalance={false}`, etc.). All 24 are
moderate/high, none critical, none server-side. Documented here as a
conscious tradeoff, not an oversight. Post-hackathon, the real fix is a
coordinated `wagmi`/`@rainbow-me/rainbowkit` major-version upgrade,
tested properly, not a blind `--force`.

### Next.js/Turbopack + RainbowKit compatibility fix (already applied, don't remove)

`frontend/next.config.ts` has `serverExternalPackages:
["@coinbase/cdp-sdk"]`. This works around a real Next 16 + Turbopack
build failure: `@coinbase/cdp-sdk` (pulled in by RainbowKit's Coinbase
Smart Wallet connector) has dynamic imports to optional `@x402/*`
packages that aren't installed, and webpack tries to resolve them
statically during the server bundle and fails without this. Known
upstream issue (rainbow-me/rainbowkit#2595). Don't remove this line.

### Sandbox font-fetch failures were never a real bug

Every `next build` run in the working environment used to produce this
session failed with `Failed to fetch Fraunces/Inter/JetBrains Mono from
Google Fonts` — that sandbox has no outbound access to
`fonts.googleapis.com`. This is **not** a bug in the code; it resolves
normally on a machine with real internet access (confirmed — Angel's own
`npm run dev` runs have shown the real fonts rendering correctly). If a
future session in a similar restricted sandbox hits the same error,
don't chase it as a code problem.

## Cleanup needed before continuing

- `frontend/lib/useReducedMotion.ts` is now **dead code** — it was only
  consumed by the retired 3D `Tower`/`TowerScene` components. Safe to
  delete, or repurpose if a future feature needs motion-preference
  detection again.
- If a local clone of `avon.xyz` or the Pinterest video file used to
  extract the accent color still exist anywhere in your working
  directory outside `/mnt/user-data/uploads` equivalents, **do not
  commit them to git** — neither is licensed for redistribution. They
  were reference-only, never meant to ship.
- Double check `.gitignore` covers `.env.local` (real WalletConnect
  project ID, any real secrets) before the first push — see the deploy
  script below, which checks this for you.

## Not yet done (open items)

1. **Render deployment of `worker/` and `backend/`** — carried over from
   before the frontend saga began, still open, still low-risk/mostly
   env-var config per the original roadmap's own assessment.
2. **Mobile responsiveness pass** — the current build has been verified
   at desktop widths (1440px) via Playwright renders throughout this
   session. Mobile-specific layout (the Hero's tile-grid background is
   currently `hidden` below the `sm` breakpoint per an earlier decision,
   which may or may not still be the right call given how much the
   design has changed since) has not been checked.
3. **Real `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** — `.env.local` needs
   a real project ID from cloud.reown.com; the working sessions used a
   dummy `test` value for build verification only.
4. **Frontend not deployed to Vercel yet** — still local-only.
5. Optional: swap the isometric-SVG logo/tower for real WebGL if still
   wanted — explicitly deferred this session given the 3D crash history;
   see `docs/design-system.md` §7 before attempting.

## How Angel wants to work (unchanged, still applies)

- Diagnostic output before fixes, verification commands after each change.
- Syntax/typecheck (`tsc --noEmit`) before any file is delivered — every
  file this session was actually typechecked and build-checked, not just
  eyeballed.
- Every delivered file's destination repo path stated explicitly, every
  time, as a table.
- Ask before major, expensive-to-reverse decisions (design pivots,
  dropping a whole subsystem) rather than guessing; a full pivot with an
  unclear ask gets a clarifying question first, not a guess.
- `HANDOFF.md` at session end for seamless resumption — this file.

## Where everything lives (frontend, current)

```
frontend/
├── app/
│   ├── globals.css        # palette tokens (see design-system.md §2)
│   ├── layout.tsx          # fonts, fixed background-blob layer for glassmorphism
│   ├── page.tsx             # section assembly, wraps each in <Reveal>
│   └── providers.tsx         # wagmi + RainbowKit + TanStack Query
├── components/
│   ├── Logo.tsx               # isometric 3-tier tower mark
│   ├── Reveal.tsx               # IntersectionObserver scroll-reveal
│   ├── illustrations/
│   │   ├── TileGridBackground.tsx  # Hero's animated tile grid + ripples
│   │   └── BrandMotion.tsx          # reusable drifting-blob background
│   └── sections/
│       ├── Nav.tsx, Hero.tsx, Benefits.tsx, Features.tsx,
│       │   HowItWorks.tsx, FAQ.tsx, Resolution.tsx, Footer.tsx
├── lib/
│   ├── chains.ts            # Creditcoin CC3 Testnet chain definition
│   ├── wagmi.ts               # wagmi/RainbowKit config
│   └── useReducedMotion.ts     # DEAD CODE — see Cleanup above
└── docs/  (repo root, not frontend/)
    ├── design-system.md          # NEW — canonical frontend design spec
    ├── HANDOFF.md                  # this file
    ├── architecture-and-design.md   # historical for frontend, still accurate for contracts/backend
    ├── build-roadmap.md              # unchanged
    └── attestcoin-integration.md      # unchanged, still accurate
```
