#!/usr/bin/env python3
"""
Phase 3 integration test — SIWE auth, dashboard/score-history endpoints,
and a genuine RLS check (queries Supabase directly, bypassing the backend's
own app-level wallet-match check, to prove the DATABASE policy itself is
what's blocking cross-wallet reads — not just backend/deps.py's
require_wallet_match, which would otherwise mask a broken RLS policy).

Requires:
  - backend running locally: `uvicorn main:app --reload` (defaults to
    http://localhost:8000)
  - PRIVATE_KEY set (your real deployer key, same one used for `cast send`
    payBill calls — this signs the SIWE message, it never leaves your
    machine, this script only sends the resulting signature+message to
    your own local backend)
  - SUPABASE_URL, SUPABASE_ANON_KEY set (same values as backend/.env, for
    the direct RLS check)

Usage (from backend/):
    set -a && source .env && set +a
    export PRIVATE_KEY=<your deployer key, or `source ../contracts/.env` if it's there>
    python3 tests/test_phase3_integration.py
"""
from __future__ import annotations

import os
import sys

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]
PRIVATE_KEY = os.environ["PRIVATE_KEY"]

# A wallet with no real data — used only to prove RLS returns zero rows for
# a wallet that isn't the caller, not because this specific address happens
# to have no bill_events rows for some other reason.
UNRELATED_WALLET = "0x000000000000000000000000000000000000ff"


def fail(msg: str) -> None:
    print(f"\nFAIL: {msg}")
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def main() -> None:
    account = Account.from_key(PRIVATE_KEY)
    wallet_address = account.address
    print(f"Testing as wallet: {wallet_address}\n")

    # ---- 1. Get a nonce ----
    print("=== Step 1: GET /api/auth/nonce ===")
    resp = requests.get(f"{BACKEND_URL}/api/auth/nonce", timeout=10)
    if resp.status_code != 200:
        fail(f"nonce request failed: {resp.status_code} {resp.text}")
    nonce = resp.json()["nonce"]
    ok(f"got nonce: {nonce}")

    # ---- 2. Build + sign a SIWE message ----
    print("\n=== Step 2: Sign SIWE message ===")
    message = f"""localhost wants you to sign in with your Ethereum account:
{wallet_address}

Sign in to Groundwork (integration test).

URI: http://localhost:3000
Version: 1
Chain ID: 11155111
Nonce: {nonce}"""

    signed = Account.sign_message(encode_defunct(text=message), private_key=PRIVATE_KEY)
    signature = signed.signature.hex()
    if not signature.startswith("0x"):
        signature = "0x" + signature
    ok("message signed")

    # ---- 3. Verify + get JWT ----
    print("\n=== Step 3: POST /api/auth/verify ===")
    resp = requests.post(
        f"{BACKEND_URL}/api/auth/verify",
        json={"message": message, "signature": signature},
        timeout=10,
    )
    if resp.status_code != 200:
        fail(f"verify failed: {resp.status_code} {resp.text}")
    token = resp.json()["token"]
    ok(f"got JWT, length={len(token)}")

    headers = {"Authorization": f"Bearer {token}"}

    # ---- 4. Call /api/dashboard/{wallet} ----
    print("\n=== Step 4: GET /api/dashboard/{wallet} ===")
    resp = requests.get(f"{BACKEND_URL}/api/dashboard/{wallet_address}", headers=headers, timeout=15)
    if resp.status_code != 200:
        fail(f"dashboard request failed: {resp.status_code} {resp.text}")
    dashboard = resp.json()
    print(f"  score: {dashboard['score']}")
    print(f"  collateral_ratio_bps: {dashboard['collateral_ratio_bps']}")
    print(f"  loan_eligible: {dashboard['loan_eligible']}")
    print(f"  recent_bills: {len(dashboard['recent_bills'])} row(s)")
    if dashboard["score"] <= 0:
        fail("dashboard returned score<=0 — expected real on-chain state from prior verified payments")
    ok("dashboard returned real on-chain state + bill_events rows")

    # ---- 5. Call /api/score-history/{wallet} ----
    print("\n=== Step 5: GET /api/score-history/{wallet} ===")
    resp = requests.get(f"{BACKEND_URL}/api/score-history/{wallet_address}", headers=headers, timeout=15)
    if resp.status_code != 200:
        fail(f"score-history request failed: {resp.status_code} {resp.text}")
    history = resp.json()
    print(f"  {len(history)} row(s): {[(h['score'], h['collateral_ratio_bps']) for h in history]}")
    if len(history) == 0:
        fail("score-history returned zero rows — expected real rows from earlier verified payments")
    ok("score-history returned real rows, ascending order")

    # ---- 6. App-level wallet-match check: wrong wallet in path ----
    print("\n=== Step 6: GET /api/dashboard/{unrelated_wallet} with OUR token (expect 403) ===")
    resp = requests.get(f"{BACKEND_URL}/api/dashboard/{UNRELATED_WALLET}", headers=headers, timeout=10)
    if resp.status_code != 403:
        fail(f"expected 403 from require_wallet_match, got {resp.status_code}: {resp.text}")
    ok("backend correctly refused to serve another wallet's dashboard (app-level check)")

    # ---- 7. THE REAL RLS TEST: query Supabase directly with our JWT, ----
    # ----    asking for an UNRELATED wallet's rows. This bypasses the ----
    # ----    backend's app-level check entirely — only the DB POLICY ----
    # ----    can stop this. ----
    print("\n=== Step 7: Direct Supabase query for UNRELATED wallet's bill_events, using OUR JWT ===")
    print("    (This bypasses the backend's require_wallet_match on purpose —")
    print("     it's the only way to prove RLS itself is enforcing anything.)")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/bill_events",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
        params={"wallet_address": f"eq.{UNRELATED_WALLET}", "select": "*"},
        timeout=10,
    )
    if resp.status_code != 200:
        fail(f"unexpected Supabase error (not an RLS denial, an actual error): {resp.status_code} {resp.text}")
    rows = resp.json()
    if len(rows) != 0:
        fail(f"RLS FAILED TO BLOCK cross-wallet read — got {len(rows)} row(s) for a wallet that isn't ours!")
    ok("RLS correctly returned ZERO rows for an unrelated wallet, using our own valid JWT")

    # ---- 8. Sanity check: same query, but for OUR OWN wallet, should return real rows ----
    print("\n=== Step 8: Same direct Supabase query, but for OUR OWN wallet (sanity check) ===")
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/bill_events",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
        params={"wallet_address": f"eq.{wallet_address.lower()}", "select": "*"},
        timeout=10,
    )
    if resp.status_code != 200:
        fail(f"Supabase error on own-wallet query: {resp.status_code} {resp.text}")
    own_rows = resp.json()
    if len(own_rows) == 0:
        fail(
            "RLS returned ZERO rows for OUR OWN wallet too — this means the policy is "
            "over-blocking (or the wallet_address casing still doesn't match the JWT claim), "
            "not correctly scoped. A working policy should show real rows for the owner."
        )
    ok(f"RLS correctly returned {len(own_rows)} row(s) for our own wallet — policy is scoped correctly, not just closed")

    print("\n=== ALL CHECKS PASSED ===")
    print("SIWE auth, dashboard/score-history endpoints, and RLS enforcement are all confirmed working.")


if __name__ == "__main__":
    main()
