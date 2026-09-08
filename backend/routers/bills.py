"""
Bill upload + validator review routes — Phase 6.5 (validator/upload system).

    POST /api/bills/{bill_id}/upload   -> {status, storage_path}
    GET  /api/bills/mine               -> [{bill_id, claimed_amount, status, submitted_at, document_url}, ...]
    GET  /api/validator/all-bills      -> [{bill_id, payer, claimed_amount, status, submitted_at, document_url}, ...]

All three require the existing SIWE-issued JWT (auth.get_current_wallet) —
reused here even though Phase 5's dashboard deliberately skipped it (see
docs/HANDOFFphase5.md), since these routes need real wallet-ownership
proof that can't be done client-side: upload requires proving you're the
bill's actual on-chain payer, review requires proving you're the one
hardcoded validator address, and "mine" requires proving which wallet is
asking.

BillValidator's own bills/getPendingBillIds/nextBillId are the source of
truth for who submitted what and its real status — bill_submissions only
ever stores the uploaded document's location and a copy of its hash,
exactly what the chain doesn't hold. /api/validator/all-bills and
/api/bills/mine deliberately share one underlying scan (every bill_id from
0..nextBillId) rather than each maintaining separate pending/history
logic, so the validator's pending queue, the validator's review history,
and a submitter's own status view can never drift out of sync with each
other — they're the same data filtered three different ways.
"""
from __future__ import annotations

import hashlib
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth import get_current_wallet
from chain_bills import ZERO_ADDRESS, get_bill, get_next_bill_id, get_validator_address
from db import get_service_client
from telegram_notify import notify_validator

router = APIRouter(prefix="/api", tags=["bills"])

BUCKET = "bill-documents"
SIGNED_URL_TTL_SECONDS = 300

STATUS_LABELS = {0: "pending", 1: "approved", 2: "rejected"}


def _document_url(client, bill_id: int) -> str | None:
    row_result = client.table("bill_submissions").select("storage_path").eq("bill_id", bill_id).execute()
    row = row_result.data[0] if row_result.data else None
    if not row:
        return None
    signed = client.storage.from_(BUCKET).create_signed_url(row["storage_path"], SIGNED_URL_TTL_SECONDS)
    return signed.get("signedURL") or signed.get("signed_url")


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

    from_wei_amount = bill["claimed_amount"] / 1e18
    notify_validator(
        f"📄 New bill submitted for review — Bill #{bill_id}, "
        f"~{from_wei_amount:.4f} tCTC claimed by {current_wallet.lower()}.\n"
        f"Review: {os.environ.get('PUBLIC_FRONTEND_URL', '')}/validator"
    )

    return {"status": "uploaded", "storage_path": storage_path}


@router.get("/bills/mine")
def list_my_bills(current_wallet: str = Depends(get_current_wallet)) -> list:
    """Every bill the signed-in wallet has ever submitted, with its real
    on-chain status — pending/approved/rejected never has to be guessed
    or mirrored, since this reads straight off BillValidator.bills."""
    client = get_service_client()
    results = []
    for bill_id in range(get_next_bill_id()):
        bill = get_bill(bill_id)
        if bill["payer"] != current_wallet.lower():
            continue
        results.append(
            {
                "bill_id": bill_id,
                "claimed_amount": str(bill["claimed_amount"]),
                "status": STATUS_LABELS[bill["status"]],
                "submitted_at": bill["submitted_at"],
                "document_url": _document_url(client, bill_id),
            }
        )
    return results


@router.get("/validator/all-bills")
def list_all_bills(current_wallet: str = Depends(get_current_wallet)) -> list:
    """Every bill ever submitted, any status. The frontend splits this into
    a pending queue and a per-wallet review history — both views come from
    this one endpoint so they can't disagree with each other."""
    if current_wallet.lower() != get_validator_address():
        raise HTTPException(status_code=403, detail="Caller is not the authorized validator")

    client = get_service_client()
    results = []
    for bill_id in range(get_next_bill_id()):
        bill = get_bill(bill_id)
        results.append(
            {
                "bill_id": bill_id,
                "payer": bill["payer"],
                "claimed_amount": str(bill["claimed_amount"]),
                "status": STATUS_LABELS[bill["status"]],
                "submitted_at": bill["submitted_at"],
                "document_url": _document_url(client, bill_id),
            }
        )
    return results


