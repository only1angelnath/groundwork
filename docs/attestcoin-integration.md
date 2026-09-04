# Attestcoin Protocol Integration — Technical Documentation

*(Required submission document.)*

## Summary

Groundwork uses the Attestcoin Protocol to trustlessly verify real-world
bill payments made on Ethereum Sepolia, then uses that verified payment
history on Creditcoin to progressively reduce the collateral required for
an otherwise-uncollateralized micro-loan.

## Deployed contracts (Creditcoin CC3 Testnet + Sepolia)

**Current (live in production):**

| Contract | Chain | Address |
|---|---|---|
| `BillPay.sol` | Ethereum Sepolia | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `EvmV1Decoder` library | Creditcoin CC3 Testnet | `0x16b79d87f11883bb57a3d42480804B637e5a2f8D` |
| `CreditVault.sol` (v2, adds `repay()`) | Creditcoin CC3 Testnet | `0x21209299B5B21F0f599f19aF5C1a9D8EF96cC74A` |
| `GroundworkASC.sol` | Creditcoin CC3 Testnet | `0x77e07d8626E506498D01F8B504305C856473A6b4` |

**Superseded (v1, pre-`repay()`, dead — kept here only for the record):**

| Contract | Chain | Address |
|---|---|---|
| `CreditVault.sol` (v1) | Creditcoin CC3 Testnet | `0xF0572C9E81943374f8A707F6821710D2262E8B22` |
| `GroundworkASC.sol` (v1) | Creditcoin CC3 Testnet | `0x9fa9Cd49d73449A5AC03E7d957048675C6AC04bE` |

**Pending (v3, written and tested, not yet deployed):** `CreditVault`
replaces its single-recorder (`asc`) design with a `mapping(address =>
bool) isRecorder` set plus `addRecorder()`/`removeRecorder()`, so more
than one validator address — not just `GroundworkASC` — can call
`recordVerifiedPayment`. This is preparation for the validator-approved
bill-upload path (see `docs/HANDOFF.md`'s "Next" section); `GroundworkASC`
itself is unchanged, it just needs redeploying to point at the new vault
address once v3 goes live (its `creditVault` reference is immutable).

(v1 `BillPay` and v1 `CreditVault` sharing an address is not a
collision — `CREATE` addresses depend only on `sender + nonce`, not chain
ID, and both were the deployer wallet's first transaction on their
respective chains.)

Ethereum Sepolia's chain key on this Attestcoin Protocol environment is
confirmed as `1` — read directly on-chain via
`ChainInfo.get_supported_chains()` (precompile `0x...0fd3`), not just
trusted from docs.

## Source chain event

`BillPay.sol` (Sepolia) emits:
```solidity
event BillPaid(address indexed payer, address indexed payee, uint256 amount, uint256 timestamp);
```

## Attestation flow

1. A bill payment on Sepolia calls `BillPay.payBill(payee)`, emitting `BillPaid`.
2. After the protocol's attestation window (observed in practice to range
   from ~15s up to several minutes depending on Prover load — slower than
   official docs suggest, planned for accordingly in the frontend's
   live status tracker rather than assumed), a proof is fetched from the
   Attestcoin Protocol Prover REST API at
   `https://prover.cc3-testnet.creditcoin.network` — specifically
   `GET /api/v1/proof-by-tx/{chainKey}/{txHash}`. Endpoint paths confirmed
   by reading the real `@gluwa/usc-sdk` package's compiled source
   (`proof-provider/service/index.js`), not guessed — the JS/TypeScript-only
   official SDK doesn't have a Python equivalent, so the Python worker
   calls this REST API directly via `requests`.
3. The proof is submitted to `GroundworkASC.sol` on Creditcoin CC3 Testnet,
   which verifies it via the Block Prover Precompile at address
   `0x0000000000000000000000000000000000000FD2`, calling
   `verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof)`
   — struct layouts and this function's signature verified against the real
   `@gluwa/usc-contracts` npm package and Creditcoin's own reference ASC
   pattern (docs.creditcoin.org, "Attestcoin Smart Contracts").
4. `GroundworkASC.sol` checks the source transaction's receipt status
   (the precompile only proves inclusion, not success — this check is the
   ASC's own responsibility per Creditcoin's explicit documentation
   warning), extracts the `BillPaid` event from the verified transaction
   bytes via `EvmV1Decoder`, and calls
   `CreditVault.recordVerifiedPayment(payer, amount, timestamp)`.
5. `CreditVault.sol` increments the payer's score and steps their required
   collateral ratio down 20 percentage points per verified payment, from a
   300% starting ratio to a 110% floor.
6. Replay protection: `GroundworkASC` tracks
   `keccak256(chainKey, blockHeight, encodedTransaction)` in a
   `processedTransactions` mapping, so the same source transaction can
   never be credited twice.

## Depth of protocol utilization — proven end-to-end on real testnets, repeatedly

The full flow above was originally walked through manually (`curl` +
`cast send`, no automation) on real Sepolia and Creditcoin CC3 Testnet,
not simulated:

- **Bill paid on Sepolia:** tx `0x13e6f6fa48ee75b030178614a66e8057cf052f0955e2e54e66bbd0e5bcb54f7a`, block 11531599.
- **Proof fetched** from the real Prover REST API for that transaction.
- **Proof verified on-chain** by `GroundworkASC.verifyBillProof` on Creditcoin
  CC3 Testnet — the Block Prover Precompile accepted it, the receipt-status
  check passed, and the `BillPaid` event was correctly extracted from the
  verified transaction bytes via `EvmV1Decoder`.
- **CreditVault updated:** payer's score went from 0 to 1, collateral ratio
  stepped from 300% to 280%. Verification tx:
  `0x4155e7ec8efdd27ddd1d1ae81fcf40e8e155f24f36bf0f77177fa166ec82aa95`.

Since then, the fully automated Python worker has independently repeated
this flow many times against the current (v2) contracts, including
recovering cleanly from two real production incidents: a worker bug that
stalled the scan cursor for two days (an RPC mempool-duplicate error
mishandled as fatal), and a Supabase dedup-key collision across a contract
redeploy (both documented in `docs/HANDOFF.md`). Both are fixed and the
pipeline has since processed a real backlog and multiple fresh payments
cleanly end-to-end, including reaching the 110% collateral-ratio floor on
a real test wallet.

Real engineering issues discovered and resolved during this process:

- `forge script`'s local pre-broadcast simulation panics on Creditcoin
  CC3 Testnet with `header validation error: prevrandao not set` — a known
  Foundry limitation (foundry-rs/foundry #4232) on Substrate/EVM-compat
  chains that don't populate the post-merge `prevRandao` header field.
  Worked around by using `forge create` / `cast send` directly instead of
  `forge script` for Creditcoin-side deploys, which don't do that local
  simulation step.
- `forge create --libraries` does not reliably link an external library
  (known Foundry quirk, foundry-rs/foundry discussion #1618) — the fix is
  putting the library's address in `foundry.toml`'s
  `[profile.default].libraries` instead, confirmed by reproducing both the
  failure and the fix locally against `anvil` before using it for real.
- The RPC node occasionally returns `{"code": -32603, "message": "already
  known"}` when broadcasting — a mempool duplicate-transaction race
  (nonce visibility lag across a public RPC's nodes), not a real failure.
  The worker now waits for the already-pending transaction's receipt
  instead of treating this as fatal.

