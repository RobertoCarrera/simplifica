-- Migration: Add AEPD notification tracking fields to gdpr_breach_incidents
-- Purpose: GDPR Article 33 requires notification to AEPD within 72 hours of a breach.
--          These fields track whether the AEPD notification has been done and when.
--
-- Summary:
--   - aepd_notified_at: timestamp when the in-app AEPD reminder was triggered
--   - affected_subjects_notified: whether affected data subjects have been notified (Article 34)
--
-- Edge Function: notify-breach-aepd
--   Triggered by GdprComplianceService.reportBreachIncident() when severity is high/critical.
--   Creates in-app notification for company owner(s) reminding them to notify AEPD.
--   NOTE: External notification via https://sede.aepd.gob.es must be done manually.

-- Add AEPD notification tracking columns
ALTER TABLE public.gdpr_breach_incidents
  ADD COLUMN IF NOT EXISTS aepd_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS affected_subjects_notified BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.gdpr_breach_incidents.aepd_notified_at IS
  'Timestamp when the AEPD notification workflow was triggered (in-app reminder sent to owner). External notification via sede.aepd.gob.es must be done manually.';
COMMENT ON COLUMN public.gdpr_breach_incidents.affected_subjects_notified IS
  'Whether affected data subjects have been notified of the breach (GDPR Article 34). Set to true once subjects are informed.';

-- Add RLS policy for the new columns (same company isolation as existing fields)
-- The existing RLS policies should already cover these new columns via table-level policies.
-- Verify: gdpr_breach_incidents has RLS enabled and company_id-based policies.
-- If not, uncomment the following:

-- ALTER TABLE public.gdpr_breach_incidents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see breach incidents from their own company
-- CREATE POLICY "Users can view own company breach incidents"
--   ON public.gdpr_breach_incidents FOR SELECT
--   USING (company_id = current_setting('app.current_company_id')::UUID);

-- Policy: Service role can do anything (for Edge Functions)
-- CREATE POLICY "Service role full access to breach incidents"
--   ON public.gdpr_breach_incidents FOR ALL
--   USING (current_setting('role') = 'service_role');
