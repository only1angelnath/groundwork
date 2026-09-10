// Mirrors backend/uploads.py's allowlist and size cap. The backend is the
// real enforcement point (this is a convenience layer only) — if that
// allowlist ever changes, update this too, or a rejected upload will only
// be caught server-side instead of with an immediate inline message.

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

export const ALLOWED_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,application/pdf";

export const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const UPLOAD_HELP_TEXT = `Images (JPG, PNG, WEBP, HEIC) or PDF, up to ${MAX_UPLOAD_MB}MB.`;

/**
 * Client-side pre-check only — the backend re-validates independently
 * (backend/uploads.py) and is the actual enforcement point. This just
 * gives an immediate, specific message instead of a round trip that ends
 * in a raw 400.
 */
export function validateUploadFile(file: File): string | null {
  if (
    !ALLOWED_UPLOAD_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number]
    )
  ) {
    return `Unsupported file type. ${UPLOAD_HELP_TEXT}`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File too large — max ${MAX_UPLOAD_MB}MB.`;
  }
  return null;
}
