"""
Groundwork API — Phase 3.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # local dev convenience only; Render sets real env vars directly

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, dashboard, score_history

app = FastAPI(title="Groundwork API")

_allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(score_history.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
