"""
Bill upload + validator review routes — Phase 6.5 (validator/upload system).

    POST /api/bills/{bill_id}/upload      -> {status, storage_path}
    GET  /api/validator/pending-bills     -> [{bill_id, payer, claimed_amount, submitted_at, document_url}, ...]

Both require the existing SIWE-issued JWT (auth.get_current_wallet) —
reused here even though Phase 5's dashboard deliberately skipped it (see
docs/HANDOFFphase5.md), since these two routes need real wallet-ownership
proof that can't be done client-side: upload requires proving you're the
bill's actual on-chain payer, review requires proving you're the one
hardcoded validator address.

BillValidator's own bills/getPendingBillIds are the source of truth for
who submitted what and what's still pending — bill_submissions only ever
stores the uploaded document's location and a copy of its hash, exactly
what the chain doesn't hold.
"""
from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth import get_current_wallet
from chain_bills import ZERO_ADDRESS, get_bill, get_pending_bill_ids, get_validator_address
from db import get_service_client

router = APIRouter(prefix="/api", tags=["bills"])

BUCKET = "bill-documents"
SIGNED_URL_TTL_SECONDS = 300


@router.post("/bills/{bill_id}/upload")
async def upload_bill_document(
    bill_id: int,
    file: UploadFile = File(...),
    current_wallet: str = Depends(get_current_wallet),
) -> dict:
    bill = get_bill(bill_id)
    if bill["payer"] == ZERO_ADDRESS:
        raise HTTPException(status_code=404, detail="Bill does not exist on-chain")
    if bill["payer"] != current_wallet.lower():
        raise HTTPException(status_code=403, detail="Caller is not this bill's submitter")

    contents = await file.read()
    computed_hash = "0x" + hashlib.sha256(contents).hexdigest()
    if computed_hash != bill["document_hash"]:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file does not match the document hash submitted on-chain",
        )

    storage_path = f"{bill_id}/{file.filename}"
    client = get_service_client()
    client.storage.from_(BUCKET).upload(
        storage_path,
        contents,
        {"content-type": file.content_type or "application/octet-stream", "upsert": "true"},
    )

    client.table("bill_submissions").upsert(
        {
            "bill_id": bill_id,
            "wallet_address": current_wallet.lower(),
            "storage_path": storage_path,
            "document_hash": computed_hash,
            "claimed_amount": bill["claimed_amount"],
        },
        on_conflict="bill_id",
    ).execute()

    return {"status": "uploaded", "storage_path": storage_path}


@router.get("/validator/pending-bills")
def list_pending_bills(current_wallet: str = Depends(get_current_wallet)) -> list:
    if current_wallet.lower() != get_validator_address():
        raise HTTPException(status_code=403, detail="Caller is not the authorized validator")

    client = get_service_client()
    pending_ids = get_pending_bill_ids()

    results = []
    for bill_id in pending_ids:
        bill = get_bill(bill_id)

        row_result = (
            client.table("bill_submissions").select("storage_path").eq("bill_id", bill_id).execute()
        )
        row = row_result.data[0] if row_result.data else None

        document_url = None
        if row:
            signed = client.storage.from_(BUCKET).create_signed_url(row["storage_path"], SIGNED_URL_TTL_SECONDS)
            # supabase-py's create_signed_url return shape has shifted between
            # versions ("signedURL" vs "signed_url") — check both defensively
            # rather than assuming; verify the real key by testing this route
            # once deployed and adjust if neither matches.
            document_url = signed.get("signedURL") or signed.get("signed_url")

        results.append(
            {
                "bill_id": bill_id,
                "payer": bill["payer"],
                "claimed_amount": bill["claimed_amount"],
                "submitted_at": bill["submitted_at"],
                "document_url": document_url,
            }
        )

    return results
