"""
Sepolia event listener — Phase 2.

Watches BillPay.sol's BillPaid event on Ethereum Sepolia and, for each new
event, runs the full attestation pipeline unattended:

    BillPaid event -> prover_client.get_proof -> submitter.submit_proof
    -> CreditVault state read -> Supabase writes

This automates the exact manual flow proven during Phase 1
(docs/attestcoin-integration.md's "Depth of protocol utilization" section):
pay a bill, fetch a proof via curl, submit it via cast send, watch the
score update. Nothing about the flow's logic changes here — only the
"manual" parts become code.

Restart-safety (per build-roadmap.md's Phase 2 definition of done —
"doesn't double-process an event it already handled"):
  - state.py's local last_scanned_block file avoids re-scanning all of
    Sepolia's history from block zero after every restart.
  - supabase_client.py's bill_events check is the real idempotency guard,
    since the local file can be lost on a fresh deploy.
  - GroundworkASC.sol's own processedTransactions mapping is the final
    backstop even if both of the above somehow miss a duplicate.

Run with: python3 listener.py
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

load_dotenv()  # local dev convenience only — no-op if worker/.env doesn't exist;
# Render sets real env vars directly and this never overrides those (override=False).

import prover_client
import state
import submitter
from supabase_client import insert_score_history, is_already_verified, upsert_bill_event

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("groundwork.worker.listener")

SEPOLIA_RPC_URL = os.environ["SEPOLIA_RPC_URL"]
BILLPAY_CONTRACT_ADDRESS = Web3.to_checksum_address(os.environ["BILLPAY_CONTRACT_ADDRESS"])
CREDITCOIN_TESTNET_RPC_URL = os.environ["CREDITCOIN_TESTNET_RPC_URL"]
CREDIT_VAULT_ADDRESS = Web3.to_checksum_address(os.environ["CREDIT_VAULT_ADDRESS"])

# Attestcoin Protocol chain key for Sepolia — confirmed live on-chain via
# ChainInfo.get_supported_chains() during Phase 1, see docs/attestcoin-integration.md.
# Not read from an env var: it's a protocol-level constant for this source chain,
# not a per-deploy setting, and GroundworkASC.sol hardcodes the same value at deploy time.
SEPOLIA_CHAIN_KEY = 1

POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "10"))

# How many blocks to scan per poll iteration, capped so a long restart gap
# (e.g. after a multi-hour outage) doesn't request an enormous log range in
# one call and hit a provider's block-range limit.
MAX_BLOCKS_PER_SCAN = 2_000

# Fallback start point if no local state file exists yet (fresh deploy) and
# Supabase has no rows to infer a starting point from either. Set this to
# BillPay's actual deploy block once known, so a totally fresh worker
# doesn't scan from block zero.
FALLBACK_START_BLOCK = int(os.environ.get("LISTENER_START_BLOCK", "0"))

_ABI_DIR = Path(__file__).resolve().parent.parent / "shared" / "abis"


def _load_abi(name: str) -> list:
    with open(_ABI_DIR / f"{name}.json") as f:
        return json.load(f)


def _get_start_block(w3: Web3) -> int:
    saved = state.load_last_scanned_block()
    if saved is not None:
        logger.info("Resuming from saved last_scanned_block=%d", saved)
        return saved + 1

    if FALLBACK_START_BLOCK > 0:
        logger.info("No saved state — starting from LISTENER_START_BLOCK=%d", FALLBACK_START_BLOCK)
        return FALLBACK_START_BLOCK

    latest = w3.eth.block_number
    logger.warning(
        "No saved state and LISTENER_START_BLOCK not set — starting from current tip "
        "(block=%d). This will MISS any BillPaid events already on-chain before now. "
        "Set LISTENER_START_BLOCK to BillPay's deploy block for a correct first run.",
        latest,
    )
    return latest


def process_event(event, billpay_abi: list, creditvault_abi: list, creditcoin_w3: Web3) -> None:
    payer = event["args"]["payer"]
    payee = event["args"]["payee"]
    amount = event["args"]["amount"]
    tx_hash = event["transactionHash"].hex()

    logger.info("BillPaid: payer=%s payee=%s amount=%d tx=%s", payer, payee, amount, tx_hash)

    if is_already_verified(tx_hash):
        logger.info("tx=%s already verified per bill_events — skipping (idempotency guard)", tx_hash)
        return

    upsert_bill_event(
        sepolia_tx_hash=tx_hash, wallet_address=payer, payee=payee, amount=amount, status="pending",
    )

    try:
        proof = prover_client.get_proof(SEPOLIA_CHAIN_KEY, tx_hash)
    except prover_client.ProofNotReadyError:
        # Not attested yet even after prover_client's own retries — leave the
        # bill_events row as 'pending' and let the NEXT poll iteration's
        # re-scan (last_scanned_block only advances past fully-handled
        # blocks, see run_forever below) pick this back up.
        logger.warning("tx=%s proof still not ready — will retry on a later poll", tx_hash)
        raise
    except prover_client.ProverAPIError:
        upsert_bill_event(
            sepolia_tx_hash=tx_hash, wallet_address=payer, payee=payee, amount=amount, status="failed",
        )
        raise

    upsert_bill_event(
        sepolia_tx_hash=tx_hash, wallet_address=payer, payee=payee, amount=amount, status="proof_fetched",
    )

    try:
        creditcoin_tx_hash = submitter.submit_proof(proof)
    except submitter.AlreadyProcessedError:
        logger.info("tx=%s already processed on-chain per GroundworkASC — treating as success", tx_hash)
        upsert_bill_event(
            sepolia_tx_hash=tx_hash, wallet_address=payer, payee=payee, amount=amount, status="verified",
        )
        return
    except submitter.SubmissionError:
        upsert_bill_event(
            sepolia_tx_hash=tx_hash, wallet_address=payer, payee=payee, amount=amount, status="failed",
        )
        raise

    upsert_bill_event(
        sepolia_tx_hash=tx_hash,
        wallet_address=payer,
        payee=payee,
        amount=amount,
        status="verified",
        creditcoin_tx_hash=creditcoin_tx_hash,
    )

    _write_score_history(payer, creditvault_abi, creditcoin_w3)


def _write_score_history(payer: str, creditvault_abi: list, creditcoin_w3: Web3) -> None:
    """Read the payer's freshly-updated score/ratio straight off CreditVault
    (the source of truth) rather than trusting decoded event data, and mirror
    it into score_history for the frontend's Supabase Realtime feed.
    """
    try:
        vault = creditcoin_w3.eth.contract(address=CREDIT_VAULT_ADDRESS, abi=creditvault_abi)
        score = vault.functions.scoreOf(payer).call()
        ratio_bps = vault.functions.requiredCollateralRatioOf(payer).call()
        insert_score_history(wallet_address=payer, score=score, collateral_ratio_bps=ratio_bps)
    except Exception:
        # score_history is a convenience mirror for the frontend, not the
        # source of truth (CreditVault is) — never let a failure here look
        # like the attestation itself failed.
        logger.exception("Could not write score_history for payer=%s (attestation itself succeeded)", payer)


def run_forever() -> None:
    sepolia_w3 = Web3(Web3.HTTPProvider(SEPOLIA_RPC_URL))
    if not sepolia_w3.is_connected():
        raise RuntimeError(f"Could not connect to Sepolia RPC at {SEPOLIA_RPC_URL}")

    creditcoin_w3 = Web3(Web3.HTTPProvider(CREDITCOIN_TESTNET_RPC_URL))
    if not creditcoin_w3.is_connected():
        raise RuntimeError(f"Could not connect to Creditcoin RPC at {CREDITCOIN_TESTNET_RPC_URL}")

    billpay_abi = _load_abi("BillPay")
    creditvault_abi = _load_abi("CreditVault")
    billpay = sepolia_w3.eth.contract(address=BILLPAY_CONTRACT_ADDRESS, abi=billpay_abi)

    next_from_block = _get_start_block(sepolia_w3)
    logger.info(
        "Listener starting: billpay=%s vault=%s poll_interval=%ds",
        BILLPAY_CONTRACT_ADDRESS, CREDIT_VAULT_ADDRESS, POLL_INTERVAL_SECONDS,
    )

    while True:
        try:
            latest_block = sepolia_w3.eth.block_number
        except Exception:
            logger.exception("Could not fetch latest Sepolia block — retrying next interval")
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        if next_from_block > latest_block:
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        to_block = min(latest_block, next_from_block + MAX_BLOCKS_PER_SCAN - 1)

        logger.info("Scanning Sepolia blocks %d..%d (tip=%d)", next_from_block, to_block, latest_block)

        try:
            events = billpay.events.BillPaid.get_logs(from_block=next_from_block, to_block=to_block)
        except Exception:
            logger.exception("Could not fetch BillPaid logs for %d..%d — retrying next interval", next_from_block, to_block)
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        scan_had_failure = False
        for event in events:
            try:
                process_event(event, billpay_abi, creditvault_abi, creditcoin_w3)
            except Exception:
                # Log and continue with other events in this batch rather than
                # crashing the whole listener over one bad/unready proof —
                # next poll's re-scan of this same block range will retry it,
                # since we don't advance next_from_block past a failed scan.
                logger.exception("Failed to process BillPaid event tx=%s — will retry on next poll", event["transactionHash"].hex())
                scan_had_failure = True

        if scan_had_failure:
            # Don't advance the cursor past blocks containing an event we
            # couldn't fully process yet (e.g. proof not ready) — retry the
            # same range next iteration. is_already_verified() makes
            # re-processing already-successful events in this same range
            # a cheap no-op.
            logger.warning("One or more events in %d..%d failed — will re-scan this range next poll", next_from_block, to_block)
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        state.save_last_scanned_block(to_block)
        next_from_block = to_block + 1

        if to_block < latest_block:
            continue  # more to scan immediately, don't sleep
        time.sleep(POLL_INTERVAL_SECONDS)


def main() -> None:
    run_forever()


if __name__ == "__main__":
    main()
