// Base URL of the FastAPI backend (Render). Only used by the upload and
// validator pages — the dashboard deliberately reads on-chain/Supabase
// directly instead (see docs/HANDOFFphase5.md's "Dashboard reads
// score/collateral directly on-chain" decision). These two new pages are
// the first frontend code to actually call the backend's SIWE-gated
// routes.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://groundwork-web-service.onrender.com";
