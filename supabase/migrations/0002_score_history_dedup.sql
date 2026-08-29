-- Groundwork — Phase 3 follow-up migration.
--
-- score_history had no uniqueness constraint, which meant a client-side
-- retry after a timeout (the write can succeed server-side even when the
-- client never sees the response) could silently create duplicate rows —
-- exactly what happened once in practice: two rows recorded the same
-- score for the same wallet.
--
-- Fix: for a given wallet, each score value is only ever recorded once —
-- CreditVault's score is monotonically increasing by construction, so
-- (wallet_address, score) is a natural, safe dedup key. worker/
-- supabase_client.py's insert_score_history is updated alongside this
-- migration to upsert on that same key, making retries (and any future
-- manual backfill) safe to run more than once.
--
-- NOTE: if any duplicate (wallet_address, score) rows already exist when
-- this runs (as happened once in practice, from a retry issued before this
-- fix existed), the ALTER TABLE below will fail with a 23505 unique
-- violation — Postgres won't create a unique index over data that isn't
-- unique yet. Deduplicate first if that happens:
--
--   delete from public.score_history a
--   using public.score_history b
--   where a.wallet_address = b.wallet_address
--     and a.score = b.score
--     and a.id > b.id;
--
-- then re-run this migration.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_history_wallet_score_unique'
      and conrelid = 'public.score_history'::regclass
  ) then
    alter table public.score_history
      add constraint score_history_wallet_score_unique unique (wallet_address, score);
  end if;
end $$;
