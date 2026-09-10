
## Collateral step-down tiers (security-audit follow-up, Sept 2026)

`CreditVault.recordVerifiedPayment` previously ignored its `amount`
parameter entirely — every verified payment, regardless of the bill's
real size, granted an identical flat 20% (`STEP_DOWN_BPS`) cut off the
required collateral ratio. Replaced with an amount-tiered table so larger
verified payments earn a bigger one-time cut than smaller ones.

### The unit mismatch this had to account for

The two recorder paths pass `amount` in genuinely different currencies,
and the contract has no oracle to reconcile them:

- **`GroundworkASC`** passes the real Sepolia ETH-wei amount straight off
  the verified `BillPaid` event — this project's fixed demo payment is
  0.001 ETH.
- **`BillValidator.submitBill`** passes a tCTC-wei amount computed by
  converting a user-typed real-world amount through
  `frontend/lib/useCtcConversion.ts` at CTC's live market price. A $10
  bill is roughly 80–110 tCTC at prices seen around this project's Sept
  13, 2026 deadline (~$0.09–0.13/CTC) — five-plus orders of magnitude
  larger as a raw number than 0.001 ETH.

One tier table can't fairly compare both by raw wei value. The tiers are
calibrated to the tCTC-equivalent scale, since `BillValidator` is the
only path with a real, user-controlled amount to tier against —
`GroundworkASC`'s fixed demo amount will consistently land in the
catch-all tier, at -10% instead of the old flat -20% (roughly double the
clicks to reach the 110% floor if run all the way there live — the
existing demo script only calls for one or two visible drops, not the
floor, so this doesn't block that walkthrough).

### Tier table (defaults as deployed)

| Tier | Threshold (tCTC-wei) | Step-down | Roughly, at ~$0.10/CTC |
|---|---|---|---|
| Large | ≥ 1,000 ether | -35% | ≥ ~$100 bill |
| Typical | ≥ 100 ether | -25% | ≥ ~$10 bill (the upload form's own prefilled default) |
| Small | ≥ 10 ether | -15% | ≥ ~$1 bill |
| Catch-all | anything below (incl. `GroundworkASC`'s fixed 0.001 ETH) | -10% | — |

Typing 5 / 50 / 500 into the upload form's amount field during a demo
lands in three different tiers (-15% / -25% / -35%) — a clean, visibly
differentiated live moment.

Owner-adjustable post-deploy via `CreditVault.setTiers(Tier[])`, no
redeploy needed, if CTC's price moves enough before demo day that these
thresholds stop lining up with realistic bill sizes. `setTiers` requires
strictly descending thresholds ending in a 0-threshold catch-all tier —
enforced on-chain rather than left as a silent misconfiguration.
