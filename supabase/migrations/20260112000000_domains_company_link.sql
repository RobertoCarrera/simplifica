-- 1. Add company_id column
ALTER TABLE domains ADD COLUMN company_id uuid REFERENCES companies(id);

-- 2. Migrate specific domains to Sincronia Company
-- ID obtained from previous query: 38059e9b-9187-4e6c-b4f4-2ce508ce29f4
UPDATE domains 
SET company_id = '38059e9b-9187-4e6c-b4f4-2ce508ce29f4' 
WHERE domain IN ('sincronia.agency', 'simplificacrm.es');

-- 3. Migrate other domains based on current owner's company
-- We pick the first company the user is a member of (if any)
UPDATE domains d
SET company_id = cm.company_id
FROM company_members cm
WHERE d.assigned_to_user = cm.user_id
AND d.company_id IS NULL;

-- 4. Drop assigned_to_user column
ALTER TABLE domains DROP COLUMN assigned_to_user;

-- 5. Enable RLS
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Policy for viewing: Users can view domains belonging to their company
DROP POLICY IF EXISTS "Users can view own domains" ON domains;
CREATE POLICY "Users can view company domains" ON domains
FOR SELECT
USING (
  company_id IN (
    SELECT company_id 
    FROM company_members 
    WHERE user_id = auth.uid()
  )
);

-- Policy for Superadmins: Can do everything (assuming superadmin check exists or we use a specific role)
-- For now, we restrict modification to ONLY those who can bypass RLS (service role) or if we have a superadmin flag.
-- The prompt implies UI logic for superadmin, but RLS should be secure too.
-- Assuming `is_super_admin` function or similar check exists, or we rely on app logic + RLS for filtering.
-- Let's check permissions. If we don't have a standardized superadmin RLS check, we might just allow SELECT for members.
-- INSERT/UPDATE/DELETE only for superadmin?
-- If we don't have a global superadmin flag in JWT, we might need a function.
-- For now, let's allow SELECT for company members. 
-- Modification is usually restricted. If we want Superadmin ONLY, we can just NOT add a policy for INSERT/UPDATE for regular users.

-- If the user wants Superadmin to assign, they likely will use the 'service_role' or a specific admin account. 
-- Or we can assume there is an `app_role` = 'admin' in `users` or similar.
-- Let's stick to safe defaults: READ ONLY for company members.
