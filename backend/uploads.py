"""
Shared upload validation — bill documents and KYC ID documents both need the
same protections:

  1. Reject anything that isn't an image or PDF. A stored HTML/SVG file
     served back later via a signed URL to the validator reviewing it would
     be a stored-XSS vector against this system's single highest-privilege
     account, so the check is on the declared content-type against a fixed
     allowlist, not the client-supplied filename's extension.
  2. Cap the upload size, since UploadFile.read() has no default limit.
  3. Never derive the storage path from a client-supplied filename — it can
     carry path-traversal characters or a misleading extension. The path is
     always server-controlled prefix parts (bill_id, wallet address) plus a
     random filename component.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, UploadFile

ALLOWED_CONTENT_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "application/pdf": ".pdf",
}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB — generous for a phone photo or a scanned PDF


def safe_extension(content_type: str | None) -> str:
    """Raises 400 if content_type isn't in the allowlist; otherwise returns
    the fixed extension for it.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{content_type}'. Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )
    return ALLOWED_CONTENT_TYPES[content_type]


async def read_and_validate_upload(file: UploadFile) -> tuple[bytes, str]:
    """Validates content-type against the allowlist, reads the file, and
    enforces the size cap. Returns (contents, extension). Raises
    HTTPException(400) for an empty or disallowed file, HTTPException(413)
    for an oversized one.
    """
    extension = safe_extension(file.content_type)
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large — max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    return contents, extension


def generate_storage_path(extension: str, *prefix_parts: str) -> str:
    """Builds a storage path from server-controlled prefix parts (bill_id,
    wallet address — never a client-supplied filename) plus a random
    filename component, so nothing about the stored path is attacker-chosen.
    """
    return "/".join([*prefix_parts, f"{uuid.uuid4().hex}{extension}"])
