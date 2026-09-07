-- Phase 8 follow-up #2: KYC now requires the same permissioned validator
-- to approve/reject it, instead of auto-verifying on submission. An
-- instant, unconditional "yes" wasn't actually gating anything — this
-- makes /upload and /borrow wait on a real (still mocked) review action,
-- the same way bill submissions already wait on BillValidator review.
alter table public.kyc_submissions drop column if exists verified;
alter table public.kyc_submissions add column if not exists status text not null default 'pending';
alter table public.kyc_submissions add column if not exists reviewed_at timestamptz;
alter table public.kyc_submissions add column if not exists rejection_reason text;

-- Existing rows (auto-verified under the old flow) are grandfathered in
-- as approved rather than silently kicked back to pending.
update public.kyc_submissions set status = 'approved', reviewed_at = submitted_at
  where status = 'pending' and reviewed_at is null and submitted_at < now();
