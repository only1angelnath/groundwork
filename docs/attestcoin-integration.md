# Attestcoin Protocol Integration — Technical Documentation

*(Required submission document. Stub written in Phase 0 — filled in fully
once the ASC is deployed and proven working in Phase 1.)*

## Summary

Groundwork uses the Attestcoin Protocol to trustlessly verify real-world
bill payments made on Ethereum Sepolia, then uses that verified payment
history on Creditcoin to progressively reduce the collateral required for
an otherwise-uncollateralized micro-loan.

## Source chain event

`BillPay.sol` (Sepolia) emits:
```solidity
event BillPaid(address indexed payer, address indexed payee, uint256 amount, uint256 timestamp);
```

## Attestation flow

1. Python readability worker listens for `BillPaid` via `web3.py`.
2. After the protocol's attestation window (~15s), the worker fetches a
   proof from the Attestcoin Protocol Prover REST API — called directly
   via `requests`, since the official `@gluwa/usc-sdk` is JS/TypeScript-only
   and no Python SDK exists yet.
3. The worker submits the proof to `GroundworkASC.sol` on Creditcoin CC3
   Testnet, which verifies it via the Block Prover Precompile at address
   `0x0000000000000000000000000000000000000FD2`, calling its
   `verifyAndEmit(chainKey, blockHeight, encodedTransaction, merkleProof, continuityProof)`
   function — verified against the real interface published in the
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

## Depth of protocol utilization

*(To be filled in once Phase 1's manual proof-of-concept — fetching a real
proof via the Prover REST API and submitting it with `cast send` — is
complete: real contract addresses on both chains, a real example tx hash
pair (Sepolia `BillPaid` tx alongside the corresponding Creditcoin
verification tx), and any edge cases discovered while integrating with the
Block Prover Precompile in practice, e.g. whether `sourceChainKey = 1`
still refers to Ethereum Sepolia in the specific testnet environment
ultimately deployed to.)*
