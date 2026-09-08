"""
Notification trigger for on-chain bill review — Phase 8 follow-up #3.

Bill approve/reject happens as a direct on-chain tx from the validator's
wallet (BillValidator.approveBill/rejectBill, called straight from
frontend/app/validator/page.tsx) — the backend never sees that
transaction happen. This route lets the frontend tell the backend "this
bill was just reviewed" *after* the tx confirms, so a notification can be
written for the payer. The bill's real payer and status are re-read
from-chain here rather than trusted from the request body, so a
notification can never be spoofed for a bill that wasn't actually
reviewed, or attributed to the wrong wallet.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_wallet
from chain_bills import get_bill, get_validator_address
from notifications import create_notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

STATUS_LABELS = {0: "pending", 1: "approved", 2: "rejected"}


class BillReviewedNotice(BaseModel):
    bill_id: int
    reason: str | None = None


@router.post("/bill-reviewed")
def notify_bill_reviewed(
    payload: BillReviewedNotice,
    current_wallet: str = Depends(get_current_wallet),
) -> dict:
    if current_wallet.lower() != get_validator_address():
        raise HTTPException(status_code=403, detail="Caller is not the authorized validator")

    bill = get_bill(payload.bill_id)
    status = STATUS_LABELS[bill["status"]]
    if status == "pending":
        raise HTTPException(status_code=400, detail="Bill has not actually been reviewed yet")

    reason = (payload.reason or "").strip()
    message = (
        f"Bill #{payload.bill_id} was approved."
        if status == "approved"
        else f"Bill #{payload.bill_id} was rejected" + (f": {reason}" if reason else ".")
    )
    create_notification(bill["payer"], f"bill_{status}", message, reference_id=str(payload.bill_id))
    return {"status": "notified"}
