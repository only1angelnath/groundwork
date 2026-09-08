-- Phase 8 follow-up #3: in-app notifications for KYC and bill review
-- outcomes. Reuses the exact anon-read pattern already established for
-- score_history/bill_events (see 0004/0006) — the dashboard has no
-- SIWE-issued JWT (Phase 5's deliberate choice, see HANDOFFphase5.md), so
-- Realtime needs an anon SELECT policy, filtered client-side by wallet
-- address via the channel's own `filter` option. A notification's
-- content ("Bill #12 approved") is no more sensitive than the bill_events
-- row it's about, which anon can already read end to end.
create table if not exists notifications (
  id bigserial primary key,
  wallet_address text not null,
  type text not null,
  message text not null,
  reference_id text,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "Allow anon read access to notifications"
  on notifications for select
  to anon
  using (true);

-- No insert/update/delete policies: only the backend's service-role
-- client ever writes here (kyc.py on KYC review, routers/notifications.py
-- on bill review), same as bill_submissions/score_history.

create index if not exists notifications_wallet_address_idx
  on notifications (wallet_address);
