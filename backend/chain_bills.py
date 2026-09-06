"""
Read-only BillValidator reads — Phase 6.5 (validator/upload system).

Mirrors chain.py's pattern exactly: BillValidator's own `bills` mapping and
`getPendingBillIds()` are the source of truth for submission status, not
any Supabase mirror. bill_submissions (see supabase/migrations/0007_*.sql)
only ever stores what the chain can't hold — the uploaded document's
storage path and a copy of its hash.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from web3 import Web3

CREDITCOIN_TESTNET_RPC_URL = os.environ["CREDITCOIN_TESTNET_RPC_URL"]
BILL_VALIDATOR_ADDRESS = Web3.to_checksum_address(os.environ["BILL_VALIDATOR_ADDRESS"])

_ABI_PATH = Path(__file__).resolve().parent.parent / "shared" / "abis" / "BillValidator.json"

_w3 = Web3(Web3.HTTPProvider(CREDITCOIN_TESTNET_RPC_URL))
with open(_ABI_PATH) as _f:
    _billvalidator_abi = json.load(_f)
_billvalidator = _w3.eth.contract(address=BILL_VALIDATOR_ADDRESS, abi=_billvalidator_abi)

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


def get_validator_address() -> str:
    """The single hardcoded validator address (BillValidator.validator()),
    lowercased for comparison against get_current_wallet's JWT claim."""
    return _billvalidator.functions.validator().call().lower()


def get_pending_bill_ids() -> list[int]:
    return list(_billvalidator.functions.getPendingBillIds().call())


def get_next_bill_id() -> int:
    """Total number of bills ever submitted — every valid bill_id is in
    range(get_next_bill_id())."""
    return _billvalidator.functions.nextBillId().call()


def get_bill(bill_id: int) -> dict:
    """Returns {payer, claimed_amount, document_hash, submitted_at, status}.
    status: 0=Pending, 1=Approved, 2=Rejected (BillValidator.Status enum
    order). payer is ZERO_ADDRESS if bill_id was never submitted.
    document_hash is returned 0x-prefixed hex, matching what the frontend
    computes client-side (crypto.subtle.digest) and what the upload route
    recomputes server-side.
    """
    payer, claimed_amount, document_hash, submitted_at, status = _billvalidator.functions.bills(bill_id).call()
    return {
        "payer": payer.lower(),
        "claimed_amount": claimed_amount,
        "document_hash": "0x" + document_hash.hex(),
        "submitted_at": submitted_at,
        "status": status,
    }
