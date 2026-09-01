-- Groundwork — Phase 5.5 follow-up: score_history's dedup key collided
-- across contract redeploys.
--
-- 0002_score_history_dedup.sql made (wallet_address, score) the unique
-- key, reasoning that CreditVault's score is monotonically increasing "by
-- construction" for a given wallet. That was true within one contract's
-- lifetime, but broke the first time CreditVault was ever redeployed
-- (Phase 5.5, adding repay()): score resets to 0 on the new contract and
-- climbs back through the same small integers the old contract already
-- used. In practice this silently merged today's real score=3/4/5 writes
-- into stale Aug-21 rows from the old contract instead of creating new
-- ones — the writes weren't lost, they were merged into the wrong row.
--
-- Fix: dedup on creditcoin_tx_hash instead — the Creditcoin transaction
-- hash from GroundworkASC.verifyBillProof is a genuine 1:1 identity for a
-- single verification event, so it needs no assumption about score being
-- monotonic, per-wallet, or scoped to any particular contract at all.
--
-- Existing rows predate this column and are left NULL rather than
-- backfilled — Postgres unique constraints treat NULL as distinct from
-- every other NULL, so historical rows never collide with each other or
-- with new writes, no backfill required.

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_history_creditcoin_tx_hash_unique'
      and conrelid = 'public.score_history'::regclass
  ) then
    alter table public.score_history
      add constraint score_history_creditcoin_tx_hash_unique
      unique (creditcoin_tx_hash);
  end if;
end $$;
