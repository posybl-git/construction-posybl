-- ============================================================
-- Site Ledger — Initial Schema
-- Phase 1: Core tables, indexes, views, audit triggers
-- ============================================================

-- ============================================================
-- 1. PROFILES — extends auth.users
-- ============================================================
create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  full_name   text not null,
  phone       text,
  role        text not null check (role in ('admin', 'site_manager')) default 'site_manager',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_app_meta_data ->> 'role', 'site_manager')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. PROJECTS
-- ============================================================
create table public.projects (
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

-- Restricted view for site managers — NO contract_value, NO financial data
create view public.projects_for_site as
  select id, name, address, status
  from public.projects
  where deleted_at is null;

-- ============================================================
-- 3. PROJECT ASSIGNMENTS
-- ============================================================
create table public.project_assignments (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid not null references public.projects on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users,
  unique (project_id, user_id)
);

-- ============================================================
-- 4. EXPENSES — most-used table
-- ============================================================
create table public.expenses (
  id                uuid default gen_random_uuid() primary key,
  project_id        uuid not null references public.projects on delete cascade,
  expense_name      text not null,
  amount            numeric not null check (amount > 0),
  expense_date      date not null,
  category          text not null,
  purpose           text,
  vendor_id         uuid references public.vendors on delete set null,
  payment_status    text not null check (payment_status in ('paid', 'unpaid')) default 'paid',
  paid_date         date,
  paid_method       text,
  paid_from         text not null check (paid_from in ('client_funds', 'own_funds')) default 'client_funds',
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
-- 5. CLIENT PAYMENTS (money in)
-- ============================================================
create table public.client_payments (
  id              uuid default gen_random_uuid() primary key,
  project_id      uuid not null references public.projects on delete cascade,
  milestone_id    uuid,
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
-- 6. VENDORS
-- ============================================================
create table public.vendors (
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
-- 7. EXPENSE CATEGORIES
-- ============================================================
create table public.expense_categories (
  id          uuid default gen_random_uuid() primary key,
  name        text not null unique,
  is_seeded   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 8. CONTRACT REVISIONS
-- ============================================================
create table public.contract_revisions (
  id          uuid default gen_random_uuid() primary key,
  project_id  uuid not null references public.projects on delete cascade,
  old_value   numeric,
  new_value   numeric,
  reason      text,
  changed_by  uuid references auth.users,
  changed_at  timestamptz not null default now()
);

-- ============================================================
-- 9. AUDIT LOG — append-only, no soft-delete columns
-- ============================================================
create table public.audit_log (
  id          uuid default gen_random_uuid() primary key,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row     jsonb,
  new_row     jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

-- ============================================================
-- 10. INDEXES
-- ============================================================
create index idx_expenses_project_date    on public.expenses (project_id, expense_date)  where deleted_at is null;
create index idx_expenses_date            on public.expenses (expense_date)               where deleted_at is null;
create index idx_expenses_payment_status  on public.expenses (payment_status)             where deleted_at is null;
create index idx_expenses_created_by      on public.expenses (created_by)                 where deleted_at is null;
create index idx_expenses_category        on public.expenses (category)                   where deleted_at is null;
create index idx_client_payments_proj_date on public.client_payments (project_id, payment_date) where deleted_at is null;
create index idx_audit_log_table_record   on public.audit_log (table_name, record_id);
create index idx_projects_status          on public.projects (status)                     where deleted_at is null;
create index idx_project_assignments_user on public.project_assignments (user_id);

-- ============================================================
-- 11. AUDIT TRIGGER FUNCTION
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

-- Apply audit triggers to all business tables
create trigger audit_projects       after insert or update or delete on public.projects       for each row execute function public.audit_trigger_func();
create trigger audit_expenses       after insert or update or delete on public.expenses       for each row execute function public.audit_trigger_func();
create trigger audit_client_payments after insert or update or delete on public.client_payments for each row execute function public.audit_trigger_func();
create trigger audit_vendors        after insert or update or delete on public.vendors        for each row execute function public.audit_trigger_func();
create trigger audit_project_assignments after insert or update or delete on public.project_assignments for each row execute function public.audit_trigger_func();

-- ============================================================
-- 12. updated_at TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

create trigger set_updated_at_projects        before update on public.projects        for each row execute function public.set_updated_at();
create trigger set_updated_at_expenses        before update on public.expenses        for each row execute function public.set_updated_at();
create trigger set_updated_at_client_payments before update on public.client_payments for each row execute function public.set_updated_at();
create trigger set_updated_at_vendors         before update on public.vendors         for each row execute function public.set_updated_at();

-- ============================================================
-- 13. AUDIT LOG PROTECTION — no updates or deletes allowed
-- ============================================================
revoke update, delete on public.audit_log from public;
revoke update, delete on public.audit_log from authenticated;
revoke update, delete on public.audit_log from anon;
