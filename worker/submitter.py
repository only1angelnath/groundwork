"""
Creditcoin submission client — Phase 2.

Submits a fetched proof (see prover_client.get_proof's return shape) to
GroundworkASC.verifyBillProof on Creditcoin CC3 Testnet via web3.py, using
the relayer key (RELAYER_PRIVATE_KEY) — kept separate from any personal
deployer key, per docs/handoff-phase2.md.

This is the automated equivalent of contracts/submit_proof.py, which did
the same thing by hand-building a `cast send` command during Phase 1's
manual proof-of-concept. The tuple structure here mirrors that script's
merkle_proof_arg / continuity_proof_arg construction exactly, just built
as Python tuples for web3.py instead of a cast calldata string.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from web3 import Web3
from web3.exceptions import ContractLogicError, Web3RPCError

logger = logging.getLogger("groundwork.worker.submitter")

CREDITCOIN_TESTNET_RPC_URL = os.environ["CREDITCOIN_TESTNET_RPC_URL"]
GROUNDWORK_ASC_ADDRESS = Web3.to_checksum_address(os.environ["GROUNDWORK_ASC_ADDRESS"])
RELAYER_PRIVATE_KEY = os.environ["RELAYER_PRIVATE_KEY"]

# shared/abis/ is the single source of truth for ABIs — see shared/abis/README.md.
# worker/ and shared/ are siblings under the repo root.
_ABI_PATH = Path(__file__).resolve().parent.parent / "shared" / "abis" / "GroundworkASC.json"

# How many blocks to wait for the submission tx to be mined before giving up.
DEFAULT_RECEIPT_TIMEOUT_SECONDS = 120
# Gas headroom multiplier on top of eth_estimateGas, since precompile calls
# can be underestimated by naive gas estimation.
GAS_LIMIT_BUFFER_MULTIPLIER = 1.3


class AlreadyProcessedError(Exception):
    """Raised when GroundworkASC.processedTransactions already has this
    transaction recorded — this is GroundworkASC's own replay guard
    (see contracts/src/GroundworkASC.sol), not a bug. Callers should treat
    this as a successful no-op, not a failure: the payment was already
    credited by an earlier run.
    """


class SubmissionError(Exception):
    """Raised for any other on-chain failure submitting the proof."""


def _load_abi() -> list:
    with open(_ABI_PATH) as f:
        loaded = json.load(f)
    # shared/abis/*.json should be a bare ABI array. Defensively unwrap a
    # full Forge build artifact (a dict with an "abi" key alongside
    # bytecode/metadata/etc.) if one ever ends up here by mistake — e.g.
    # from a `cp contracts/out/.../X.json shared/abis/X.json` that forgot
    # to extract just the .abi field during a redeploy.
    if isinstance(loaded, dict) and "abi" in loaded:
        logger.warning(
            "%s contains a full build artifact, not a bare ABI array — "
            "unwrapping .abi defensively. Fix the file to store just the "
            "array so this warning goes away.",
            _ABI_PATH,
        )
        return loaded["abi"]
    return loaded


def _get_web3() -> Web3:
    w3 = Web3(Web3.HTTPProvider(CREDITCOIN_TESTNET_RPC_URL))
    if not w3.is_connected():
        raise SubmissionError(f"Could not connect to Creditcoin RPC at {CREDITCOIN_TESTNET_RPC_URL}")
    return w3


def _build_merkle_proof_arg(merkle_proof: dict) -> tuple:
    siblings = tuple(
        (Web3.to_bytes(hexstr=s["hash"]), bool(s["isLeft"]))
        for s in merkle_proof["siblings"]
    )
    return (Web3.to_bytes(hexstr=merkle_proof["root"]), siblings)


def _build_continuity_proof_arg(continuity_proof: dict) -> tuple:
    roots = tuple(Web3.to_bytes(hexstr=r) for r in continuity_proof["roots"])
    return (Web3.to_bytes(hexstr=continuity_proof["lowerEndpointDigest"]), roots)


def submit_proof(proof: dict) -> str:
    """
    Submit `proof` (shape from prover_client.get_proof) to
    GroundworkASC.verifyBillProof. Returns the Creditcoin transaction hash
    on success.

    Raises AlreadyProcessedError if this transaction was already credited
    by a previous run (idempotent no-op, not an error the caller needs to
    act on). Raises SubmissionError for any other on-chain failure.
    """
    w3 = _get_web3()
    abi = _load_abi()
    contract = w3.eth.contract(address=GROUNDWORK_ASC_ADDRESS, abi=abi)

    relayer_account = w3.eth.account.from_key(RELAYER_PRIVATE_KEY)
    relayer_address = relayer_account.address

    block_height = proof["headerNumber"]
    tx_bytes = Web3.to_bytes(hexstr=proof["txBytes"])
    merkle_proof_arg = _build_merkle_proof_arg(proof["merkleProof"])
    continuity_proof_arg = _build_continuity_proof_arg(proof["continuityProof"])

    fn = contract.functions.verifyBillProof(
        block_height, tx_bytes, merkle_proof_arg, continuity_proof_arg
    )

    # Check replay status locally first (a plain view-ish call) so a
    # duplicate event from a restarted listener doesn't even attempt a
    # write transaction — cheaper and clearer than parsing the revert.
    source_tx_hash = proof.get("txHash", "<unknown>")
    logger.info(
        "Submitting proof for Sepolia tx=%s (block_height=%s) via relayer=%s",
        source_tx_hash, block_height, relayer_address,
    )

    try:
        estimated_gas = fn.estimate_gas({"from": relayer_address})
    except (ContractLogicError, Web3RPCError) as exc:
        if _is_already_processed_error(exc):
            logger.info("Sepolia tx=%s already processed on-chain (caught at gas estimation)", source_tx_hash)
            raise AlreadyProcessedError(source_tx_hash) from exc
        raise SubmissionError(f"Gas estimation reverted for tx={source_tx_hash}: {exc}") from exc

    gas_limit = int(estimated_gas * GAS_LIMIT_BUFFER_MULTIPLIER)

    tx = fn.build_transaction(
        {
            "from": relayer_address,
            "nonce": w3.eth.get_transaction_count(relayer_address, "pending"),
            "gas": gas_limit,
            "chainId": w3.eth.chain_id,
        }
    )

    signed_tx = relayer_account.sign_transaction(tx)
    # Computed locally from the signed transaction — no network round-trip
    # needed, and it's the hash we'll wait on regardless of which branch
    # below we take.
    tx_hash = signed_tx.hash

    try:
        w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    except (ValueError, Web3RPCError) as exc:
        if _is_already_processed_error(exc):
            logger.info("Sepolia tx=%s already processed on-chain (caught at broadcast)", source_tx_hash)
            raise AlreadyProcessedError(source_tx_hash) from exc
        if _is_already_known_error(exc):
            # The node's mempool already has this exact signed transaction
            # (identical nonce + data + signature) pending from an earlier
            # run — the "pending" nonce lookup above didn't see it yet,
            # which happens on public testnet RPC endpoints when requests
            # land on different nodes with slightly stale mempool views.
            # This is not a failure: the transaction is real and already
            # broadcast. Fall through and wait for ITS receipt instead of
            # raising, using the hash we already computed locally.
            logger.info(
                "Sepolia tx=%s: transaction already broadcast from an earlier "
                "run (already known), waiting for its receipt: creditcoin_tx=%s",
                source_tx_hash, tx_hash.hex(),
            )
        else:
            raise SubmissionError(f"Broadcast failed for tx={source_tx_hash}: {exc}") from exc
    else:
        logger.info("Submitted, waiting for receipt: creditcoin_tx=%s", tx_hash.hex())

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=DEFAULT_RECEIPT_TIMEOUT_SECONDS)

    if receipt.status != 1:
        raise SubmissionError(
            f"GroundworkASC.verifyBillProof reverted on-chain for source tx={source_tx_hash} "
            f"(creditcoin_tx={tx_hash.hex()})"
        )

    logger.info(
        "Verified on Creditcoin: source_tx=%s creditcoin_tx=%s block=%s",
        source_tx_hash, tx_hash.hex(), receipt.blockNumber,
    )
    return tx_hash.hex()


def _is_already_processed_error(exc: Exception) -> bool:
    """GroundworkASC's require message is 'GroundworkASC: transaction
    already processed' — check for it defensively across both the
    ContractLogicError path (gas estimation) and the raw ValueError path
    some providers return on send_raw_transaction, since node/provider
    error formatting for reverts is not fully standardized.
    """
    message = str(exc)
    return "already processed" in message.lower()


def _is_already_known_error(exc: Exception) -> bool:
    """The RPC node's mempool already has this exact signed transaction
    pending from an earlier run (JSON-RPC error -32603 'already known').
    This is a duplicate-broadcast race, not a real failure — safe to wait
    for the existing transaction's receipt instead of giving up.
    """
    message = str(exc)
    return "already known" in message.lower()
