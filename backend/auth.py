"""
SIWE (Sign-In With Ethereum, EIP-4361) auth — Phase 3.

Flow:
  1. Frontend calls GET /auth/nonce -> gets a one-time nonce.
  2. Frontend has the user's wallet sign a SIWE message containing that nonce.
  3. Frontend calls POST /auth/verify with {message, signature}.
  4. This module verifies the signature recovers to the address the message
     claims, and that the nonce matches an unused one we issued.
  5. On success, issues our OWN JWT (not a Supabase Auth JWT — there's no
     Supabase user/session involved) signed with SUPABASE_JWT_SECRET, with
     a custom `wallet_address` claim. Supabase's PostgREST validates any JWT
     signed with the project's JWT secret and exposes its claims via
     auth.jwt() in RLS policies — see supabase/migrations/0001_*.sql's
     `wallet_address = (select auth.jwt() ->> 'wallet_address')` policies.

Nonce storage is in-memory (a plain dict), which is fine for a single Render
instance (the actual deploy target per docs/handoff-phase2.md) but would
need moving to Supabase/Redis if this ever ran with >1 worker process —
flagging that now so it's not a surprise later, not solving it prematurely.
"""
from __future__ import annotations

import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, HTTPException
from siwe import SiweMessage, VerificationError

SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]

# How long a nonce is valid for before it must be re-requested — generous
# enough for a user to review + sign in their wallet UI, tight enough to
# limit replay window.
NONCE_TTL_SECONDS = 5 * 60

# How long our issued JWT is valid for before the frontend needs to
# re-authenticate (re-run the SIWE flow). Sessions aren't precious here —
# there's no server-side session state beyond the JWT itself.
JWT_TTL_SECONDS = 24 * 60 * 60

# nonce -> issued_at unix timestamp. Cleared on use or expiry.
_nonces: dict[str, float] = {}


def generate_nonce() -> str:
    nonce = secrets.token_hex(16)
    _nonces[nonce] = time.time()
    _prune_expired_nonces()
    return nonce


def _prune_expired_nonces() -> None:
    cutoff = time.time() - NONCE_TTL_SECONDS
    expired = [n for n, issued_at in _nonces.items() if issued_at < cutoff]
    for n in expired:
        del _nonces[n]


def verify_siwe_and_get_wallet(message: str, signature: str) -> str:
    """Verify a signed SIWE message. Returns the lowercase wallet address on
    success. Raises HTTPException(401) on any verification failure —
    bad signature, unknown/expired nonce, expired message, etc.
    """
    try:
        siwe_message = SiweMessage.from_message(message)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Malformed SIWE message: {exc}") from exc

    nonce = siwe_message.nonce
    issued_at = _nonces.get(nonce)
    if issued_at is None:
        raise HTTPException(status_code=401, detail="Unknown or already-used nonce")
    if time.time() - issued_at > NONCE_TTL_SECONDS:
        del _nonces[nonce]
        raise HTTPException(status_code=401, detail="Nonce expired — request a new one")

    try:
        siwe_message.verify(signature)
    except VerificationError as exc:
        raise HTTPException(status_code=401, detail=f"SIWE signature verification failed: {exc}") from exc

    # One-time use — remove immediately on successful verification so the
    # same signed message can't be replayed.
    del _nonces[nonce]

    return siwe_message.address.lower()


def issue_backend_jwt(wallet_address: str) -> str:
    """Issue our own JWT for `wallet_address`, signed with the project's
    Supabase JWT secret so PostgREST accepts it and RLS can read the
    wallet_address claim. Shape mirrors what Supabase's own Auth would
    issue (aud/role='authenticated') since that's what the `to authenticated`
    RLS policies expect.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "aud": "authenticated",
        "role": "authenticated",
        "sub": wallet_address.lower(),
        "wallet_address": wallet_address.lower(),
        "iat": now,
        "exp": now + timedelta(seconds=JWT_TTL_SECONDS),
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")


def get_current_wallet(authorization: str = Header(...)) -> str:
    """FastAPI dependency: extracts and verifies the bearer token issued by
    issue_backend_jwt, returns the wallet_address claim. Use this to protect
    routes and to know which wallet's Supabase client to build (see
    db.get_client_for_wallet).
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ")

    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Session expired — sign in again") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    wallet_address = payload.get("wallet_address")
    if not wallet_address:
        raise HTTPException(status_code=401, detail="Token missing wallet_address claim")
    return wallet_address
