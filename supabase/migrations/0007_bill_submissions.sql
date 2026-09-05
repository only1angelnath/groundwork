-- Phase 6.5 (validator/upload system): bill_submissions table + private
-- storage bucket for uploaded bill documents.
--
-- Deliberately no status column: BillValidator.bills(billId) on-chain is
-- the source of truth for pending/approved/rejected, same principle as
-- CreditVault being the source of truth for score/collateral_ratio rather
-- than the score_history mirror. This table only stores what the chain
-- can't hold — the uploaded document's location and a copy of its hash.
create table if not exists public.bill_submissions (
  bill_id bigint primary key,
  wallet_address text not null,
  storage_path text not null,
  document_hash text not null,
  claimed_amount numeric not null,
  uploaded_at timestamptz not null default now()
);

alter table public.bill_submissions enable row level security;
-- No policies added, intentionally. Unlike bill_events/score_history (which
-- have anon/authenticated SELECT policies because that data is already
-- public on-chain), this table links a wallet to a private document path.
-- It's only ever read/written by the backend's service-role client
-- (see backend/routers/bills.py) — with zero policies and RLS enabled,
-- anon and authenticated roles are denied entirely, which is what makes
-- the "private bucket, signed URLs only via the validator's authenticated
-- session" design actually hold.

insert into storage.buckets (id, name, public)
values ('bill-documents', 'bill-documents', false)
on conflict (id) do nothing;
-- No storage.objects policies added for this bucket either, same
-- reasoning as above — RLS is enabled by default on storage.objects, so
-- zero policies means only the service-role key (bypasses RLS) can
-- read/write objects here. That's what backend/routers/bills.py's
-- create_signed_url call relies on.
