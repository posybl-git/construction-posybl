-- ============================================================
-- Site Ledger - Row Level Security Policies
-- Per PRD §12: enforce access in the database, not only in the UI
-- ============================================================

-- Helper function: get current user's role (cached per query via SELECT wrapper)
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

-- ============================================================
-- PROFILES
-- ============================================================
alter table public.profiles enable row level security;

-- Admin: full access
create policy "admin_all_profiles" on public.profiles
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- Site manager: read own row only
create policy "site_manager_read_own_profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

-- ============================================================
-- PROJECTS
-- ============================================================
alter table public.projects enable row level security;

-- Admin: full access
create policy "admin_all_projects" on public.projects
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- Site manager: NO direct access to the projects table
-- They use the projects_for_site view instead (which exposes no financial data)
-- No policy needed for site_manager role on this table

-- ============================================================
-- PROJECT ASSIGNMENTS
-- ============================================================
alter table public.project_assignments enable row level security;

-- Admin: full access
create policy "admin_all_assignments" on public.project_assignments
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- Site manager: read own assignments
create policy "site_manager_read_own_assignments" on public.project_assignments
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- EXPENSES
-- ============================================================
alter table public.expenses enable row level security;

-- Admin: full access
create policy "admin_all_expenses" on public.expenses
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- Site manager: SELECT on assigned projects only
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

-- Site manager: INSERT on assigned projects only
create policy "site_manager_insert_expenses" on public.expenses
  for insert to authenticated
  with check (
    (select public.get_user_role()) = 'site_manager'
    and project_id in (
      select project_id from public.project_assignments
      where user_id = (select auth.uid())
    )
  );

-- Site manager: UPDATE own rows within 24 hours (edit window)
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

-- ============================================================
-- CLIENT PAYMENTS - admin only
-- ============================================================
alter table public.client_payments enable row level security;

create policy "admin_all_client_payments" on public.client_payments
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- No policies for site_manager = no access at all

-- ============================================================
-- VENDORS
-- ============================================================
alter table public.vendors enable row level security;

-- Admin: full access
create policy "admin_all_vendors" on public.vendors
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- Site manager: read and create only
create policy "site_manager_read_vendors" on public.vendors
  for select to authenticated
  using ((select public.get_user_role()) = 'site_manager' and deleted_at is null);

create policy "site_manager_insert_vendors" on public.vendors
  for insert to authenticated
  with check ((select public.get_user_role()) = 'site_manager');

-- ============================================================
-- EXPENSE CATEGORIES
-- ============================================================
alter table public.expense_categories enable row level security;

-- Admin: full access
create policy "admin_all_categories" on public.expense_categories
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- Site manager: read and create only
create policy "site_manager_read_categories" on public.expense_categories
  for select to authenticated
  using ((select public.get_user_role()) = 'site_manager');

create policy "site_manager_insert_categories" on public.expense_categories
  for insert to authenticated
  with check ((select public.get_user_role()) = 'site_manager');

-- ============================================================
-- CONTRACT REVISIONS - admin only
-- ============================================================
alter table public.contract_revisions enable row level security;

create policy "admin_all_contract_revisions" on public.contract_revisions
  for all to authenticated
  using ((select public.get_user_role()) = 'admin')
  with check ((select public.get_user_role()) = 'admin');

-- ============================================================
-- AUDIT LOG - admin read-only, site manager no access
-- ============================================================
alter table public.audit_log enable row level security;

create policy "admin_read_audit_log" on public.audit_log
  for select to authenticated
  using ((select public.get_user_role()) = 'admin');

-- ============================================================
-- GRANT on restricted view for site managers
-- ============================================================
grant select on public.projects_for_site to authenticated;
