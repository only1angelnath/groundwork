-- Groundwork — anon read access on bill_events.
--
-- 0004_anon_read_score_history.sql deliberately did NOT extend the same
-- anon-read treatment to bill_events, flagging it as "a slightly
-- different judgment call" since it carries payee/amount detail per row.
-- Revisiting that now to support a live payment-status tracker and
-- payment-history list on the frontend.
--
-- Reasoning: bill_events is a mirror of BillPay.sol's BillPaid event on
-- Sepolia — payer, payee, and amount are already public on Sepolia's own
-- block explorer for anyone who looks up the transaction hash. The only
-- genuinely new information bill_events adds beyond what's already public
-- is `status` (the attestation pipeline's progress), which isn't
-- sensitive. So, same conclusion as score_history: RLS here isn't
-- protecting anything actually confidential.

drop policy if exists bill_events_anon_select on public.bill_events;
create policy bill_events_anon_select on public.bill_events
  for select
  to anon
  using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bill_events'
  ) then
    alter publication supabase_realtime add table public.bill_events;
  end if;
end $$;
