#!/usr/bin/env python3
"""
Debug helper — gets one real JWT from the running backend and prints
ready-to-copy curl commands, so we can see Supabase's RAW error response
directly, rather than the backend's summarized 502 wrapper.

Usage: same env requirements as test_phase3_integration.py.
    python3 tests/debug_jwt.py
"""
from __future__ import annotations

import os

import requests
from eth_account import Account
from eth_account.messages import encode_defunct

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
PRIVATE_KEY = os.environ["PRIVATE_KEY"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")

account = Account.from_key(PRIVATE_KEY)
wallet_address = account.address

resp = requests.get(f"{BACKEND_URL}/api/auth/nonce", timeout=10)
nonce = resp.json()["nonce"]

message = f"""localhost wants you to sign in with your Ethereum account:
{wallet_address}

Sign in to Groundwork (debug).

URI: http://localhost:3000
Version: 1
Chain ID: 11155111
Nonce: {nonce}"""

signed = Account.sign_message(encode_defunct(text=message), private_key=PRIVATE_KEY)
signature = signed.signature.hex()
if not signature.startswith("0x"):
    signature = "0x" + signature

resp = requests.post(f"{BACKEND_URL}/api/auth/verify", json={"message": message, "signature": signature}, timeout=10)
token = resp.json()["token"]

print("Real JWT (fresh, valid now):\n")
print(token)
print("\n" + "=" * 80)
print("\nCopy-paste this EXACT command, then paste me the FULL raw output:\n")
print(f"""curl -sv "{SUPABASE_URL}/rest/v1/bill_events?select=*&limit=1" \\
  -H "apikey: $SUPABASE_ANON_KEY" \\
  -H "Authorization: Bearer {token}" """)
print("\n" + "=" * 80)
print("\nAlso run this SEPARATE sanity check (service-role key, should ALWAYS work):\n")
print(f"""curl -s "{SUPABASE_URL}/rest/v1/bill_events?select=*&limit=1" \\
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \\
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" """)
