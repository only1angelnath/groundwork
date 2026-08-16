"""
Attestcoin Protocol Prover REST API client — Phase 2.

Wraps PROVER_API_URL with `requests` (no official Python SDK exists yet;
the official @gluwa/usc-sdk is JS/TypeScript-only, so this talks to the
same underlying REST API directly).
"""

def get_proof(tx_hash: str) -> dict:
    raise NotImplementedError("Implement in Phase 2.")
