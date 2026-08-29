-- Groundwork — Phase 3 schema.
--
-- Two tables, matching the shapes worker/supabase_client.py already writes to
-- (fail-soft, since this migration didn't exist yet when that code was written):
--
--   bill_events    — one row per Sepolia BillPaid event, tracking it through
--                     the attestation pipeline (pending -> proof_fetched ->
--                     verified | failed). Worker upserts via service-role key
--                     (bypasses RLS by design, per build-roadmap.md's
--                     interface contract).
--   score_history  — one row per CreditVault score update, mirrored from
--                     on-chain state for the frontend's Supabase Realtime
--                     feed (Phase 4) so it doesn't need its own indexer.
--
-- RLS: each wallet can only read its own rows. Identity comes from a
-- backend-issued JWT (see backend/auth.py) carrying a `wallet_address`
-- custom claim, signed with the project's JWT secret — Supabase's PostgREST
-- validates any JWT signed with that secret and exposes its claims via
-- auth.jwt(), so this works without needing Supabase's own user/auth system.
-- The worker's service-role key bypasses RLS entirely, as intended.

-- ============================================================================
-- bill_events
-- ============================================================================

create table if not exists public.bill_events (
  id                bigint generated always as identity primary key,
  sepolia_tx_hash   text not null,
  wallet_address    text not null,
  payee             text not null,
  amount            numeric not null,  -- uint256 as numeric: exact, no overflow risk
  status            text not null,
  creditcoin_tx_hash text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_events_sepolia_tx_hash_unique'
      and conrelid = 'public.bill_events'::regclass
  ) then
    alter table public.bill_events
      add constraint bill_events_sepolia_tx_hash_unique unique (sepolia_tx_hash);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bill_events_status_check'
      and conrelid = 'public.bill_events'::regclass
  ) then
    alter table public.bill_events
      add constraint bill_events_status_check
      check (status in ('pending', 'proof_fetched', 'verified', 'failed'));
  end if;
end $$;

-- Wallet-scoped reads are the primary access pattern (dashboard/history
-- endpoints), and RLS policies filter on wallet_address — index it.
create index if not exists bill_events_wallet_address_idx
  on public.bill_events (wallet_address, created_at desc);

-- Worker's is_already_verified() check filters on (sepolia_tx_hash, status) —
-- the unique constraint above already covers sepolia_tx_hash, but a
-- composite partial index matches that exact query shape.
create index if not exists bill_events_verified_lookup_idx
  on public.bill_events (sepolia_tx_hash)
  where status = 'verified';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bill_events_set_updated_at on public.bill_events;
create trigger bill_events_set_updated_at
  before update on public.bill_events
  for each row
  execute function public.set_updated_at();

alter table public.bill_events enable row level security;
alter table public.bill_events force row level security;

drop policy if exists bill_events_owner_select on public.bill_events;
create policy bill_events_owner_select on public.bill_events
  for select
  to authenticated
  using (wallet_address = (select auth.jwt() ->> 'wallet_address'));

-- No insert/update/delete policies for 'authenticated' — only the
-- service-role key (worker) writes to this table, and service_role bypasses
-- RLS entirely, so no policy is needed for it.

-- ============================================================================
-- score_history
-- ============================================================================

create table if not exists public.score_history (
  id                  bigint generated always as identity primary key,
  wallet_address      text not null,
  score               bigint not null,
  collateral_ratio    bigint not null,  -- basis points, matches CreditVault's bps convention
  recorded_at         timestamptz not null default now()
);

create index if not exists score_history_wallet_address_idx
  on public.score_history (wallet_address, recorded_at desc);

alter table public.score_history enable row level security;
alter table public.score_history force row level security;

drop policy if exists score_history_owner_select on public.score_history;
create policy score_history_owner_select on public.score_history
  for select
  to authenticated
  using (wallet_address = (select auth.jwt() ->> 'wallet_address'));
