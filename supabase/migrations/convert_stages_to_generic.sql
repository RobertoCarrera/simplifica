-- Migration: Convert existing ticket_stages to generic (system-wide) stages
-- Date: 2025-10-17
-- Purpose: Allow stages to be either generic (company_id IS NULL) or company-specific

-- Step 1: Make company_id nullable if it isn't already
ALTER TABLE public.ticket_stages 
  ALTER COLUMN company_id DROP NOT NULL;

-- Step 2: Update existing stages to be generic (system-wide)
-- These will be available to all companies as default stages
UPDATE public.ticket_stages 
SET company_id = NULL 
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

-- Step 3: Update RLS policies to show both generic and company-specific stages
DROP POLICY IF EXISTS "Users can view stages for their company" ON public.ticket_stages;
DROP POLICY IF EXISTS "Users can insert stages for their company" ON public.ticket_stages;
DROP POLICY IF EXISTS "Users can update stages for their company" ON public.ticket_stages;
DROP POLICY IF EXISTS "Users can delete stages for their company" ON public.ticket_stages;

-- New policy: Users can view generic stages OR stages for their company
CREATE POLICY "Users can view generic or company stages" ON public.ticket_stages
  FOR SELECT
  USING (
    company_id IS NULL 
    OR 
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- New policy: Users can insert stages for their company (not generic)
CREATE POLICY "Users can insert company stages" ON public.ticket_stages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- New policy: Users can update their company stages (not generic)
CREATE POLICY "Users can update company stages" ON public.ticket_stages
  FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- New policy: Users can delete their company stages (not generic)
CREATE POLICY "Users can delete company stages" ON public.ticket_stages
  FOR DELETE
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- Add comment to explain the company_id NULL behavior
COMMENT ON COLUMN public.ticket_stages.company_id IS 
  'NULL indicates a generic/system-wide stage available to all companies. 
   Non-NULL values are company-specific stages.';
