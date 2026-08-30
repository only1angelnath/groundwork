-- Groundwork — Phase 2 follow-up migration (Render Cron Job deploy path).
--
-- Render's Cron Job service type can't provision a persistent disk, so
-- worker/state.py's local last_block.json can't survive between runs when
-- the worker is deployed as a Cron Job (as opposed to a Background Worker,
-- which keeps a long-lived filesystem). This table is a tiny external
-- key-value store for that same cursor, written/read by
-- worker/supabase_client.py's get_last_scanned_block / set_last_scanned_block.
--
-- Not a correctness guard — same as state.py's local file, this is only a
-- scan-range optimization. Losing a row here just means the next run
-- re-scans further back; bill_events' idempotency check and
-- GroundworkASC's on-chain replay guard are still what actually prevent
-- duplicate submissions.

create table if not exists public.worker_state (
  key text primary key,
  value bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.worker_state enable row level security;
-- No policies added intentionally — this table is written/read exclusively
-- by the worker via the service-role key, which bypasses RLS. No
-- anon/authenticated access is intended, matching how supabase_client.py
-- treats bill_events and score_history's own service-role-only write path.
