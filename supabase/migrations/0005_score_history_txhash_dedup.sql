-- Groundwork — Phase 5.5 follow-up: score_history dedup key was wrong.
--
-- 0002_score_history_dedup.sql keyed uniqueness on (wallet_address, score),
-- reasoning that CreditVault's score is monotonically increasing "by
-- construction". That held for a single contract instance, but broke the
-- moment CreditVault got redeployed for the repay() feature (Phase 5.5):
-- every wallet's score legitimately resets to 0 and climbs back through
-- the exact same small integers used historically by the OLD contract.
-- In practice this silently dropped 3 of 5 real score_history writes
-- during the first backfill after redeploy — the on-chain score was
-- correct the whole time (CreditVault is the source of truth), only the
-- Supabase mirror lost rows.
--
-- Fix: key on (wallet_address, creditcoin_tx_hash) instead. The Creditcoin
-- verification transaction hash is genuinely unique per real-world event,
-- immune to score-value reuse across any future redeploy.

alter table public.score_history
  add column if not exists creditcoin_tx_hash text;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'score_history_wallet_score_unique'
      and conrelid = 'public.score_history'::regclass
  ) then
    alter table public.score_history
      drop constraint score_history_wallet_score_unique;
  end if;
end $$;

-- NULLs are distinct under a unique constraint in Postgres, so existing
-- historical rows (which predate this column and have no tx hash) are
-- left alone and never collide with anything.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_history_wallet_txhash_unique'
      and conrelid = 'public.score_history'::regclass
  ) then
    alter table public.score_history
      add constraint score_history_wallet_txhash_unique unique (wallet_address, creditcoin_tx_hash);
  end if;
end $$;
