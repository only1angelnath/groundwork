"""
Local last-scanned-block tracking — Phase 2.

This is the *cheap* restart-safety layer: it tells the listener where to
resume scanning Sepolia from so a restart doesn't re-scan the entire chain
history. It is NOT the source of truth for "has this specific event been
processed" — that's supabase_client.py's bill_events check, since a local
file is lost on Render's ephemeral filesystem across deploys (not across
plain restarts, but deploys do wipe it). Losing this file just means one
extra re-scan of already-processed blocks, which the Supabase check then
skips cheaply — losing the Supabase table would mean actual duplicate
submissions, which is why that's the real guard.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger("groundwork.worker.state")

_STATE_PATH_ENV = os.environ.get("LISTENER_STATE_PATH", "").strip()
_STATE_PATH = Path(_STATE_PATH_ENV) if _STATE_PATH_ENV else Path(__file__).resolve().parent / "last_block.json"


def load_last_scanned_block() -> Optional[int]:
    if not _STATE_PATH.exists():
        return None
    try:
        with open(_STATE_PATH) as f:
            data = json.load(f)
        return int(data["last_scanned_block"])
    except (json.JSONDecodeError, KeyError, ValueError, OSError) as exc:
        logger.warning("Could not read state file at %s (%s) — will fall back to START_BLOCK", _STATE_PATH, exc)
        return None


def save_last_scanned_block(block_number: int) -> None:
    tmp_path = _STATE_PATH.with_suffix(".tmp")
    try:
        with open(tmp_path, "w") as f:
            json.dump({"last_scanned_block": block_number}, f)
        tmp_path.replace(_STATE_PATH)  # atomic on POSIX, avoids a torn write on crash mid-write
    except OSError as exc:
        logger.warning("Could not persist state file at %s (%s) — next restart will re-scan further back", _STATE_PATH, exc)