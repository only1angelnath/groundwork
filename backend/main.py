"""
Groundwork API — Phase 3.

Route stubs only during Phase 0/1; implemented once the Supabase schema
and worker are writing real data (Phase 3).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Groundwork API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # replace via CORS_ALLOWED_ORIGINS in Phase 3
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
