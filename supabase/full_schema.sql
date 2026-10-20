-- ============================================================
-- Site Ledger - Complete Database Schema & RLS
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/knistgrvgrxinotumqum/sql/new
-- ============================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  full_name   text not null,
  phone       text,
  role        text not null check (role in ('admin', 'site_manager')) default 'site_manager',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-confirm user emails immediately upon creation (no email confirmation blocked)
create or replace function public.auto_confirm_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email_confirmed_at = coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_user_email();

-- Auto-create profile on signup trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_count integer;
  assigned_role text;
begin
  select count(*) into user_count from public.profiles;
  if user_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := coalesce(new.raw_app_meta_data ->> 'role', new.raw_user_meta_data ->> 'role', 'site_manager');
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    assigned_role
  )
  on conflict (id) do update
  set full_name = coalesce(excluded.full_name, profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. PROJECTS
-- ============================================================
create table if not exists public.projects (
  id                    uuid default gen_random_uuid() primary key,
  name                  text not null,
  client_name           text,
  client_phone          text,
  address               text,
  plot_size             text,
  covered_area_sqft     numeric,
  project_type          text not null check (project_type in ('turnkey', 'labour_only', 'cost_plus')),
  supervision_percent   numeric,
  contract_value        numeric not null default 0,
  start_date            date,
  expected_completion   date,
  status                text not null check (status in ('active', 'on_hold', 'completed', 'archived')) default 'active',
  notes                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references auth.users,
  deleted_at            timestamptz,
  deleted_by            uuid references auth.users
);

-- ============================================================
-- 3. PROJECT ASSIGNMENTS
-- ============================================================
create table if not exists public.project_assignments (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid not null references public.projects on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users,
  unique (project_id, user_id)
);

-- ============================================================
-- 4. VENDORS
-- ============================================================
create table if not exists public.vendors (
  id               uuid default gen_random_uuid() primary key,
  name             text not null,
  normalised_name  text not null unique,
  phone            text,
  notes            text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users,
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users
);

-- ============================================================
-- 5. EXPENSE CATEGORIES
-- ============================================================
create table if not exists public.expense_categories (
  id          uuid default gen_random_uuid() primary key,
  name        text not null unique,
  is_seeded   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 6. EXPENSES
-- ============================================================
create table if not exists public.expenses (
  id                uuid default gen_random_uuid() primary key,
  project_id        uuid not null references public.projects on delete cascade,
  expense_name      text not null,
  quantity          numeric,
  unit              text,
  rate              numeric,
  amount            numeric not null check (amount > 0),
  expense_date      date not null,
  category          text not null,
  purpose           text,
  vendor_id         uuid references public.vendors on delete set null,
  payment_status    text not null check (payment_status in ('paid', 'unpaid')) default 'paid',
  paid_date         date,
  paid_method       text,
  paid_from         text not null check (paid_from in ('client_funds', 'own_funds')) default 'client_funds',
  paid_via          text not null check (paid_via in ('site_float', 'direct')) default 'site_float',
  is_reimbursable   boolean not null default false,
  attachment_paths  text[],
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users,
  deleted_at        timestamptz,
  deleted_by        uuid references auth.users
);

-- ============================================================
-- 7. PAYMENT MILESTONES (Payment schedule)
-- ============================================================
create table if not exists public.payment_milestones (
  id              uuid default gen_random_uuid() primary key,
  project_id      uuid not null references public.projects on delete cascade,
  name            text not null,
  planned_amount  numeric not null check (planned_amount > 0),
  planned_date    date,
  sequence_no     integer not null default 0,
  status          text not null check (status in ('pending', 'partially_received', 'received', 'overdue')) default 'pending',
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users,
  deleted_at      timestamptz,
  deleted_by      uuid references auth.users
);

-- ============================================================
-- 8. CLIENT PAYMENTS (Money in)
-- ============================================================
create table if not exists public.client_payments (
  id              uuid default gen_random_uuid() primary key,
  project_id      uuid not null references public.projects on delete cascade,
  milestone_id    uuid references public.payment_milestones on delete set null,
  payment_date    date not null,
  amount          numeric not null check (amount > 0),
  method          text not null check (method in ('cash', 'bank_transfer', 'cheque', 'easypaisa', 'jazzcash', 'other')),
  reference_no    text,
  received_by     text,
  note            text,
  attachment_path text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users,
  deleted_at      timestamptz,
  deleted_by      uuid references auth.users
);

-- ============================================================
-- 9. CASH ISSUANCES (Site float tracking)
-- ============================================================
create table if not exists public.cash_issuances (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null references public.profiles on delete cascade,
  project_id      uuid references public.projects on delete set null,
  issue_date      date not null default current_date,
  amount          numeric not null,
  funding_source  text not null check (funding_source in ('client_funds', 'own_funds')) default 'client_funds',
  method          text not null check (method in ('cash', 'bank_transfer', 'cheque', 'easypaisa', 'jazzcash', 'other')) default 'cash',
  note            text,
  is_adjustment   boolean not null default false,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users,
  deleted_at      timestamptz,
  deleted_by      uuid references auth.users
);

-- ============================================================
-- 10. CONTRACT REVISIONS
-- ============================================================
create table if not exists public.contract_revisions (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid not null references public.projects on delete cascade,
  old_value   numeric,
  new_value   numeric,
  reason      text,
  changed_by  uuid references auth.users,
  changed_at  timestamptz not null default now()
);

-- ============================================================
-- 11. AUDIT LOG (Append-only)
-- ============================================================
create table if not exists public.audit_log (
  id          uuid default gen_random_uuid() primary key,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row     jsonb,
  new_row     jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

revoke update, delete on public.audit_log from public;
revoke update, delete on public.audit_log from authenticated;
revoke update, delete on public.audit_log from anon;

-- ============================================================
-- 12. INDEXES
-- ============================================================
create index if not exists idx_expenses_project_date    on public.expenses (project_id, expense_date)  where deleted_at is null;
create index if not exists idx_expenses_date            on public.expenses (expense_date)               where deleted_at is null;
create index if not exists idx_expenses_payment_status  on public.expenses (payment_status)             where deleted_at is null;
create index if not exists idx_expenses_created_by      on public.expenses (created_by)                 where deleted_at is null;
create index if not exists idx_expenses_category        on public.expenses (category)                   where deleted_at is null;
create index if not exists idx_client_payments_proj_date on public.client_payments (project_id, payment_date) where deleted_at is null;
create index if not exists idx_milestones_proj_seq     on public.payment_milestones (project_id, sequence_no) where deleted_at is null;
create index if not exists idx_cash_issuances_user     on public.cash_issuances (user_id, issue_date) where deleted_at is null;
create index if not exists idx_audit_log_table_record   on public.audit_log (table_name, record_id);
create index if not exists idx_projects_status          on public.projects (status)                     where deleted_at is null;
create index if not exists idx_project_assignments_user on public.project_assignments (user_id);

-- ============================================================
-- 13. AUDIT & UPDATED_AT TRIGGERS
-- ============================================================
create or replace function public.audit_trigger_func()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (TG_OP = 'INSERT') then
    insert into public.audit_log (table_name, record_id, action, old_row, new_row, changed_by)
    values (TG_TABLE_NAME, NEW.id, 'INSERT', null, to_jsonb(NEW), NEW.created_by);
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    insert into public.audit_log (table_name, record_id, action, old_row, new_row, changed_by)
    values (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), NEW.updated_by);
    return NEW;
  elsif (TG_OP = 'DELETE') then
    insert into public.audit_log (table_name, record_id, action, old_row, new_row, changed_by)
    values (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), null, null);
    return OLD;
  end if;
  return null;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists audit_projects on public.projects;
create trigger audit_projects after insert or update or delete on public.projects for each row execute function public.audit_trigger_func();

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses for each row execute function public.audit_trigger_func();

drop trigger if exists audit_payment_milestones on public.payment_milestones;
create trigger audit_payment_milestones after insert or update or delete on public.payment_milestones for each row execute function public.audit_trigger_func();

drop trigger if exists audit_client_payments on public.client_payments;
create trigger audit_client_payments after insert or update or delete on public.client_payments for each row execute function public.audit_trigger_func();

drop trigger if exists audit_cash_issuances on public.cash_issuances;
create trigger audit_cash_issuances after insert or update or delete on public.cash_issuances for each row execute function public.audit_trigger_func();

drop trigger if exists audit_vendors on public.vendors;
create trigger audit_vendors after insert or update or delete on public.vendors for each row execute function public.audit_trigger_func();

drop trigger if exists audit_project_assignments on public.project_assignments;
create trigger audit_project_assignments after insert or update or delete on public.project_assignments for each row execute function public.audit_trigger_func();

drop trigger if exists set_updated_at_projects on public.projects;
create trigger set_updated_at_projects before update on public.projects for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_expenses on public.expenses;
create trigger set_updated_at_expenses before update on public.expenses for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_payment_milestones on public.payment_milestones;
create trigger set_updated_at_payment_milestones before update on public.payment_milestones for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_client_payments on public.client_payments;
create trigger set_updated_at_client_payments before update on public.client_payments for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_cash_issuances on public.cash_issuances;
create trigger set_updated_at_cash_issuances before update on public.cash_issuances for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_vendors on public.vendors;
create trigger set_updated_at_vendors before update on public.vendors for each row execute function public.set_updated_at();

-- ============================================================
-- 14. RESTRICTED VIEW FOR SITE MANAGERS
-- ============================================================
create or replace view public.projects_for_site as
  select id, name, address, status
  from public.projects
  where deleted_at is null;

grant select on public.projects_for_site to authenticated;

-- ============================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.expenses enable row level security;
alter table public.payment_milestones enable row level security;
alter table public.client_payments enable row level security;
alter table public.cash_issuances enable row level security;
alter table public.vendors enable row level security;
alter table public.expense_categories enable row level security;
alter table public.contract_revisions enable row level security;
alter table public.audit_log enable row level security;

-- PROFILES
drop policy if exists "admin_all_profiles" on public.profiles;
create policy "admin_all_profiles" on public.profiles
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_own_profile" on public.profiles;
create policy "site_manager_read_own_profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- PROJECTS
drop policy if exists "admin_all_projects" on public.projects;
create policy "admin_all_projects" on public.projects
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_assigned_projects" on public.projects;
create policy "site_manager_read_assigned_projects" on public.projects
  for select to authenticated
  using (
    (select public.get_user_role()) = 'site_manager'
    and deleted_at is null
    and id in (
      select project_id from public.project_assignments
      where user_id = (select auth.uid())
    )
  );

-- PROJECT ASSIGNMENTS
drop policy if exists "admin_all_assignments" on public.project_assignments;
create policy "admin_all_assignments" on public.project_assignments
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_own_assignments" on public.project_assignments;
create policy "site_manager_read_own_assignments" on public.project_assignments
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- EXPENSES
drop policy if exists "admin_all_expenses" on public.expenses;
create policy "admin_all_expenses" on public.expenses
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_expenses" on public.expenses;
create policy "site_manager_read_expenses" on public.expenses
  for select to authenticated
  using (
    (select public.get_user_role()) = 'site_manager'
    and deleted_at is null
    and project_id in (
      select project_id from public.project_assignments
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "site_manager_insert_expenses" on public.expenses;
create policy "site_manager_insert_expenses" on public.expenses
  for insert to authenticated
  with check (
    (select public.get_user_role()) = 'site_manager'
    and project_id in (
      select project_id from public.project_assignments
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "site_manager_update_own_expenses" on public.expenses;
create policy "site_manager_update_own_expenses" on public.expenses
  for update to authenticated
  using (
    (select public.get_user_role()) = 'site_manager'
    and created_by = (select auth.uid())
    and created_at > now() - interval '24 hours'
    and deleted_at is null
  )
  with check (
    (select public.get_user_role()) = 'site_manager'
    and created_by = (select auth.uid())
  );

-- PAYMENT MILESTONES
drop policy if exists "admin_all_milestones" on public.payment_milestones;
create policy "admin_all_milestones" on public.payment_milestones
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- CLIENT PAYMENTS
drop policy if exists "admin_all_client_payments" on public.client_payments;
create policy "admin_all_client_payments" on public.client_payments
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- CASH ISSUANCES
drop policy if exists "admin_all_cash_issuances" on public.cash_issuances;
create policy "admin_all_cash_issuances" on public.cash_issuances
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_own_issuances" on public.cash_issuances;
create policy "site_manager_read_own_issuances" on public.cash_issuances
  for select to authenticated
  using ((select auth.uid()) = user_id and deleted_at is null);

-- VENDORS
drop policy if exists "admin_all_vendors" on public.vendors;
create policy "admin_all_vendors" on public.vendors
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_vendors" on public.vendors;
create policy "site_manager_read_vendors" on public.vendors
  for select to authenticated
  using ((select public.get_user_role()) = 'site_manager' and deleted_at is null);

drop policy if exists "site_manager_insert_vendors" on public.vendors;
create policy "site_manager_insert_vendors" on public.vendors
  for insert to authenticated
  with check ((select public.get_user_role()) = 'site_manager');

-- EXPENSE CATEGORIES
drop policy if exists "admin_all_categories" on public.expense_categories;
create policy "admin_all_categories" on public.expense_categories
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

drop policy if exists "site_manager_read_categories" on public.expense_categories;
create policy "site_manager_read_categories" on public.expense_categories
  for select to authenticated
  using ((select public.get_user_role()) = 'site_manager');

drop policy if exists "site_manager_insert_categories" on public.expense_categories;
create policy "site_manager_insert_categories" on public.expense_categories
  for insert to authenticated
  with check ((select public.get_user_role()) = 'site_manager');

-- CONTRACT REVISIONS
drop policy if exists "admin_all_contract_revisions" on public.contract_revisions;
create policy "admin_all_contract_revisions" on public.contract_revisions
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- AUDIT LOG
drop policy if exists "admin_read_audit_log" on public.audit_log;
create policy "admin_read_audit_log" on public.audit_log
  for select to authenticated
  using ((select public.get_user_role()) = 'admin');

-- ============================================================
-- 16. SEED DATA (Construction Expense Categories)
-- ============================================================
insert into public.expense_categories (name, is_seeded) values
  ('Cement', true),
  ('Sariya (steel)', true),
  ('Bajri (crush)', true),
  ('Reta (sand)', true),
  ('Bricks / Blocks', true),
  ('Block work', true),
  ('Mistri (mason)', true),
  ('Mazdoor (labour)', true),
  ('Dihari (daily wage)', true),
  ('Contractor payment', true),
  ('Advance to labour', true),
  ('Shuttering', true),
  ('Roof slab (chhat)', true),
  ('Plumbing', true),
  ('Sanitary fittings', true),
  ('Electrical wiring', true),
  ('Tiles', true),
  ('Marble', true),
  ('Wood & doors', true),
  ('Paint', true),
  ('Plaster', true),
  ('Glass & aluminium', true),
  ('Grill / iron work', true),
  ('Machinery rent', true),
  ('Transport / freight', true),
  ('Water tanker', true),
  ('Tools', true),
  ('Approval & municipal fees', true),
  ('Site tea & food', true),
  ('Staff salary', true),
  ('Miscellaneous', true)
on conflict (name) do nothing;
