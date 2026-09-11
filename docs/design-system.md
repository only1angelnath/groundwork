# Groundwork — Frontend Design System

*This supersedes any earlier plan describing a 3D scroll-driven
frontend (concrete/brass industrial palette, GSAP-pinned tower) — that
design was fully replaced during development. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the system as a whole.*

## 1. Why the direction changed

The original plan called for a persistent 3D object (React Three Fiber)
that grew and lit up as the page scrolled, with GSAP ScrollTrigger +
Lenis driving a pinned, scroll-scrubbed camera. That approach caused a
string of real, hard-to-predict bugs — texture color-space issues,
camera framing problems, an HDR environment-map fetch failure that could
crash the entire scene (`Suspense` alone doesn't catch a rejected
promise), and an unguarded `document.createElement` call throwing during
Next.js's SSR pass — for a purely decorative element, eating a
disproportionate amount of build time.

A full redesign was commissioned instead  and it landed on the current direction: a light,
editorial, glassmorphic DeFi aesthetic — no WebGL, no scroll-pinning,
a traditional multi-section page with anchor nav.

## 2. Brand palette

Defined in `frontend/app/globals.css` as CSS custom properties,
registered with Tailwind v4 via `@theme inline`.

| Token            | Hex                        | Use                                        |
| ---------------- | -------------------------- | ------------------------------------------ |
| `cream-50`     | `#FDFCFA`                | Page background                            |
| `cream-100`    | `#F5F3EF`                | Card/panel background                      |
| `cream-200`    | `#EDEAE3`                | Gradient/accent background                 |
| `ink-900`      | `#1A1815`                | Primary text, headings                     |
| `warmgray-500` | `#9A9691`                | Secondary/muted text                       |
| `warmgray-300` | `#C7C3BC`                | Tertiary text, de-emphasized values        |
| `line-200`     | `#EAE7E0`                | Borders, dividers                          |
| `brass-500`    | `#C08A2E`                | Secondary accent — data/verified states   |
| `brass-300`    | `#E3C179`                | Lighter brass, highlights                  |
| `pink-400`     | `#D9998A`                | Primary accent — dusty rose/terracotta    |
| `pink-500`     | `#C77E6D`                | Deeper primary accent, CTA gradients       |
| `leaf-500`     | `#4C8A5F`                | Success/verified indicator, used sparingly |
| `glass-100`    | `rgba(255,255,255,0.35)` | Glassmorphic surface fill                  |
| `glass-border` | `rgba(255,255,255,0.5)`  | Glassmorphic surface border                |

`brass-500` is reserved specifically for "verified/unlocked" data states
and the top tier of the logo — it should read as *earned*, not used
decoratively elsewhere.

## 3. Typography

Defined in `frontend/app/layout.tsx` via `next/font/google`.

- **Display** (`--font-display`): Fraunces, variable weight. Used for
  all headlines. Italic used for de-emphasized headline phrases (see
  the headline pattern below).
- **Body** (`--font-body`): Inter.
- **Data** (`--font-data`): JetBrains Mono — used exclusively for real
  on-chain data (amounts, addresses, chain names, ratios, status), never
  decoratively. Mono = "this is a real, verifiable number," proportional
  = everything else. This distinction matters for a trust product.

### Headline pattern

Every major headline alternates weight/style/color across phrases:

```
<span className="font-semibold text-ink-900">What if your</span>{" "}
<span className="font-normal italic text-warmgray-500">bill payments</span>
```

Bold + `ink-900` for load-bearing words, normal-weight italic +
`warmgray-500` for connective/de-emphasized words. This is the single
most identifiable visual signature of the design.

## 4. Logo

`frontend/components/Logo.tsx` — an isometric 3-tier tower, chosen to
narrate the product mechanic (payment history building toward an
unlock) rather than being purely decorative:

- Bottom tier: darkest dusty-rose — the foundation, real payment
  history, where the story starts.
- Middle tier: mid dusty-rose — history building.
- Top tier: brass gold — the unlocked, verified state the mechanic
  builds toward.

ViewBox is `0 0 32 70` (a genuine tower silhouette, not square) — the
component takes `size` as rendered height, width derives from the same
aspect ratio.

## 5. Visual language

### Glassmorphism

`bg-glass-100 backdrop-blur-md border border-glass-border`
(`backdrop-blur-xl` for the nav specifically). Requires something behind
it to blur — two mechanisms provide that:

1. `app/layout.tsx` renders a fixed, page-wide layer of three blurred
   color blobs behind all content.
2. `frontend/components/illustrations/BrandMotion.tsx` — a
   section-local version of the same idea for sections that need their
   own ambient motion.

Both are pure CSS (`blur-[Npx]` + keyframe transforms), deliberately not
canvas/WebGL, kept lightweight for performance.

### Hover effects

Every interactive element and every heading/paragraph of consequence has
a hover transition: `transition-colors duration-300 hover:text-pink-500`
on text, `transition hover:scale-[1.04] hover:shadow-lg` on
buttons/cards. Use `group`/`group-hover` when the hover trigger is a
parent wrapper rather than the element itself.

### Scroll reveal

`frontend/components/Reveal.tsx` — a lightweight `IntersectionObserver`
wrapper (fade + translateY on first intersection), wrapping each major
section in `page.tsx`. Deliberately not GSAP/Lenis — keeps the bundle
small while still giving scroll-in animation.

### Animated hero background

`frontend/components/illustrations/TileGridBackground.tsx` — an
isometric grid of tiles with a breathing/pulsing animation, expanding
ripple rings, and a synced glow under the Hero headline. Original code,
not derived from any copyrighted asset.

### Notification bell

`frontend/components/NotificationBell.tsx`, in `Nav` — reads and
subscribes to notifications directly via Supabase (anon key + Realtime),
not through the backend. Its dropdown is **responsively repositioned,
not just resized**: `fixed inset-x-4 top-20` on mobile (viewport-
anchored), reverting to a bell-relative `absolute right-0` dropdown at
`sm:` and up. Capping width alone on an `absolute right-0` element does
not prevent viewport overflow if the anchor point itself isn't at the
true screen edge — any future anchored-dropdown component should follow
this pattern, not just the width cap.

## 6. Mobile-safety patterns (apply to any new component)

- **Any wallet address, tx hash, or other long unbroken string** shown
  inline next to other content must be wrapped in `truncate` +
  `min-w-0` (on a `flex-1` container if sharing a flex row), with
  `shrink-0` on whatever it's sharing the row with. A 42-character
  unbroken string in a flex row will overflow a phone-width card without
  the guard — not a "might."
- **Never rely on `whitespace-nowrap` inside `overflow-hidden`** for
  content whose length isn't fixed/short — it silently clips on mobile
  instead of visibly overflowing, which is worse (no visual cue anything
  is missing). Prefer wrapping (`flex-wrap` + `gap-x-*/gap-y-*`) with
  `sm:whitespace-nowrap`/`sm:flex-nowrap` added back once there's room.
- **Nav is tight below `sm:`** (logo+wordmark left, bell+CTA right, no
  hamburger, anchor links hidden entirely below `sm:`). Any future
  addition to Nav's right-hand cluster needs to shrink gracefully on
  mobile or it will not fit.

## 7. Page structure

`frontend/app/page.tsx` (landing), top to bottom:

1. **Nav** — sticky floating pill, glass, logo + anchor links + CTA
2. **Hero** — badge pills, alternating headline, tile-grid + ripple
   background, two CTAs
3. **Benefits** — 3-card grid, glass cards
4. **Features** — two text callouts, no heavy card treatment
5. **How It Works** — 3 numbered steps, floating glass data cards with
   real protocol values, `BrandMotion` backdrop
6. **FAQ** — accordion, honest content including testnet-only disclosure
7. **Resolution** — closing CTA into `/dashboard`, `BrandMotion` backdrop
8. **Footer** — logo, copyright, GitHub link

Other pages follow the same card/list visual patterns established here:

- **`/dashboard`** — credit standing, pay-a-bill button, live status
  tracker, payment history, SBT receipts (when the wallet has any).
- **`/upload`** — manual-path bill submission form.
- **`/kyc`** — form-card pattern (`bg-glass-100 backdrop-blur-md border border-glass-border`, `rounded-2xl`, `p-6`), stacked full-width
  fields only, no side-by-side inputs — a deliberate mobile-safety
  choice.
- **`/borrow`** — deposit collateral, borrow, view active loan, repay.
- **`/validator`** — two sections (bill review, identity verification),
  same card/list pattern repeated rather than a new visual language
  introduced.

## 8. What NOT to reintroduce

- React Three Fiber / any WebGL canvas for the tower or logo — caused
  the majority of debugging time when first attempted. If real 3D is
  wanted again, scope it as a small isolated component with real time
  budgeted for it, not a drop-in replacement.
- GSAP / Lenis / ScrollTrigger — removed with the 3D tower. Current
  scroll-reveal is intentionally simpler (`Reveal.tsx`).
- A dark "ink-950" premium-DeFi palette — explicitly rejected in favor
  of the current light/cream direction.
