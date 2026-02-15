-- Allow company admins/owners to update their own company details using existing helper function
create policy "Company members can update their own company"
  on companies for update
  to authenticated
  using (is_company_admin(id))
  with check (is_company_admin(id));
