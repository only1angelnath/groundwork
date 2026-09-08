"""
Mocked KYC gate — Phase 8 (BUIDL CTC 2026 Fall), review step added in
Phase 8 follow-up #2.

Not a real identity-verification integration. Civic was ruled out in
Phase 6 (not free, zero budget — see docs/HANDOFFphase6.md). This is a
fully free, honestly-labeled simulated flow instead: it collects the
fields a real KYC provider would (including an uploaded ID document,
stored privately, mirroring bill-documents' bucket pattern), gates
/upload and /borrow the same way a real one would, and is documented
plainly as simulated everywhere it's shown. There is no actual identity
check happening anywhere in this module — but unlike the first version,
approval is no longer instant/unconditional: it now requires the same
single hardcoded validator (BillValidator.validator(), see chain_bills.py)
to approve or reject it, same as bill submissions already require.

    GET  /api/kyc/status/{wallet_address}        -> {status, submitted_at, reviewed_at, rejection_reason}
    POST /api/kyc/submit                          -> {status: "pending"}
    GET  /api/kyc/validator/all-submissions        -> validator-only, every submission
    POST /api/kyc/validator/{wallet_address}/review -> validator-only, {approve: bool, reason?: str}

/status is deliberately a public, no-auth read — it exposes nothing but a
status string and two timestamps per wallet, no more sensitive than the
score that's already public on-chain via CreditVault.scoreOf. That's what
lets /upload and /borrow gate on it without forcing a SIWE sign-in just to
*check* status. Submitting and reviewing both require SIWE
(get_current_wallet) — submitting proves the caller controls the wallet
the (mocked) identity is attached to, reviewing proves the caller is the
one authorized validator.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_wallet
from chain_bills import get_validator_address
from db import get_service_client
from notifications import create_notification
from telegram_notify import notify_validator

router = APIRouter(prefix="/api/kyc", tags=["kyc"])

BUCKET = "kyc-documents"
SIGNED_URL_TTL_SECONDS = 300


def _document_url(client, storage_path: str | None) -> str | None:
    if not storage_path:
        return None
    signed = client.storage.from_(BUCKET).create_signed_url(storage_path, SIGNED_URL_TTL_SECONDS)
    return signed.get("signedURL") or signed.get("signed_url")


@router.get("/status/{wallet_address}")
def get_kyc_status(wallet_address: str) -> dict:
    client = get_service_client()
    result = (
        client.table("kyc_submissions")
        .select("status, submitted_at, reviewed_at, rejection_reason")
        .eq("wallet_address", wallet_address.lower())
        .execute()
    )
    row = result.data[0] if result.data else None
    if not row:
        return {"status": "none", "submitted_at": None, "reviewed_at": None, "rejection_reason": None}
    return {
        "status": row["status"],
        "submitted_at": row["submitted_at"],
        "reviewed_at": row["reviewed_at"],
        "rejection_reason": row["rejection_reason"],
    }


@router.post("/submit")
async def submit_kyc(
    full_name: str = Form(..., min_length=1, max_length=200),
    date_of_birth: str = Form(...),
    country: str = Form(..., min_length=1, max_length=100),
    id_type: str = Form(..., min_length=1, max_length=50),
    id_document: UploadFile = File(...),
    current_wallet: str = Depends(get_current_wallet),
) -> dict:
    try:
        date.fromisoformat(date_of_birth)
    except ValueError:
        raise HTTPException(status_code=400, detail="date_of_birth must be YYYY-MM-DD")

    contents = await id_document.read()
    if not contents:
        raise HTTPException(status_code=400, detail="ID document is empty")

    wallet = current_wallet.lower()
    storage_path = f"{wallet}/{id_document.filename}"

    client = get_service_client()
    client.storage.from_(BUCKET).upload(
        storage_path,
        contents,
        {
            "content-type": id_document.content_type or "application/octet-stream",
            "upsert": "true",
        },
    )

    # A resubmission (e.g. after rejection) goes back to pending and clears
    # any prior review — it's a fresh submission, not an amendment.
    client.table("kyc_submissions").upsert(
        {
            "wallet_address": wallet,
            "full_name": full_name,
            "date_of_birth": date_of_birth,
            "country": country,
            "id_type": id_type,
            "id_document_path": storage_path,
            "status": "pending",
            "reviewed_at": None,
            "rejection_reason": None,
        },
        on_conflict="wallet_address",
    ).execute()

    create_notification(
        get_validator_address(),
        "kyc_submitted",
        f"New identity verification submitted by {wallet}.",
        reference_id=wallet,
    )

    notify_validator(
        f"🪪 New KYC submission from {wallet} — {full_name}.\n"
        f"Review: {os.environ.get('PUBLIC_FRONTEND_URL', '')}/validator"
    )

    return {"status": "pending"}


@router.get("/validator/all-submissions")
def list_all_kyc_submissions(current_wallet: str = Depends(get_current_wallet)) -> list:
    """Every KYC submission, any status — the frontend splits this into a
    pending queue and a review history, mirroring /api/validator/all-bills
    in routers/bills.py so both review surfaces work the same way."""
    if current_wallet.lower() != get_validator_address():
        raise HTTPException(status_code=403, detail="Caller is not the authorized validator")

    client = get_service_client()
    result = (
        client.table("kyc_submissions")
        .select("wallet_address, full_name, date_of_birth, country, id_type, id_document_path, status, submitted_at, reviewed_at, rejection_reason")
        .order("submitted_at", desc=True)
        .execute()
    )
    return [
        {
            "wallet_address": row["wallet_address"],
            "full_name": row["full_name"],
            "date_of_birth": row["date_of_birth"],
            "country": row["country"],
            "id_type": row["id_type"],
            "document_url": _document_url(client, row["id_document_path"]),
            "status": row["status"],
            "submitted_at": row["submitted_at"],
            "reviewed_at": row["reviewed_at"],
            "rejection_reason": row["rejection_reason"],
        }
        for row in result.data
    ]


class KycReview(BaseModel):
    approve: bool
    reason: str | None = None


@router.post("/validator/{wallet_address}/review")
def review_kyc(
    wallet_address: str,
    payload: KycReview,
    current_wallet: str = Depends(get_current_wallet),
) -> dict:
    if current_wallet.lower() != get_validator_address():
        raise HTTPException(status_code=403, detail="Caller is not the authorized validator")
    if not payload.approve and not (payload.reason and payload.reason.strip()):
        raise HTTPException(status_code=400, detail="A rejection reason is required")

    client = get_service_client()
    result = (
        client.table("kyc_submissions")
        .update(
            {
                "status": "approved" if payload.approve else "rejected",
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "rejection_reason": None if payload.approve else payload.reason.strip(),
            }
        )
        .eq("wallet_address", wallet_address.lower())
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No KYC submission found for this wallet")

    final_status = result.data[0]["status"]
    create_notification(
        wallet_address,
        f"kyc_{final_status}",
        "Your identity verification was approved."
        if payload.approve
        else f"Your identity verification was rejected: {payload.reason.strip()}",
    )
    return {"status": final_status}
