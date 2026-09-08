
## 8. Phase 8 additions (Sept 2026 session)

Everything in §1–7 above is unchanged and still canonical. This section
documents what got added on top, so a future session doesn't have to
rediscover these patterns from scratch.

### New pages

- **`/kyc`** — follows the established form-card pattern (`bg-glass-100
  backdrop-blur-md border border-glass-border`, `rounded-2xl`, `p-6`),
  stacked full-width fields only (no side-by-side inputs) — this was a
  deliberate mobile-safety choice, not just a styling default.
- **`/validator`** — gained a second full section ("Identity
  verification") below the existing bills section, same card/list pattern
  repeated rather than a new visual language introduced.

### New component

- **`NotificationBell`** — lives in `Nav`, bell icon + dropdown. Notable
  because its dropdown is **responsively repositioned, not just
  resized**: `fixed inset-x-4 top-20` on mobile (viewport-anchored),
  reverting to the original `absolute right-0` bell-relative dropdown at
  `sm:` and up. This is the correct pattern any future anchored-dropdown
  component on this site should copy — capping width alone on an
  `absolute right-0` element does not prevent viewport overflow if the
  anchor point itself isn't at the true screen edge.

### Mobile-safety patterns established this session (apply to any new component)

- **Any wallet address, tx hash, or other long unbroken string shown
  inline next to other content** must be wrapped in `truncate` +
  `min-w-0` (on a `flex-1` container if it's sharing a flex row), with
  `shrink-0` on whatever it's sharing the row with. A 42-character
  unbroken string in a flex row **will** overflow a phone-width card —
  this isn't a "might," it's guaranteed without the guard.
- **Never rely on `whitespace-nowrap` inside an `overflow-hidden`
  container** for content whose length isn't fixed/short — it silently
  clips on mobile instead of visibly overflowing, which is worse (no
  visual cue anything is missing). Prefer wrapping (`flex-wrap` +
  `gap-x-*/gap-y-*`) with `sm:whitespace-nowrap`/`sm:flex-nowrap` added
  back once there's room.
- **Nav is tight below `sm:`** (logo+wordmark left, bell+CTA right, no
  hamburger menu, anchor links hidden entirely below `sm:`). Any future
  addition to Nav's right-hand cluster needs to shrink gracefully on
  mobile (see how `NotificationBell` + the "Get Started" button both
  scale down padding/text-size below `sm:`) or it will not fit.

### Confirmed dead code — do not spend time on these

`components/sections/Context.tsx`, `Climax.tsx`, `FeatureVerify.tsx`,
`FeatureStepDown.tsx` are not imported anywhere in `app/page.tsx`. §6
above (written earlier) already noted their retirement in prose, but the
files themselves were never deleted. Confirmed dead as of this session —
safe to delete as a cleanup task, but doing so is out of scope for
anything urgent.
