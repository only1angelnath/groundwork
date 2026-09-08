"""
Telegram push notification for the validator — Phase 8 follow-up #4.

Pings the validator's Telegram chat whenever a new bill or KYC submission
needs review, so they don't have to keep /validator open and polling.
Uses the plain Bot API directly (no external SDK) via a single POST to
sendMessage.

Setup (one-time, do this yourself — not something this code can do for
you):
  1. Message @BotFather on Telegram, send /newbot, follow the prompts.
     You get a bot token like "123456:ABC-DEF...".
  2. Message your new bot anything once (bots can't message you first).
  3. Get your chat_id: message @userinfobot, or open
     https://api.telegram.org/bot<token>/getUpdates after step 2 and read
     "chat":{"id": ...} from the response.
  4. Set TELEGRAM_BOT_TOKEN and TELEGRAM_VALIDATOR_CHAT_ID in Render's env
     vars (and your local .env for testing) to those two values.

Fails silently (logged, never raised) — a missed push should never block
the actual submission from succeeding. The validator can always still
find anything pending by visiting /validator directly; this is a
convenience nudge, not the source of truth.
"""
from __future__ import annotations

import logging
import os

import requests

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_VALIDATOR_CHAT_ID = os.environ.get("TELEGRAM_VALIDATOR_CHAT_ID")


def notify_validator(message: str) -> None:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_VALIDATOR_CHAT_ID:
        logger.warning("Telegram push skipped: TELEGRAM_BOT_TOKEN/TELEGRAM_VALIDATOR_CHAT_ID not set")
        return
    try:
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_VALIDATOR_CHAT_ID, "text": message},
            timeout=5,
        )
    except requests.RequestException:
        logger.exception("Failed to send Telegram push to validator")
