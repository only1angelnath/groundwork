"""
Read-only CreditVault reads — Phase 3.

The dashboard endpoint reads score/collateral_ratio/loan_eligible live from
CreditVault on Creditcoin CC3 Testnet rather than trusting the Supabase
score_history mirror, since CreditVault is the actual source of truth (the
mirror exists for the frontend's Realtime feed in Phase 4, not as an
authoritative read path — see worker/supabase_client.py's docstring).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from web3 import Web3

CREDITCOIN_TESTNET_RPC_URL = os.environ["CREDITCOIN_TESTNET_RPC_URL"]
CREDIT_VAULT_ADDRESS = Web3.to_checksum_address(os.environ["CREDIT_VAULT_ADDRESS"])

_ABI_PATH = Path(__file__).resolve().parent.parent / "shared" / "abis" / "CreditVault.json"

_w3 = Web3(Web3.HTTPProvider(CREDITCOIN_TESTNET_RPC_URL))
with open(_ABI_PATH) as _f:
    _creditvault_abi = json.load(_f)
_creditvault = _w3.eth.contract(address=CREDIT_VAULT_ADDRESS, abi=_creditvault_abi)


def get_vault_state(wallet_address: str) -> dict:
    """Returns {score, collateral_ratio_bps, loan_eligible} read live from
    CreditVault. loan_eligible is inferred as "has ever had a verified
    payment" (score > 0) — adjust here if CreditVault later exposes a
    dedicated eligibility view function, rather than guessing at one now.
    """
    checksummed = Web3.to_checksum_address(wallet_address)
    score = _creditvault.functions.scoreOf(checksummed).call()
    collateral_ratio_bps = _creditvault.functions.requiredCollateralRatioOf(checksummed).call()
    return {
        "score": score,
        "collateral_ratio_bps": collateral_ratio_bps,
        "loan_eligible": score > 0,
    }
