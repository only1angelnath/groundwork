"""
Groundwork API entrypoint — Phase 3 added the core auth/dashboard/score-history
routes, extended Phase 8 with the mocked KYC gate, extended Phase 8
follow-up #3 with in-app notifications.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # local dev convenience only; Render sets real env vars directly

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, bills, dashboard, kyc, notifications, score_history

app = FastAPI(title="Groundwork API")

_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    # Every route in this API is GET or POST — no PUT/PATCH/DELETE exists
    # anywhere in routers/, so there's nothing gained by allowing the rest.
    allow_methods=["GET", "POST"],
    # Authorization carries the SIWE-issued bearer token; Content-Type is
    # needed for both JSON bodies and multipart file uploads.
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(score_history.router)
app.include_router(bills.router)
app.include_router(kyc.router)
app.include_router(notifications.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
