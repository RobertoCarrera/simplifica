-- Migration: Enable RLS on gdpr_breach_incidents and add company_id-based policies
-- Purpose: GDPR breach incidents contain sensitive data (Art. 33/34) and must be
--          isolated per company. Without RLS, any authenticated user could read/write
--          incidents from other companies.
--
-- Issue: Migration 20260421000002_breach_aepd_notification_fields added columns
--        but left RLS DISABLED with commands commented out.
--
-- Fix: Enable RLS + create company_id-based SELECT policy + service_role policy

-- Enable RLS on gdpr_breach_incidents
ALTER TABLE public.gdpr_breach_incidents ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can only read their own company's breach incidents
-- Uses current_setting('app.current_company_id') set at connection time by the API
CREATE POLICY "Users can view own company breach incidents"
  ON public.gdpr_breach_incidents FOR SELECT
  USING (company_id = current_setting('app.current_company_id')::UUID);

-- Policy: Authenticated users can only insert breach incidents for their own company
CREATE POLICY "Users can insert own company breach incidents"
  ON public.gdpr_breach_incidents FOR INSERT
  WITH CHECK (company_id = current_setting('app.current_company_id')::UUID);

-- Policy: Authenticated users can only update breach incidents for their own company
CREATE POLICY "Users can update own company breach incidents"
  ON public.gdpr_breach_incidents FOR UPDATE
  USING (company_id = current_setting('app.current_company_id')::UUID);

-- Policy: Service role (Edge Functions) has full access to breach incidents
-- Edge Functions use service_role_key which bypasses RLS by default.
-- This policy is redundant but explicit for audit purposes.
CREATE POLICY "Service role full access to breach incidents"
  ON public.gdpr_breach_incidents FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Note: DELETE policy intentionally omitted. GDPR requires retaining breach
-- incident records. Deletion should only happen via GDPR data deletion workflows.