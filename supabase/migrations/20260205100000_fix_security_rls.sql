-- Migration: Fix Critical Security RLS Issues
-- Date: 2026-02-05
-- Description:
-- 1. Fixes Payment Integrations Cross-Tenant Leak by enforcing company_id check.
-- 2. Fixes Item Tags Unrestricted Access by adding company_id and enforcing RLS.
-- 3. Fixes Auth ID Mismatch in App Settings and Client Variant Assignments.

-- ==============================================================================
-- 1. PAYMENT INTEGRATIONS FIX
-- ==============================================================================

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Policy: Select (Check company membership via company_members)
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

-- Policy: Insert
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

-- Policy: Update
CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

-- Policy: Delete
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

-- ==============================================================================
-- 2. ITEM TAGS FIX
-- ==============================================================================

-- Add company_id column
ALTER TABLE public.item_tags ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id based on record_type
-- Clients
UPDATE public.item_tags it
SET company_id = c.company_id
FROM public.clients c
WHERE it.record_type = 'client'
  AND it.record_id = c.id
  AND it.company_id IS NULL;

-- Tickets
UPDATE public.item_tags it
SET company_id = t.company_id
FROM public.tickets t
WHERE it.record_type = 'ticket'
  AND it.record_id = t.id
  AND it.company_id IS NULL;

-- Services (assuming services table exists and has company_id)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') THEN
        UPDATE public.item_tags it
        SET company_id = s.company_id
        FROM public.services s
        WHERE it.record_type = 'service'
          AND it.record_id = s.id
          AND it.company_id IS NULL;
    END IF;
END $$;

-- Drop insecure policies
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.item_tags;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.item_tags;

-- Create secure policies
-- Read: Member of the company
CREATE POLICY "item_tags_select" ON public.item_tags FOR SELECT TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = item_tags.company_id
        AND cm.status = 'active'
    )
);

-- Insert: Member of the company
CREATE POLICY "item_tags_insert" ON public.item_tags FOR INSERT TO authenticated
WITH CHECK (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = item_tags.company_id
        AND cm.status = 'active'
    )
);

-- Delete: Member of the company (or maybe admin only? for now allow members as they created it)
CREATE POLICY "item_tags_delete" ON public.item_tags FOR DELETE TO authenticated
USING (
    company_id IS NOT NULL AND
    EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = item_tags.company_id
        AND cm.status = 'active'
    )
);

-- ==============================================================================
-- 3. AUTH ID MISMATCH FIX
-- ==============================================================================

-- App Settings
DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_write" ON public.app_settings
FOR ALL TO authenticated
USING (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- FIXED: was u.id
      AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- FIXED: was u.id
      AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
);

-- Client Variant Assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.client_variant_assignments;
CREATE POLICY "Admins can manage assignments" ON public.client_variant_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- FIXED: was u.id
      AND ar.name IN ('admin', 'super_admin')
  )
);
