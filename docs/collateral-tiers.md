# Collateral step-down tiers

`CreditVault.recordVerifiedPayment` doesn't apply a flat cut to the
required collateral ratio — it looks up an amount-tiered step-down, so
larger verified payments earn a bigger one-time reduction than smaller
ones.

## The unit mismatch this has to account for

The two recorder paths pass `amount` in genuinely different currencies,
and the contract has no oracle to reconcile them:

- **`GroundworkASC`** passes the real Sepolia ETH-wei amount straight off
  the verified `BillPaid` event — the demo payment amount is 0.001 ETH.
- **`BillValidator.submitBill`** passes a tCTC-wei amount computed by
  converting a user-typed real-world amount through
  `frontend/lib/useCtcConversion.ts` at CTC's live market price. A $10
  bill is roughly 80–110 tCTC at prices seen around September 2026
  (~$0.09–0.13/CTC) — five-plus orders of magnitude larger as a raw
  number than 0.001 ETH.

One tier table can't fairly compare both by raw wei value. The tiers are
calibrated to the tCTC-equivalent scale, since `BillValidator` is the
only path with a real, user-controlled amount to tier against —
`GroundworkASC`'s fixed demo amount consistently lands in the catch-all
tier.

## Tier table (defaults as deployed)

| Tier | Threshold (tCTC-wei) | Step-down | Roughly, at ~$0.10/CTC |
|---|---|---|---|
| Large | ≥ 1,000 ether | -35% | ≥ ~$100 bill |
| Typical | ≥ 100 ether | -25% | ≥ ~$10 bill (the upload form's own prefilled default) |
| Small | ≥ 10 ether | -15% | ≥ ~$1 bill |
| Catch-all | anything below (incl. `GroundworkASC`'s fixed 0.001 ETH) | -10% | — |

Owner-adjustable post-deploy via `CreditVault.setTiers(Tier[])`, no
redeploy needed, if CTC's price moves enough that these thresholds stop
lining up with realistic bill sizes. `setTiers` requires strictly
descending thresholds ending in a 0-threshold catch-all tier — enforced
on-chain rather than left as a silent misconfiguration.
