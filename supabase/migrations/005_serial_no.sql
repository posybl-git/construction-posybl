-- ============================================================
-- 005_serial_no.sql
-- Adds a stable, permanent serial_no (oldest = 1) to key tables.
-- ============================================================


-- ============================================================
-- EXPENSES
-- ============================================================
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS serial_no integer;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.expenses
)
UPDATE public.expenses
SET serial_no = ranked.rn
FROM ranked
WHERE public.expenses.id = ranked.id;

ALTER TABLE public.expenses ALTER COLUMN serial_no SET NOT NULL;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_serial_no_unique;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_serial_no_unique UNIQUE (serial_no);

CREATE OR REPLACE FUNCTION public.fn_assign_serial_no_expenses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.serial_no IS NULL THEN
    NEW.serial_no := COALESCE((SELECT MAX(serial_no) FROM public.expenses), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expenses_serial_no ON public.expenses;
CREATE TRIGGER trg_expenses_serial_no
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_serial_no_expenses();


-- ============================================================
-- CLIENT_PAYMENTS
-- ============================================================
ALTER TABLE public.client_payments ADD COLUMN IF NOT EXISTS serial_no integer;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.client_payments
)
UPDATE public.client_payments
SET serial_no = ranked.rn
FROM ranked
WHERE public.client_payments.id = ranked.id;

ALTER TABLE public.client_payments ALTER COLUMN serial_no SET NOT NULL;
ALTER TABLE public.client_payments DROP CONSTRAINT IF EXISTS client_payments_serial_no_unique;
ALTER TABLE public.client_payments ADD CONSTRAINT client_payments_serial_no_unique UNIQUE (serial_no);

CREATE OR REPLACE FUNCTION public.fn_assign_serial_no_client_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.serial_no IS NULL THEN
    NEW.serial_no := COALESCE((SELECT MAX(serial_no) FROM public.client_payments), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_payments_serial_no ON public.client_payments;
CREATE TRIGGER trg_client_payments_serial_no
  BEFORE INSERT ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_serial_no_client_payments();


-- ============================================================
-- CASH_ISSUANCES
-- ============================================================
ALTER TABLE public.cash_issuances ADD COLUMN IF NOT EXISTS serial_no integer;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.cash_issuances
)
UPDATE public.cash_issuances
SET serial_no = ranked.rn
FROM ranked
WHERE public.cash_issuances.id = ranked.id;

ALTER TABLE public.cash_issuances ALTER COLUMN serial_no SET NOT NULL;
ALTER TABLE public.cash_issuances DROP CONSTRAINT IF EXISTS cash_issuances_serial_no_unique;
ALTER TABLE public.cash_issuances ADD CONSTRAINT cash_issuances_serial_no_unique UNIQUE (serial_no);

CREATE OR REPLACE FUNCTION public.fn_assign_serial_no_cash_issuances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.serial_no IS NULL THEN
    NEW.serial_no := COALESCE((SELECT MAX(serial_no) FROM public.cash_issuances), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_issuances_serial_no ON public.cash_issuances;
CREATE TRIGGER trg_cash_issuances_serial_no
  BEFORE INSERT ON public.cash_issuances
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_serial_no_cash_issuances();


-- ============================================================
-- PROJECTS
-- ============================================================
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS serial_no integer;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.projects
)
UPDATE public.projects
SET serial_no = ranked.rn
FROM ranked
WHERE public.projects.id = ranked.id;

ALTER TABLE public.projects ALTER COLUMN serial_no SET NOT NULL;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_serial_no_unique;
ALTER TABLE public.projects ADD CONSTRAINT projects_serial_no_unique UNIQUE (serial_no);

CREATE OR REPLACE FUNCTION public.fn_assign_serial_no_projects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.serial_no IS NULL THEN
    NEW.serial_no := COALESCE((SELECT MAX(serial_no) FROM public.projects), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_serial_no ON public.projects;
CREATE TRIGGER trg_projects_serial_no
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_serial_no_projects();


-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS serial_no integer;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.profiles
)
UPDATE public.profiles
SET serial_no = ranked.rn
FROM ranked
WHERE public.profiles.id = ranked.id;

ALTER TABLE public.profiles ALTER COLUMN serial_no SET NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_serial_no_unique;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_serial_no_unique UNIQUE (serial_no);

CREATE OR REPLACE FUNCTION public.fn_assign_serial_no_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.serial_no IS NULL THEN
    NEW.serial_no := COALESCE((SELECT MAX(serial_no) FROM public.profiles), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_serial_no ON public.profiles;
CREATE TRIGGER trg_profiles_serial_no
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_serial_no_profiles();
