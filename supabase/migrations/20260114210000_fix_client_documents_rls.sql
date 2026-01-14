DROP POLICY IF EXISTS "Enable insert access for company members" ON "client_documents";
DROP POLICY IF EXISTS "Enable read access for company members" ON "client_documents";
DROP POLICY IF EXISTS "Enable delete access for company members" ON "client_documents";

CREATE POLICY "Enable insert access for company members" ON "client_documents"
FOR INSERT WITH CHECK (
  company_id IN (
    SELECT company_id FROM company_members
    WHERE user_id = get_my_public_id()
  )
);

CREATE POLICY "Enable read access for company members" ON "client_documents"
FOR SELECT USING (
  company_id IN (
    SELECT company_id FROM company_members
    WHERE user_id = get_my_public_id()
  )
);

CREATE POLICY "Enable delete access for company members" ON "client_documents"
FOR DELETE USING (
  company_id IN (
    SELECT company_id FROM company_members
    WHERE user_id = get_my_public_id()
  )
);
