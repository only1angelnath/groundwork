"""
GET /api/dashboard/{wallet}

    -> { score: int, collateral_ratio_bps: int, loan_eligible: bool, recent_bills: [...] }

Per build-roadmap.md's interface contract. score/collateral_ratio_bps/
loan_eligible come live from CreditVault (chain.py); recent_bills comes from
Supabase's bill_events via a wallet-scoped client, so RLS is the actual
enforcement of "you can only see your own bills" — the {wallet} path param
matching the caller's JWT is checked explicitly too, for a clear 403 rather
than a silently-empty result if someone requests a wallet that isn't theirs.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_wallet
from chain import get_vault_state
from db import get_client_for_wallet

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/{wallet}")
def get_dashboard(wallet: str, current_wallet: str = Depends(get_current_wallet)) -> dict:
    if wallet.lower() != current_wallet.lower():
        raise HTTPException(status_code=403, detail="Cannot view another wallet's dashboard")

    vault_state = get_vault_state(wallet)

    client = get_client_for_wallet(current_wallet)
    result = (
        client.table("bill_events")
        .select("sepolia_tx_hash,payee,amount,status,creditcoin_tx_hash,created_at")
        .eq("wallet_address", current_wallet)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )

    return {**vault_state, "recent_bills": result.data}
