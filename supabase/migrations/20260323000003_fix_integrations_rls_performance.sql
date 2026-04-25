-- ============================================================
-- Fix RLS performance on integrations table
-- Replaces ALL policy (cascading through users RLS) with
-- per-command policies using STABLE cached helper function.
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can manage own integrations" ON integrations;
DROP POLICY IF EXISTS "Users can view integrations of their company" ON integrations;

-- Helper: get current user's public users.id (SECURITY DEFINER bypasses users RLS)
CREATE OR REPLACE FUNCTION public.get_my_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- SELECT: own integrations
-- Note: integrations table does not have company_id column; filter by user_id only
CREATE POLICY "integrations_select" ON integrations
  FOR SELECT USING (
    user_id = get_my_user_id()
  );

-- INSERT: only own integrations
CREATE POLICY "integrations_insert" ON integrations
  FOR INSERT WITH CHECK (user_id = get_my_user_id());

-- UPDATE: only own integrations
CREATE POLICY "integrations_update" ON integrations
  FOR UPDATE USING (user_id = get_my_user_id());

-- DELETE: only own integrations
CREATE POLICY "integrations_delete" ON integrations
  FOR DELETE USING (user_id = get_my_user_id());

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
