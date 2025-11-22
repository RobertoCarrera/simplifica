-- Fix RLS policies for company_settings to allow INSERT
-- Date: 2025-11-22

BEGIN;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can insert their company settings" ON company_settings;
DROP POLICY IF EXISTS "Users can update their company settings" ON company_settings;

-- Allow users to INSERT company_settings for their own company
CREATE POLICY "Users can insert their company settings"
ON company_settings
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM users 
    WHERE auth_user_id = auth.uid()
  )
);

-- Allow users to UPDATE company_settings for their own company
CREATE POLICY "Users can update their company settings"
ON company_settings
FOR UPDATE
TO authenticated
USING (
  company_id IN (
    SELECT company_id 
    FROM users 
    WHERE auth_user_id = auth.uid()
  )
)
WITH CHECK (
  company_id IN (
    SELECT company_id 
    FROM users 
    WHERE auth_user_id = auth.uid()
  )
);

COMMIT;
