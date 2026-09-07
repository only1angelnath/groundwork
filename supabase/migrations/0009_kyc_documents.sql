-- Phase 8 follow-up: swap the typed-in ID number for an uploaded ID
-- document, mirroring bill-documents' private-bucket pattern (see
-- 0007_bill_submissions.sql) instead of storing any ID number at all —
-- kyc_submissions now retains nothing more sensitive than a file path.
alter table public.kyc_submissions drop column if exists id_last4;
alter table public.kyc_submissions add column if not exists id_document_path text;

insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;
-- No storage.objects policies added, same reasoning as bill-documents:
-- RLS is on by default with zero policies, so only the service-role key
-- (backend/routers/kyc.py) can read/write objects in this bucket.
