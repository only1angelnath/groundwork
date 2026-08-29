"""
Attestcoin Protocol Prover REST API client — Phase 2.

Wraps PROVER_API_URL with `requests` (no official Python SDK exists yet;
the official @gluwa/usc-sdk is JS/TypeScript-only, so this talks to the
same underlying REST API directly — endpoints confirmed against that
package's compiled source, see docs/attestcoin-integration.md).

Returns the same shape as contracts/proof.json, which was fetched by hand
during Phase 1's manual walkthrough and is the reference for this shape:

{
    "chainKey": int,
    "headerNumber": int,
    "txIndex": int,
    "txHash": str,
    "txBytes": str,           # 0x-prefixed hex
    "continuityProof": {
        "lowerEndpointDigest": str,
        "roots": [str, ...],
    },
    "merkleProof": {
        "root": str,
        "siblings": [{"hash": str, "isLeft": bool}, ...],
    },
    "cached": bool,
    "generatedAt": str,
}
"""
from __future__ import annotations

import logging
import os
import time

import requests

logger = logging.getLogger("groundwork.worker.prover_client")

PROVER_API_URL = os.environ["PROVER_API_URL"].rstrip("/")

# The attestation window is ~15s (per docs/attestcoin-integration.md), but a
# proof isn't guaranteed to exist the instant that window closes — the
# Prover indexes asynchronously. A 404 here means "not attested yet", not
# "will never exist", so this retries with backoff rather than failing fast.
DEFAULT_MAX_ATTEMPTS = 8
DEFAULT_INITIAL_DELAY_SECONDS = 3.0
DEFAULT_BACKOFF_MULTIPLIER = 1.6
DEFAULT_REQUEST_TIMEOUT_SECONDS = 15


class ProofNotReadyError(Exception):
    """Raised when the Prover API hasn't attested this transaction yet, even
    after exhausting all retry attempts. Callers should treat this as
    retryable on a later pass of the listener loop, not a permanent failure.
    """


class ProverAPIError(Exception):
    """Raised for any non-404 error response from the Prover API (auth,
    server error, malformed response, etc.) — these are not retried
    automatically since retrying is unlikely to help without intervention.
    """


def get_proof(
    chain_key: int,
    tx_hash: str,
    *,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    initial_delay_seconds: float = DEFAULT_INITIAL_DELAY_SECONDS,
    backoff_multiplier: float = DEFAULT_BACKOFF_MULTIPLIER,
    timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SECONDS,
) -> dict:
    """
    Fetch a proof for `tx_hash` on `chain_key` from the Prover REST API:

        GET {PROVER_API_URL}/api/v1/proof-by-tx/{chainKey}/{txHash}

    Retries with exponential backoff while the API returns 404 (not yet
    attested). Raises ProofNotReadyError if still not ready after
    `max_attempts`, or ProverAPIError for any other failure.
    """
    if not tx_hash.startswith("0x"):
        tx_hash = f"0x{tx_hash}"

    url = f"{PROVER_API_URL}/api/v1/proof-by-tx/{chain_key}/{tx_hash}"
    delay = initial_delay_seconds

    for attempt in range(1, max_attempts + 1):
        logger.info(
            "Fetching proof for tx=%s chain_key=%s (attempt %d/%d)",
            tx_hash, chain_key, attempt, max_attempts,
        )
        try:
            response = requests.get(url, timeout=timeout_seconds)
        except requests.RequestException as exc:
            logger.warning("Prover API request failed (attempt %d/%d): %s", attempt, max_attempts, exc)
            if attempt == max_attempts:
                raise ProverAPIError(f"Prover API request failed after {max_attempts} attempts: {exc}") from exc
            time.sleep(delay)
            delay *= backoff_multiplier
            continue

        if response.status_code == 200:
            proof = response.json()
            _validate_proof_shape(proof)
            logger.info("Proof ready for tx=%s (cached=%s)", tx_hash, proof.get("cached"))
            return proof

        if response.status_code == 404:
            logger.info("Proof not yet attested for tx=%s, will retry", tx_hash)
            if attempt == max_attempts:
                raise ProofNotReadyError(
                    f"Proof for {tx_hash} not ready after {max_attempts} attempts "
                    f"(~{_total_wait(max_attempts, initial_delay_seconds, backoff_multiplier):.0f}s)"
                )
            time.sleep(delay)
            delay *= backoff_multiplier
            continue

        if response.status_code == 422 and _is_retriable_not_ready(response):
            # e.g. {"code":"BlockNotReady","retriable":true,...} — the Prover
            # has seen the transaction but hasn't attested this block height
            # yet. This is the same "not ready" condition as a 404, just
            # reported differently by this endpoint — NOT a real error, and
            # must not be treated like one (see docstring: callers/listener.py
            # mark a bill_events row 'failed' on ProverAPIError, which would
            # be actively misleading for a condition that resolves on its own
            # as the Prover catches up).
            logger.info("Block not yet attested for tx=%s (%s), will retry", tx_hash, response.text[:200])
            if attempt == max_attempts:
                raise ProofNotReadyError(
                    f"Proof for {tx_hash} not ready after {max_attempts} attempts "
                    f"(~{_total_wait(max_attempts, initial_delay_seconds, backoff_multiplier):.0f}s) "
                    f"— last response: {response.text[:300]}"
                )
            time.sleep(delay)
            delay *= backoff_multiplier
            continue

        # Any other status is a real error — don't retry blindly.
        raise ProverAPIError(
            f"Prover API returned unexpected status {response.status_code} for {tx_hash}: {response.text[:500]}"
        )

    # Unreachable, but keeps type checkers happy.
    raise ProofNotReadyError(f"Proof for {tx_hash} not ready after {max_attempts} attempts")


def _is_retriable_not_ready(response: requests.Response) -> bool:
    """True if a non-200/404 response is still just 'not ready yet', per the
    Prover API's own `retriable` field (seen on 422 BlockNotReady responses).
    Fails safe to False (treat as a real error) if the body isn't the
    expected JSON shape, rather than assuming every unexpected body is safe
    to retry.
    """
    try:
        body = response.json()
    except ValueError:
        return False
    return bool(body.get("retriable") is True)


def _validate_proof_shape(proof: dict) -> None:
    required_top_level = ("headerNumber", "txBytes", "merkleProof", "continuityProof")
    missing = [k for k in required_top_level if k not in proof]
    if missing:
        raise ProverAPIError(f"Prover API response missing expected fields: {missing}")

    merkle = proof["merkleProof"]
    if "root" not in merkle or "siblings" not in merkle:
        raise ProverAPIError("Prover API response's merkleProof missing 'root' or 'siblings'")

    continuity = proof["continuityProof"]
    if "lowerEndpointDigest" not in continuity or "roots" not in continuity:
        raise ProverAPIError("Prover API response's continuityProof missing 'lowerEndpointDigest' or 'roots'")


def _total_wait(max_attempts: int, initial_delay: float, multiplier: float) -> float:
    total = 0.0
    delay = initial_delay
    for _ in range(max_attempts - 1):
        total += delay
        delay *= multiplier
    return total