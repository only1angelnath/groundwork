# USC Contracts

This repository is responsible for housing the core smart contracts necessary to support
Universal Smart Contracts (USC).

## Readability Contracts
1. EvmV1Decoder - Responsible for decoding the tx/rx data of an EVM transaction. After
the tx verification step of USC readability, the decoder is immediately called to translate
foreign transaction data into variables usable within Creditcoin smart contracts.

## Writability Contracts
The write-ability layer lets a dApp on Creditcoin L1 publish a message that is attested by the
validator/attestor set, relayed to a destination chain, and (optionally) acknowledged back on
Creditcoin via a trust-minimized native proof.

1. Outbox / OutboxFactory (`SimpleOutbox.sol`, `SimpleOutboxFactory.sol`) - source-side message
publishing. The factory creates one Outbox per destination chain and hands each Outbox its own
owner. `publishMessage` derives a per-emitter sequenced `messageId`; `acknowledgeMessage` is gated
on the configured `validator`.
2. SimpleInbox (`SimpleInbox.sol`) - destination-side delivery with pending/retry handling. It
delegates vote checking to a pluggable `IVoteValidator` and exposes `computeMessageHash`, the exact
digest attestors sign.
3. EOAValidator (`EOAValidator.sol`) - the production `IVoteValidator`: ECDSA recover + attestor
allowlist + `2N/3 + 1` threshold, with EIP-2 malleability hardening and replay-protected
attestor-set updates.
4. AcknowledgmentValidator (`AcknowledgementValidator.sol`) - proof-based acknowledgment. It verifies
a native USC delivery proof via the block-prover precompile (`INativeQueryVerifier`), decodes the
`MessageDelivered` logs with `EvmV1Decoder`, and calls `Outbox.acknowledgeMessage`.
5. Interfaces (`IVoteValidator.sol`, `IOutboxFactory.sol`, `INativeQueryVerifier.sol`) - the
pluggable seams used by the contracts above.

## Building and Running the Smart Contract Tests
The contracts are a Hardhat project. Tests are written in TypeScript (Mocha/Chai + ethers v6) and
live in `test/`; test-only helper contracts (mocks/stand-ins) live in `contracts/mocks/` and are not
part of the published npm package.

Prerequisites: Node.js 20+. Install dependencies once with:

```
npm install
```

Compile (build) the contracts. Hardhat downloads the pinned solc `0.8.24` on first run:

```
npx hardhat compile
```

Run the full test suite:

```
npm test
# or: npx hardhat test
```

Run the tests with a Solidity coverage report (written to `./coverage/`). This is what CI runs:

```
npm run coverage
# or: npx hardhat coverage
```

The `hardhat` GitHub workflow (`.github/workflows/hardhat.yml`) compiles the contracts and runs
`npx hardhat coverage` on every pull request.

## Releasing New Contract Versions
1. Push a new tag of the format `vX.Y.Z`. This will initiate a workflow which publishes to
npm and creates a release on github
2. Update the contract version used in the `usc-testnet-bridge-examples` and `Creditcoin3` repositories.
This usually just involves updating the imported versions in `package.json`s.
3. If there's a major interface change, consider re-verifying the contracts on services such as Blockscout.
