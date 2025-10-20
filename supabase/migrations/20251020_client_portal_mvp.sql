-- Client Portal MVP
-- Date: 2025-10-20
-- Purpose: Add mapping table and secure views/functions to scope data by client for authenticated portal users.

SET search_path = public;

-- 1) Mapping table: email -> (company, client)
CREATE TABLE IF NOT EXISTS public.client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  auth_user_id UUID NULL, -- optional convenience if known
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (company_id, client_id, email)
);

COMMENT ON TABLE public.client_portal_users IS 'Maps a login email to a specific client within a company for client portal scoping.';

-- RLS for mapping table: only admins/owners can read/manage for their company; users can see their own mapping by email
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

-- Helper: get_user_company_id() already exists in the project; reuse it
-- Policies
DROP POLICY IF EXISTS cpu_select ON public.client_portal_users;
CREATE POLICY cpu_select ON public.client_portal_users
  FOR SELECT
  USING (
    -- Admin/owner for company, or row email equals current auth email
    company_id = get_user_company_id()
    OR lower(email) = lower(current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  );

DROP POLICY IF EXISTS cpu_insert ON public.client_portal_users;
CREATE POLICY cpu_insert ON public.client_portal_users
  FOR INSERT
  WITH CHECK (company_id = get_user_company_id());

DROP POLICY IF EXISTS cpu_update ON public.client_portal_users;
CREATE POLICY cpu_update ON public.client_portal_users
  FOR UPDATE
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

DROP POLICY IF EXISTS cpu_delete ON public.client_portal_users;
CREATE POLICY cpu_delete ON public.client_portal_users
  FOR DELETE
  USING (company_id = get_user_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_portal_users TO authenticated;

-- 2) Helper to read email from JWT (if not already available as a function)
DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'auth_user_email';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION public.auth_user_email()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$
      SELECT lower(current_setting('request.jwt.claims', true)::jsonb ->> 'email');
    $$;
    COMMENT ON FUNCTION public.auth_user_email IS 'Returns lowercased email from JWT claims.';
    GRANT EXECUTE ON FUNCTION public.auth_user_email() TO authenticated;
  END IF;
END $$;

-- 3) SECURE DEFINER functions to fetch only rows visible to mapped client

-- Tickets
CREATE OR REPLACE FUNCTION public.client_get_visible_tickets()
RETURNS SETOF public.tickets
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH user_mapping AS (
    SELECT company_id, client_id
    FROM public.client_portal_users
    WHERE is_active = true
      AND lower(email) = public.auth_user_email()
    LIMIT 1
  )
  SELECT t.*
  FROM public.tickets t
  JOIN user_mapping m ON m.company_id = t.company_id AND m.client_id = t.client_id
$$;

COMMENT ON FUNCTION public.client_get_visible_tickets IS 'Returns tickets for the client mapped to the current auth email.';
GRANT EXECUTE ON FUNCTION public.client_get_visible_tickets() TO authenticated;

-- Quotes
CREATE OR REPLACE FUNCTION public.client_get_visible_quotes()
RETURNS SETOF public.quotes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH user_mapping AS (
    SELECT company_id, client_id
    FROM public.client_portal_users
    WHERE is_active = true
      AND lower(email) = public.auth_user_email()
    LIMIT 1
  )
  SELECT q.*
  FROM public.quotes q
  JOIN user_mapping m ON m.company_id = q.company_id AND m.client_id = q.client_id
$$;

COMMENT ON FUNCTION public.client_get_visible_quotes IS 'Returns quotes for the client mapped to the current auth email.';
GRANT EXECUTE ON FUNCTION public.client_get_visible_quotes() TO authenticated;

-- 4) Read-only views (friendly interface for the frontend)
CREATE OR REPLACE VIEW public.client_visible_tickets AS
  SELECT * FROM public.client_get_visible_tickets();

CREATE OR REPLACE VIEW public.client_visible_quotes AS
  SELECT * FROM public.client_get_visible_quotes();

GRANT SELECT ON public.client_visible_tickets TO authenticated;
GRANT SELECT ON public.client_visible_quotes TO authenticated;

-- 5) Optional: narrow columns in views later for strict minimization; MVP uses full rows for DX.
