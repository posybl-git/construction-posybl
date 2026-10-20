-- Migration: 007_float_and_expense_aggregations.sql
-- Description: Server-side aggregation functions for float balances and project expense totals
-- to prevent silent row truncation from Supabase's default 1,000-row limit.

-- 1. Function to calculate single user float balance
CREATE OR REPLACE FUNCTION get_user_float_balance(p_user_id UUID)
RETURNS TABLE(total_issued NUMERIC, total_spent NUMERIC, float_balance NUMERIC)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT 
    COALESCE(i.total, 0) as total_issued,
    COALESCE(s.total, 0) as total_spent,
    COALESCE(i.total, 0) - COALESCE(s.total, 0) as float_balance
  FROM 
    (SELECT SUM(amount) as total FROM cash_issuances WHERE user_id = p_user_id AND deleted_at IS NULL) i,
    (SELECT SUM(amount) as total FROM expenses WHERE created_by = p_user_id AND paid_via = 'site_float' AND deleted_at IS NULL) s;
$$;

-- 2. Function to calculate all users float balances in bulk
CREATE OR REPLACE FUNCTION get_all_float_balances()
RETURNS TABLE(user_id UUID, total_issued NUMERIC, total_spent NUMERIC, float_balance NUMERIC)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  WITH issued AS (
    SELECT ci.user_id, COALESCE(SUM(ci.amount), 0) as total
    FROM cash_issuances ci
    WHERE ci.deleted_at IS NULL
    GROUP BY ci.user_id
  ),
  spent AS (
    SELECT e.created_by as user_id, COALESCE(SUM(e.amount), 0) as total
    FROM expenses e
    WHERE e.paid_via = 'site_float' AND e.deleted_at IS NULL
    GROUP BY e.created_by
  ),
  all_users AS (
    SELECT user_id FROM issued
    UNION
    SELECT user_id FROM spent
  )
  SELECT 
    au.user_id,
    COALESCE(i.total, 0) as total_issued,
    COALESCE(s.total, 0) as total_spent,
    COALESCE(i.total, 0) - COALESCE(s.total, 0) as float_balance
  FROM all_users au
  LEFT JOIN issued i ON au.user_id = i.user_id
  LEFT JOIN spent s ON au.user_id = s.user_id;
$$;

-- 3. Function to aggregate project expense totals directly in Postgres
CREATE OR REPLACE FUNCTION get_project_expense_totals()
RETURNS TABLE(
  project_id UUID,
  total_expenses NUMERIC,
  total_paid_out NUMERIC,
  total_unpaid NUMERIC,
  spent_today NUMERIC,
  spent_this_month NUMERIC,
  site_float_total NUMERIC
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT 
    e.project_id,
    COALESCE(SUM(e.amount), 0) as total_expenses,
    COALESCE(SUM(CASE WHEN e.payment_status = 'paid' THEN e.amount ELSE 0 END), 0) as total_paid_out,
    COALESCE(SUM(CASE WHEN e.payment_status != 'paid' THEN e.amount ELSE 0 END), 0) as total_unpaid,
    COALESCE(SUM(CASE WHEN e.expense_date = CURRENT_DATE THEN e.amount ELSE 0 END), 0) as spent_today,
    COALESCE(SUM(CASE WHEN e.expense_date >= date_trunc('month', CURRENT_DATE)::date AND e.expense_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date THEN e.amount ELSE 0 END), 0) as spent_this_month,
    COALESCE(SUM(CASE WHEN e.paid_via = 'site_float' THEN e.amount ELSE 0 END), 0) as site_float_total
  FROM expenses e
  WHERE e.deleted_at IS NULL
  GROUP BY e.project_id;
$$;
