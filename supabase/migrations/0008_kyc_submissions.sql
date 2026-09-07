-- Mocked KYC submissions — Phase 8 (BUIDL CTC 2026 Fall).
--
-- Not a real identity-verification integration. Civic was ruled out in
-- Phase 6 (not free, zero budget — see docs/HANDOFFphase6.md). This table
-- backs a fully free, honestly-labeled simulated flow: it collects the
-- fields a real KYC provider would, and approval is instant and
-- unconditional (see backend/routers/kyc.py) — there is no real identity
-- check happening anywhere in this stack.
--
-- Deliberately stores only id_last4, never a full ID number, even though
-- this is mocked data — keeping the "simulated" honesty consistent all
-- the way down to what's retained.
create table if not exists kyc_submissions (
  wallet_address text primary key,
  full_name text not null,
  date_of_birth date not null,
  country text not null,
  id_type text not null,
  id_last4 text not null,
  verified boolean not null default true,
  submitted_at timestamptz not null default now()
);

alter table kyc_submissions enable row level security;

-- No policies added, deliberately. This table is only ever read/written
-- via the backend's service-role client (see backend/routers/kyc.py),
-- mirroring bill-documents' storage bucket pattern (service-role only,
-- see supabase/migrations/0007_bill_submissions.sql). With RLS enabled
-- and zero policies, PostgREST denies all anon/authenticated-key access
-- by default, even if one of those keys ever ended up in frontend code.
