-- ============================================================
-- Fix RLS performance on services and users SELECT policies
-- (Applied via MCP in previous session — saved locally for sync)
-- ============================================================

-- Drop ALL policy on services that pollutes SELECT
DROP POLICY IF EXISTS "Admins can manage services" ON services;

-- Consolidate users SELECT policies into one efficient policy
DROP POLICY IF EXISTS "Users can view own company profiles" ON users;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON users;

CREATE POLICY "users_select" ON users
  FOR SELECT USING (
    auth_user_id = auth.uid()
    OR company_id = get_auth_user_company_id()
    OR (get_auth_user_company_id() IS NULL AND company_id = get_user_company_id())
    OR is_super_admin_real()
  );
