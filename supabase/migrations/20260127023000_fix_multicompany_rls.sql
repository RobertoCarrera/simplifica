-- Fix: Update RLS policies to support multi-company access (Visibility Fix) - QUALIFIED COLUMNS

-- -----------------------------------------------------------------------------
-- TICKETS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_can_view_company_tickets" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_company_only" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update_company_only" ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete_company_only" ON public.tickets;

-- SELECT
CREATE POLICY "staff_can_view_company_tickets" ON public.tickets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = tickets.company_id -- Qualified
    AND cm.status = 'active'
  )
);

-- INSERT
CREATE POLICY "tickets_insert_company_only" ON public.tickets
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = tickets.company_id -- Qualified (Postgres allows table name in WITH CHECK for NEW row)
    AND cm.status = 'active'
  )
);

-- UPDATE
CREATE POLICY "tickets_update_company_only" ON public.tickets
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = tickets.company_id -- Qualified
    AND cm.status = 'active'
  )
);

-- DELETE
CREATE POLICY "tickets_delete_company_only" ON public.tickets
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = tickets.company_id -- Qualified
    AND cm.status = 'active'
  )
);


-- -----------------------------------------------------------------------------
-- TICKET COMMENTS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Comments select by company members" ON public.ticket_comments;
DROP POLICY IF EXISTS "Comments insert by company members" ON public.ticket_comments;

CREATE POLICY "Comments select by company members" ON public.ticket_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = ticket_comments.company_id
    AND cm.status = 'active'
  )
);

CREATE POLICY "Comments insert by company members" ON public.ticket_comments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = ticket_comments.company_id
    AND cm.status = 'active'
  )
);


-- -----------------------------------------------------------------------------
-- TICKET PRODUCTS
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow select ticket_products by company membership" ON public.ticket_products;
DROP POLICY IF EXISTS "Allow insert ticket_products by company membership" ON public.ticket_products;
DROP POLICY IF EXISTS "Allow update ticket_products by company membership" ON public.ticket_products;
DROP POLICY IF EXISTS "Allow delete ticket_products by company membership" ON public.ticket_products;

CREATE POLICY "Allow select ticket_products by company membership" ON public.ticket_products
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = ticket_products.company_id
    AND cm.status = 'active'
  )
);

CREATE POLICY "Allow insert ticket_products by company membership" ON public.ticket_products
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = ticket_products.company_id
    AND cm.status = 'active'
  )
);

CREATE POLICY "Allow update ticket_products by company membership" ON public.ticket_products
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = ticket_products.company_id
    AND cm.status = 'active'
  )
);

CREATE POLICY "Allow delete ticket_products by company membership" ON public.ticket_products
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = ticket_products.company_id
    AND cm.status = 'active'
  )
);
