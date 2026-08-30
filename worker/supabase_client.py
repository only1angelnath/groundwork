"""
Supabase writes for the worker — Phase 2.

Per docs/build-roadmap.md's interface contract, the worker writes directly
to Supabase using the service-role key (bypasses RLS by design):

    upsert bill_events (sepolia_tx_hash, wallet_address, payee, amount, status)
    insert score_history (wallet_address, score, collateral_ratio)

This is also the *real* idempotency guard (state.py's local file is just a
cheap resume-point optimization — see its docstring). Before processing an
event, the listener checks bill_events for an existing row with
status='verified' for that sepolia_tx_hash; if found, it's a genuine
duplicate (e.g. a restarted listener re-scanning a block it already
finished) and gets skipped without ever calling the Prover API or
GroundworkASC again.

NOTE: the `bill_events` and `score_history` tables are defined by the
Phase 3 Supabase schema, which has not been created yet as of Phase 2. All
functions here fail soft (log + return a safe default) if SUPABASE_URL /
SUPABASE_SERVICE_ROLE_KEY are unset or the tables don't exist yet, so the
worker can be developed and tested against Sepolia + Creditcoin before
Phase 3 stands up the database. Once Phase 3 lands, no code here needs to
change — only the env vars need to be filled in.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import requests

logger = logging.getLogger("groundwork.worker.supabase_client")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_ENABLED = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)

if not _ENABLED:
    logger.warning(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — Supabase idempotency "
        "checks and writes are disabled. This is expected before Phase 3's schema "
        "exists; the worker will still function, using state.py's local file as its "
        "only restart-safety layer in the meantime."
    )

_REQUEST_TIMEOUT_SECONDS = 10


def _headers() -> dict:
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def is_already_verified(sepolia_tx_hash: str) -> bool:
    """Return True if bill_events already has a status='verified' row for
    this transaction. Fails soft to False (i.e. "assume not processed,
    proceed") if Supabase is disabled or unreachable — the on-chain
    replay guard in GroundworkASC is the backstop if this check misses.
    """
    if not _ENABLED:
        return False

    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/bill_events",
            headers=_headers(),
            params={
                "sepolia_tx_hash": f"eq.{sepolia_tx_hash}",
                "status": "eq.verified",
                "select": "sepolia_tx_hash",
            },
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code == 404:
            # Table doesn't exist yet (pre-Phase 3) — treat as "not processed".
            logger.debug("bill_events table not found yet — treating as not-processed")
            return False
        response.raise_for_status()
        return len(response.json()) > 0
    except requests.RequestException as exc:
        logger.warning("Could not check bill_events for %s (%s) — proceeding as not-processed", sepolia_tx_hash, exc)
        return False


def upsert_bill_event(
    *,
    sepolia_tx_hash: str,
    wallet_address: str,
    payee: str,
    amount: int,
    status: str,
    creditcoin_tx_hash: Optional[str] = None,
) -> None:
    """Upsert a row into bill_events, keyed on sepolia_tx_hash. `status`
    should be one of 'pending', 'proof_fetched', 'verified', 'failed' —
    exact enum values are Phase 3's schema call, this just needs to agree
    with whatever that ends up being.
    """
    if not _ENABLED:
        logger.debug("Supabase disabled — skipping bill_events upsert for %s (status=%s)", sepolia_tx_hash, status)
        return

    payload = {
        "sepolia_tx_hash": sepolia_tx_hash,
        "wallet_address": wallet_address.lower(),  # MUST match backend/auth.py's lowercased JWT
        # claim exactly (RLS does a case-sensitive text compare) — web3.py returns
        # checksummed (mixed-case) addresses from event args, which would otherwise
        # never match and silently return zero rows for every dashboard query.
        "payee": payee,
        "amount": str(amount),  # uint256 can exceed JS/PostgREST-safe int range — send as string
        "status": status,
    }
    if creditcoin_tx_hash is not None:
        payload["creditcoin_tx_hash"] = creditcoin_tx_hash

    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/bill_events",
            headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
            params={"on_conflict": "sepolia_tx_hash"},
            json=payload,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code == 404:
            logger.warning("bill_events table not found yet — skipping upsert for %s (pre-Phase 3 expected)", sepolia_tx_hash)
            return
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Could not upsert bill_events for %s (%s)", sepolia_tx_hash, exc)


def insert_score_history(*, wallet_address: str, score: int, collateral_ratio_bps: int) -> None:
    """Upsert a row into score_history, keyed on (wallet_address, score) —
    see supabase/migrations/0002_score_history_dedup.sql. Not strictly
    required for the core attestation loop to function (CreditVault is the
    source of truth on-chain), but keeps the frontend's Supabase Realtime
    feed (Phase 4) fed without it needing its own indexer.

    Uses upsert (not a plain insert) specifically so retries are safe: a
    client-side timeout doesn't mean the write failed server-side — it may
    have succeeded and the response just didn't arrive in time. A plain
    insert retried after a false-timeout duplicates the row; this upsert
    is a safe no-op instead. (This is exactly what happened once already,
    before this fix — see git history / handoff notes.)

    Still retries a few times on transient network errors before giving
    up, and still fails soft overall (logs and returns rather than
    raising) since this must never block or fail the attestation it's
    mirroring.
    """
    if not _ENABLED:
        logger.debug("Supabase disabled — skipping score_history upsert for %s", wallet_address)
        return

    payload = {
        "wallet_address": wallet_address.lower(),  # see upsert_bill_event's comment — must match
        # backend/auth.py's lowercased JWT claim for RLS to match anything.
        "score": score,
        "collateral_ratio": collateral_ratio_bps,
    }

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            response = requests.post(
                f"{SUPABASE_URL}/rest/v1/score_history",
                headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
                params={"on_conflict": "wallet_address,score"},
                json=payload,
                timeout=_REQUEST_TIMEOUT_SECONDS,
            )
            if response.status_code == 404:
                logger.warning("score_history table not found yet — skipping upsert for %s (pre-Phase 3 expected)", wallet_address)
                return
            response.raise_for_status()
            return  # success
        except requests.RequestException as exc:
            if attempt == max_attempts:
                logger.warning(
                    "Could not upsert score_history for %s after %d attempts (%s) — "
                    "this data point is lost; CreditVault on-chain state is still correct, "
                    "only the frontend's history mirror is missing this entry",
                    wallet_address, max_attempts, exc,
                )
                return
            logger.warning("score_history insert failed (attempt %d/%d): %s — retrying", attempt, max_attempts, exc)
            time.sleep(2 * attempt)

def get_last_scanned_block() -> Optional[int]:
    """Read the persisted scan cursor from the worker_state table
    (key='last_scanned_block'). Used by the Render Cron Job deploy path,
    where each run gets a fresh filesystem and state.py's local file can't
    survive between invocations. Fails soft to None (caller falls back to
    state.py's local file, then LISTENER_START_BLOCK) if Supabase is
    disabled, the table doesn't exist yet, or the row is missing.
    """
    if not _ENABLED:
        return None

    try:
        response = requests.get(
            f"{SUPABASE_URL}/rest/v1/worker_state",
            headers=_headers(),
            params={"key": "eq.last_scanned_block", "select": "value"},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code == 404:
            logger.debug("worker_state table not found yet — no remote cursor available")
            return None
        response.raise_for_status()
        rows = response.json()
        if not rows:
            return None
        return int(rows[0]["value"])
    except (requests.RequestException, KeyError, ValueError, TypeError) as exc:
        logger.warning("Could not read remote scan cursor (%s) — falling back to local state", exc)
        return None


def set_last_scanned_block(block_number: int) -> None:
    """Upsert the scan cursor into worker_state, keyed on 'last_scanned_block'.
    Companion to get_last_scanned_block. Fails soft (logs and returns)
    since losing this write just means the next Render Cron run re-scans
    a bit further back, which is safe per bill_events' idempotency check
    and GroundworkASC's on-chain replay guard.
    """
    if not _ENABLED:
        return

    payload = {"key": "last_scanned_block", "value": block_number}
    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/worker_state",
            headers={**_headers(), "Prefer": "resolution=merge-duplicates"},
            params={"on_conflict": "key"},
            json=payload,
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
        if response.status_code == 404:
            logger.warning("worker_state table not found yet — skipping remote cursor write")
            return
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Could not persist remote scan cursor=%d (%s)", block_number, exc)
