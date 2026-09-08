"""
Shared helper for writing in-app notifications — Phase 8 follow-up #3.

Notifications are written only by the backend's service-role client
(routers/kyc.py on KYC review, routers/notifications.py on bill review)
and read by the frontend directly via Supabase (anon SELECT + Realtime),
same pattern already used for score_history/bill_events. See
supabase/migrations/0011_notifications.sql for the RLS reasoning.
"""
from __future__ import annotations

from db import get_service_client


def create_notification(
    wallet_address: str,
    notif_type: str,
    message: str,
    reference_id: str | None = None,
) -> None:
    client = get_service_client()
    client.table("notifications").insert(
        {
            "wallet_address": wallet_address.lower(),
            "type": notif_type,
            "message": message,
            "reference_id": reference_id,
        }
    ).execute()
