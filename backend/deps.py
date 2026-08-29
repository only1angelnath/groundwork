"""
FastAPI dependency for authenticated routes — Phase 3.

Extracts and verifies the caller's backend-issued JWT (see auth.py), and
returns both the raw token (needed to forward to Supabase for RLS-enforced
reads, see db.py's user_scoped_headers) and its wallet_address claim.

Route handlers additionally check that claim matches the {wallet} path
parameter before doing anything — this is redundant with RLS's own
enforcement at the database layer, but cheap, gives a clearer 403 than a
silently-empty result, and matters if a route ever queries something RLS
doesn't cover.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException

from auth import decode_and_verify_jwt


@dataclass
class AuthedRequest:
    token: str
    wallet_address: str  # lowercased, matches the claim issued in auth.py


def get_authed_request(authorization: str = Header(...)) -> AuthedRequest:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    claims = decode_and_verify_jwt(token)

    wallet_address = claims.get("wallet_address")
    if not wallet_address:
        raise HTTPException(status_code=401, detail="Token missing wallet_address claim")

    return AuthedRequest(token=token, wallet_address=wallet_address.lower())


def require_wallet_match(path_wallet: str, authed: AuthedRequest) -> None:
    if path_wallet.lower() != authed.wallet_address:
        # Deliberately vague — don't confirm/deny whether path_wallet exists
        # or has data, just that this caller can't see it.
        raise HTTPException(status_code=403, detail="Not authorized to view this wallet's data")
