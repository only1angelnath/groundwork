# Groundwork — Frontend Design System

*Canonical as of this session (Aug 2026). This supersedes the frontend
sections of `docs/architecture-and-design.md` — that doc's original spec
(concrete/brass industrial palette, GSAP scroll-pinned 3D tower) was
fully superseded during Phase 4 build. If `architecture-and-design.md`
still describes the 3D scroll story, treat that part as historical; this
doc is the source of truth for the frontend going forward. Non-frontend
sections of that doc (contracts, backend, protocol flow) are untouched
and still accurate.*

## 1. Why the direction changed

Phase 4 went through several complete visual pivots before landing here:

1. **Industrial/concrete** (original spec) — concrete-gray/brass palette,
   GSAP ScrollTrigger + Lenis, a single persistent 3D tower (React Three
   Fiber) that grew blocks and lit up as the visitor scrolled through the
   mechanic.
2. The 3D tower caused repeated real bugs across a full session (texture
   colorSpace issues, camera framing, HDR environment-map fetch crashing
   the whole scene, SSR `document is not defined`) that ate significant
   time for a purely decorative payoff.
3. A full redesign was commissioned, modeled structurally on real
   reference sites (a "Meadow" real-estate UI, Arrakis, Level AI, and
   most directly **Avon.xyz**, an onchain-lending product) — matched by
   actually rendering those sites with a headless browser and comparing
   screenshots, not guessing from text descriptions alone.
4. Landed on the current direction: a light, editorial, glassmorphic
   DeFi aesthetic — no WebGL, no scroll-pinning, traditional multi-section
   page with anchor nav.

**Copyright note:** structural/layout patterns were taken as inspiration
from the above references. No code, copy, logos, fonts, or media assets
from any reference site were used. Where a person shared their own asset
(a Pinterest-sourced video) that neither of us held rights to, the color
was extracted and an original animation was built from scratch instead
of using the file.

## 2. Brand palette

Defined in `frontend/app/globals.css`. All colors are CSS custom
properties registered with Tailwind v4 via `@theme inline`.

| Token | Hex | Use |
|---|---|---|
| `cream-50` | `#FDFCFA` | Page background |
| `cream-100` | `#F5F3EF` | Card/panel background |
| `cream-200` | `#EDEAE3` | Gradient/accent background |
| `ink-900` | `#1A1815` | Primary text, headings |
| `warmgray-500` | `#9A9691` | Secondary/muted text |
| `warmgray-300` | `#C7C3BC` | Tertiary text, de-emphasized values |
| `line-200` | `#EAE7E0` | Borders, dividers |
| `brass-500` | `#C08A2E` | Secondary accent — data/verified states, "unlocked" moments |
| `brass-300` | `#E3C179` | Lighter brass, highlights |
| `pink-400` | `#D9998A` | **Primary accent** — dusty rose/terracotta |
| `pink-500` | `#C77E6D` | Deeper primary accent, CTA gradients |
| `leaf-500` | `#4C8A5F` | Success/verified indicator (green, used sparingly) |
| `tan-100` / `tan-200` | `#F0E6D2` / `#E8DCC5` | CTA button gradient (superseded by pink gradient on primary CTAs, still used for some secondary buttons — check current component before assuming) |
| `glass-100` | `rgba(255,255,255,0.35)` | Glassmorphic surface fill |
| `glass-border` | `rgba(255,255,255,0.5)` | Glassmorphic surface border |

**Primary accent is `pink-400`/`pink-500`** (a dusty-rose/terracotta,
*not* a bright pink) — extracted directly from a reference video's
corner-tile color, then brightened slightly from its shadowed sample for
UI legibility while keeping the same hue family. `brass-500` remains a
secondary accent, specifically for "verified/unlocked" data states and
the top tier of the logo.

## 3. Typography

Defined in `frontend/app/layout.tsx` via `next/font/google`.

- **Display** (`--font-display`): **Fraunces**, loaded as `weight:
  "variable"` (do not set a fixed weight array — Fraunces' `axes` config
  requires variable weight, mixing the two throws a build error). Used
  for all headlines. Editorial, high-contrast serif; italic style used
  for de-emphasized headline phrases (see pattern below).
- **Body** (`--font-body`): Inter.
- **Data** (`--font-data`): JetBrains Mono — used exclusively for
  real on-chain data values (amounts, addresses, chain names, ratios,
  status), never for decorative purposes. This distinction matters: mono
  = "this is a real, verifiable number," proportional = everything else.

### Headline pattern

Every major headline alternates weight/style/color across phrases, not
just a flat sentence:

```
<span className="font-semibold text-ink-900">What if your</span>{" "}
<span className="font-normal italic text-warmgray-500">bill payments</span>
```

Bold + `ink-900` for the "load-bearing" words, normal-weight italic +
`warmgray-500` for connective/de-emphasized words. This is the single
most identifiable visual signature of the current design — apply it
consistently to any new headline.

## 4. Logo

`frontend/components/Logo.tsx`. An isometric 3-tier tower, **not** a
flat icon or wordmark-only mark — chosen specifically to narrate the
product mechanic rather than being decorative:

- Bottom tier: darkest dusty-rose (`#9C5A4C`/`#B97060`/`#C98577`) — the
  foundation, real payment history, where the story starts.
- Middle tier: mid dusty-rose (`#B97060`/`#D9998A`/`#EFCFC5`) — history
  building.
- Top tier: brass gold (`#C08A2E`/`#E3C179`/`#F0DFC0`) — the unlocked,
  verified state the mechanic builds toward.

ViewBox is `0 0 32 70` (tall, not square) — a genuine tower silhouette.
The component takes `size` as the rendered **height**; width is derived
from the same aspect ratio automatically. Don't assume square dimensions
when placing it (check `items-center` alignment on the flex container).

An earlier single-cube version existed briefly and was explicitly
rejected as not reflecting the brand story — don't revert to it.

## 5. Visual language

### Glassmorphism

Applied via `bg-glass-100 backdrop-blur-md border border-glass-border`
(or `backdrop-blur-xl` for the nav specifically). This **requires**
something behind it to blur — flat solid backgrounds make the effect
invisible. Two mechanisms provide that backdrop:

1. `app/layout.tsx` renders a fixed, page-wide layer of three blurred
   color blobs (`pink-400/30`, `brass-300/25`, `pink-500/20`) behind all
   content — this is what most glass surfaces blur against.
2. `frontend/components/illustrations/BrandMotion.tsx` — a reusable,
   *section-local* version of the same idea (three smaller drifting
   blobs, slower/subtler) for sections that need their own ambient
   motion without relying on the global layer showing through (used in
   How It Works and the closing Connect section).

Both are pure CSS (`blur-[Npx]` + `@keyframes` transform animations) —
deliberately not canvas/WebGL, kept lightweight for performance.

### Hover effects

Every interactive element and every heading/paragraph of consequence
has a hover transition — this was an explicit, repeated request. Pattern:
`transition-colors duration-300 hover:text-pink-500` on text,
`transition hover:scale-[1.04] hover:shadow-lg` on buttons/cards. Use
Tailwind's `group`/`group-hover` when the hover trigger is a parent
wrapper rather than the element itself (see `FAQ.tsx`, `Features.tsx`).

### Scroll reveal

`frontend/components/Reveal.tsx` — a lightweight `IntersectionObserver`
wrapper (fade + translateY on first intersection). Used to wrap each
major section in `page.tsx`. Deliberately **not** GSAP/Lenis (both were
removed along with the 3D tower) — this keeps the bundle small
("optimized for speed" was an explicit requirement) while still giving
scroll-in animation.

### Animated hero background

`frontend/components/illustrations/TileGridBackground.tsx` — an
isometric grid of tiles (breathing/pulsing animation) plus expanding
ripple rings and a synced glow that washes up under the Hero headline.
This recreates the *motif* of a Pinterest-sourced reference video (grid
of tiles with accented corners, water-ripple effect) as original code —
the actual video file was never used or shipped, for copyright reasons
(see §1).

## 6. Page structure

`frontend/app/page.tsx`, top to bottom:

1. **Nav** — sticky floating pill, glass, logo + anchor links + CTA
2. **Hero** — badge pills, alternating headline, tile-grid + ripple
   background, two CTAs
3. **Benefits** — 3-card grid, glass cards
4. **Features** — two simple text callouts, no heavy card treatment
5. **How It Works** — 3 numbered steps, each with a floating glass "data
   card" showing real protocol values, `BrandMotion` backdrop
6. **FAQ** — accordion, honest content including testnet-only disclosure
7. **Resolution** (`id="connect"`) — closing CTA + wallet connect,
   `BrandMotion` backdrop, two-line headline
8. **Footer** — logo, copyright, GitHub link (no disclaimer text — that
   content lives in the FAQ instead, not removed from the site, just
   de-duplicated)

No `Context.tsx` or `Climax.tsx` — both retired, content folded into
Benefits/FeatureStepDown-equivalents during the rebuild.

## 7. What NOT to reintroduce

- React Three Fiber / any WebGL canvas for the tower or logo — caused
  the majority of debugging time this session. If real 3D is wanted
  again, scope it as a small isolated component and budget real time
  for it, not a drop-in replacement.
- GSAP / Lenis / ScrollTrigger — removed with the 3D tower. Current
  scroll-reveal is intentionally simpler (`Reveal.tsx`).
- The dark "ink-950" premium-DeFi palette from the first rebuild
  attempt — explicitly rejected in favor of the current light/cream
  direction.
- Avon.xyz's actual assets (logo, PPSupplyMono font, hero video, copy
  text) — never used, must never be used. Structural inspiration only.
