## 9. Phase 8 addendum — security audit + CreditVault v4 redeploy (Sept 2026 session)

Everything in `HANDOFFphase8.md` is unchanged and still the source of
truth for everything up through the KYC/notifications/Telegram work. This
addendum documents what got added on top this session, so a future
session (or the next full handoff) doesn't have to rediscover it.

### Why this session happened

A full security audit of the backend, RLS policies, and contracts,
requested with the deadline still comfortably ahead. Found one
genuinely critical issue (unrelated to code — secrets had leaked into a
codebase dump file; rotation deliberately deferred until closer to
submission, since this is a testnet-only demo and the leak never left a
private conversation) plus several real, fixable findings below.

### Fixed this session

| Area | What changed |
|---|---|
| `backend/uploads.py` (new) | Shared upload validation for both bill documents and KYC documents: content-type allowlist (image/jpeg, image/png, image/webp, image/heic, application/pdf only — rejects HTML/SVG outright, which would otherwise be a stored-XSS vector against the validator reviewing them via signed URL), 10MB size cap, and storage paths are now always server-generated (`{prefix}/{uuid4}{ext}`) instead of built from the client-supplied filename. |
| `backend/routers/bills.py`, `backend/routers/kyc.py` | Both now use `uploads.py` instead of trusting `file.filename`/`content_type` directly. |
| `backend/deps.py` | Deleted — dead code with a broken import (`decode_and_verify_jwt`, which doesn't exist in `auth.py`), never actually imported anywhere. |
| `backend/main.py` | CORS `allow_methods`/`allow_headers` narrowed from `["*"]` to exactly what the API uses (`GET`/`POST`, `Authorization`/`Content-Type`). |
| `frontend/lib/uploadValidation.ts` (new) | Client-side pre-check mirroring the backend allowlist/size cap, so a bad upload gets an immediate inline message instead of a round-trip 400. |
| `frontend/app/kyc/page.tsx`, `frontend/app/upload/page.tsx` | Wired to the new client-side validation; upload page's file input gained an `accept` attribute it was previously missing entirely. |

### CreditVault v4 — tiered collateral step-down

`recordVerifiedPayment` previously ignored its `amount` parameter
entirely — every verified payment granted a flat 20% collateral-ratio
step-down regardless of the bill's real size. Replaced with an
amount-tiered table. Full reasoning (including a real cross-currency
issue this surfaced — `GroundworkASC` passes Sepolia ETH-wei,
`BillValidator` passes a tCTC-wei amount converted from a user-typed
real-world figure, five-plus orders of magnitude apart as raw numbers)
is in `docs/collateral-tiers-addendum.md`. Tier table as deployed:

| Tier | Threshold | Step-down |
|---|---|---|
| Large | ≥ 1,000 tCTC-wei | -35% |
| Typical | ≥ 100 tCTC-wei | -25% |
| Small | ≥ 10 tCTC-wei | -15% |
| Catch-all (incl. `GroundworkASC`'s fixed 0.001 ETH demo amount) | anything below | -10% |

Owner-adjustable post-deploy via `CreditVault.setTiers(Tier[])`, no
redeploy needed.

### Redeploy — three contracts, not two

Bytecode change meant redeploying `CreditVault`. **Both `GroundworkASC`
and `BillValidator` hold their `creditVault` reference as `immutable`**,
so both needed redeploying alongside it — this wasn't caught until
mid-session; earlier assumptions (carried over from the v2→v3 migration,
before `BillValidator` existed) only accounted for `GroundworkASC`.
`SoulboundBillRecord` did **not** need redeploying — its minter set is
owner-managed (`addMinter`/`removeMinter`), not immutable — just
re-authorized for the new `BillValidator`.

New addresses (old ones moved to "Superseded" in
`docs/attestcoin-integration.md`, which is now the canonical record —
not duplicated here):

| Contract | Address |
|---|---|
| `CreditVault.sol` (v4) | `0x7C458Ef4347D95449c021350e9FdCcb548474Bf4` |
| `GroundworkASC.sol` | `0xfc03a3912a8245AEDbb94a9F8459Ce576cfD8675` |
| `BillValidator.sol` | `0xB44C6EB9fd286Ec9dc87ECc23A05b876404D6C94` |

Verified on-chain post-deploy: `isRecorder(GroundworkASC)`,
`isRecorder(BillValidator)` on the new vault, and
`isMinter(BillValidator)` on `SoulboundBillRecord` all confirmed `true`
before touching any downstream config.

**All downstream config updated and confirmed this session:**
worker `.env` (`CREDIT_VAULT_ADDRESS`, `GROUNDWORK_ASC_ADDRESS`) + Render;
backend `.env` (`CREDIT_VAULT_ADDRESS`, `BILL_VALIDATOR_ADDRESS`) + Render,
redeployed; Vercel (`NEXT_PUBLIC_CREDIT_VAULT_ADDRESS`,
`NEXT_PUBLIC_BILL_VALIDATOR_ADDRESS`) via `vercel env rm`/`add`, per the
existing dashboard-is-unreliable gotcha; `shared/abis/CreditVault.json`
regenerated (gained `tiers`/`setTiers`/`tiersLength`/`TiersUpdated` —
`GroundworkASC`/`BillValidator` ABIs unchanged, only their addresses
moved, so no regen needed there); `frontend/lib/abis.ts`'s hardcoded
fallback addresses updated too (the defaults used if an env var is ever
missing).

**One thing that looked like it needed fixing but didn't:** worker's
local `.env` has a `BILL_VALIDATOR_ADDRESS` entry, but nothing in
`listener.py`/`submitter.py`/`prover_client.py` ever reads it —
vestigial, probably copy-pasted from `backend/.env` at some point. The
worker's automated path has no reason to know about `BillValidator` at
all. Render's cron job correctly never had it set; nothing to change
there.

### Tests — `contracts/test/CreditVault.t.sol` rewritten, 31/31 passing

Two of the original 20 tests broke under tiering (both asserted the old
flat -20%/10-payments-to-floor behavior) — fixed to read the expected
step-down off the vault's actual configured tier (`vault.tiers(3)`, the
catch-all) rather than a hardcoded rate, so they stay correct if the
tiers are ever retuned via `setTiers`. Added 11 new tests covering the
tiering feature itself (one per tier, an inclusive-boundary check, and
`setTiers`'s access control/validation). Verified with a real `forge
test` run, not just a syntax check — `binaries.soliditylang.org` was
unreachable in the sandbox used to verify this (see the new gotcha in
`docs/attestcoin-integration.md`), worked around with a manually
downloaded `solc-static-linux` binary + `FOUNDRY_SOLC` env var.

### New docs this session

- `docs/collateral-tiers-addendum.md` — the tiering decision and its
  cross-currency reasoning, standalone.
- `docs/attestcoin-integration.md` — updated in place (it's the living
  submission doc): new addresses moved to "Current," old v3 addresses
  moved to "Superseded," attestation-flow description updated to mention
  tiering instead of the old flat rate.

### Still open — unchanged from `HANDOFFphase8.md`'s own list

Nothing below was touched this session; still the real priority order
before Sept 13, 06:00:

1. **Full end-to-end dry run** — automated Sepolia path, manual upload
   path, KYC gate, Telegram push — now against the v4 contracts
   specifically, since this session's redeploy is untested outside the
   unit-test suite. Worth doing before anything else, since it's also
   where the security-audit fixes (upload validation, CORS) get their
   first real exercise together.
2. `docs/demo-script.md` — still the Phase 5 stub.
3. Real visual mobile check (DevTools/phone) of Phase 8's mobile fixes.
4. README / submission form.
5. Optional: delete confirmed-dead `Context.tsx`/`Climax.tsx`/
   `FeatureVerify.tsx`/`FeatureStepDown.tsx`.

### New known gotchas from this session

- `binaries.soliditylang.org` unreachable in some sandboxed dev
  environments (confirmed again this session, same as the earlier
  solc-install gotcha in `handoff-phase2.md`) — download
  `solc-static-linux` directly from
  `github.com/ethereum/solidity/releases/download/<version>/` and set
  `FOUNDRY_SOLC` to it as a workaround; that host resolves even when
  `binaries.soliditylang.org` doesn't.
- Any future `CreditVault` redeploy needs to redeploy **whatever
  currently holds an immutable reference to it** — check every contract
  that takes `creditVault` as a constructor arg before assuming only
  `GroundworkASC` needs to come along, since that list grew silently
  once `BillValidator` was added in Phase 6.5.
- Worker's `.env` carries at least one genuinely unused variable
  (`BILL_VALIDATOR_ADDRESS`) — don't assume every var present in
  `worker/.env` is actually read by worker code; check before spending
  time updating it on a redeploy.
