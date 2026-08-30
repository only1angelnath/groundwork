-- Groundwork — Phase 5: anon read access on score_history.
--
-- Rationale (docs/HANDOFFphase5.md): scoreOf/requiredCollateralRatioOf on
-- CreditVault are already public on-chain reads, so this table's RLS isn't
-- protecting anything confidential — it's purely a Realtime mirror of
-- public on-chain state for the frontend dashboard. The frontend has no
-- SIWE-issued Supabase JWT (deliberately — see 0001's comment), so it
-- connects with the anon key. Realtime subscriptions are gated by the same
-- RLS as REST reads, so without this policy an anon-key subscription would
-- receive zero rows.
--
-- Deliberately NOT applied to bill_events — that table carries payee/amount
-- detail per row, a separate judgment call (see HANDOFFphase5.md).

drop policy if exists score_history_anon_select on public.score_history;
create policy score_history_anon_select on public.score_history
  for select
  to anon
  using (true);

-- Realtime subscriptions require the table to be in the supabase_realtime
-- publication in addition to the RLS policy above.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'score_history'
  ) then
    alter publication supabase_realtime add table public.score_history;
  end if;
end $$;
