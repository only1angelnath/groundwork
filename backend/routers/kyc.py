"""
Mocked KYC gate — Phase 8 (BUIDL CTC 2026 Fall).

Not a real identity-verification integration. Civic was ruled out in
Phase 6 (not free, zero budget — see docs/HANDOFFphase6.md). This is a
fully free, honestly-labeled simulated flow instead: it collects the
fields a real KYC provider would (including an uploaded ID document,
stored privately, mirroring bill-documents' bucket pattern), gates
/upload and /borrow the same way a real one would, and is documented
plainly as simulated everywhere it's shown. Approval is instant and
unconditional — there is no actual identity check happening anywhere in
this module.

    GET  /api/kyc/status/{wallet_address}  -> {verified, submitted_at}
    POST /api/kyc/submit                   -> {status: "verified"}

/status is deliberately a public, no-auth read — it exposes nothing but a
boolean (plus a timestamp) per wallet, no more sensitive than the score
that's already public on-chain via CreditVault.scoreOf. That's what lets
/upload and /borrow gate on it without forcing a SIWE sign-in just to
*check* status. Submitting DOES require SIWE (get_current_wallet) — that's
what proves the caller actually controls the wallet the (mocked) identity
is being attached to.

/submit is multipart (Form + File), not JSON — the ID document upload
forces that shape, same as bills.py's upload_bill_document.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from auth import get_current_wallet
from db import get_service_client

router = APIRouter(prefix="/api/kyc", tags=["kyc"])

BUCKET = "kyc-documents"


@router.get("/status/{wallet_address}")
def get_kyc_status(wallet_address: str) -> dict:
    client = get_service_client()
    result = (
        client.table("kyc_submissions")
        .select("verified, submitted_at")
        .eq("wallet_address", wallet_address.lower())
        .execute()
    )
    row = result.data[0] if result.data else None
    return {
        "verified": bool(row and row["verified"]),
        "submitted_at": row["submitted_at"] if row else None,
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

    client.table("kyc_submissions").upsert(
        {
            "wallet_address": wallet,
            "full_name": full_name,
            "date_of_birth": date_of_birth,
            "country": country,
            "id_type": id_type,
            "id_document_path": storage_path,
            "verified": True,
        },
        on_conflict="wallet_address",
    ).execute()

    return {"status": "verified"}
