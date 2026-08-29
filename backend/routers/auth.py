"""
Auth routes — Phase 3.

    GET  /auth/nonce            -> {nonce}
    POST /auth/verify           -> {token, wallet_address}   (SIWE sign-in)
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from auth import generate_nonce, issue_backend_jwt, verify_siwe_and_get_wallet

router = APIRouter(prefix="/auth", tags=["auth"])


class VerifyRequest(BaseModel):
    message: str
    signature: str


class VerifyResponse(BaseModel):
    token: str
    wallet_address: str


@router.get("/nonce")
def get_nonce() -> dict:
    return {"nonce": generate_nonce()}


@router.post("/verify", response_model=VerifyResponse)
def verify(body: VerifyRequest) -> VerifyResponse:
    wallet_address = verify_siwe_and_get_wallet(body.message, body.signature)
    token = issue_backend_jwt(wallet_address)
    return VerifyResponse(token=token, wallet_address=wallet_address)
