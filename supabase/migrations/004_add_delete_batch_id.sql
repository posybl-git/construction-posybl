-- Add delete_batch_id to tables for cascade soft delete & batch restore
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS delete_batch_id uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS delete_batch_id uuid;
ALTER TABLE public.client_payments ADD COLUMN IF NOT EXISTS delete_batch_id uuid;
ALTER TABLE public.payment_milestones ADD COLUMN IF NOT EXISTS delete_batch_id uuid;
ALTER TABLE public.cash_issuances ADD COLUMN IF NOT EXISTS delete_batch_id uuid;
