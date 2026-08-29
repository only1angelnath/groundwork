"""
Supabase client — Phase 3.

Two distinct clients, deliberately not interchangeable:

  get_service_client() — service-role key, bypasses RLS. Kept available for
    admin/ops-style needs only. Route handlers should almost never use this:
    every user-facing read should go through RLS as the real access-control
    boundary, not app-code discipline.

  get_client_for_wallet(wallet_address) — anon key + a backend-issued JWT
    (see auth.py) carrying that wallet's address as a custom claim. This is
    what every route handler uses: RLS then enforces per-wallet isolation at
    the database layer, which is what build-roadmap.md's testing strategy
    calls out as the one bug class worth real pytest coverage ("RLS
    actually blocks cross-wallet reads").
"""
from __future__ import annotations

import os

from supabase import Client, create_client

from auth import issue_backend_jwt

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]


def get_service_client() -> Client:
    """Service-role client — bypasses RLS. Avoid using this for any
    per-wallet data read; it exists for admin/ops tooling, not route
    handlers.
    """
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_client_for_wallet(wallet_address: str) -> Client:
    """anon-key client authenticated as `wallet_address` via a backend-issued
    JWT. RLS policies on bill_events/score_history (see
    supabase/migrations/0001_bill_events_and_score_history.sql) restrict
    reads to rows matching this wallet — this is the real access-control
    boundary, not an app-code check.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    token = issue_backend_jwt(wallet_address)
    client.postgrest.auth(token)
    return client
