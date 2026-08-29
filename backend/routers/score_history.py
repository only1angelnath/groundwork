"""
GET /api/score-history/{wallet}

    -> [{ score, collateral_ratio_bps, recorded_at }, ...]

Per build-roadmap.md's interface contract — drives both the frontend's
chart and the tower's block count (Phase 4). Reads score_history via a
wallet-scoped Supabase client; RLS enforces the wallet isolation, the
{wallet} == JWT check below just gives a clean 403 instead of a silent
empty list for a mismatched request.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_wallet
from db import get_client_for_wallet

router = APIRouter(prefix="/api", tags=["score-history"])


@router.get("/score-history/{wallet}")
def get_score_history(wallet: str, current_wallet: str = Depends(get_current_wallet)) -> list:
    if wallet.lower() != current_wallet.lower():
        raise HTTPException(status_code=403, detail="Cannot view another wallet's score history")

    client = get_client_for_wallet(current_wallet)
    result = (
        client.table("score_history")
        .select("score,collateral_ratio,recorded_at")
        .eq("wallet_address", current_wallet)
        .order("recorded_at", desc=False)
        .execute()
    )

    return [
        {
            "score": row["score"],
            "collateral_ratio_bps": row["collateral_ratio"],
            "recorded_at": row["recorded_at"],
        }
        for row in result.data
    ]
