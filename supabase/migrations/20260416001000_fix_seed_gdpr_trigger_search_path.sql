-- Fix: seed_gdpr_processing_activities uses SET search_path = '' without LOCAL
-- This bleeds into the calling function (create_company_with_owner), which then
-- fails when trying INSERT INTO company_members (unqualified name, search_path='')
-- Root cause: SET search_path = '' (without LOCAL) changes the session-level
-- search_path and persists after the trigger returns to the caller.
-- Fix: use SET LOCAL so the change is scoped to this trigger function only.

CREATE OR REPLACE FUNCTION public.seed_gdpr_processing_activities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template_record RECORD;
BEGIN
  FOR template_record IN 
    SELECT * FROM public.gdpr_processing_activities 
    WHERE company_id IS NULL AND status = 'active'
  LOOP
    INSERT INTO public.gdpr_processing_activities (
      company_id, activity_name, purpose, legal_basis, data_categories,
      data_subjects, recipients, special_categories, controller_name,
      controller_contact, retention_period, retention_basis, status,
      is_active, is_processor_activity, created_at, updated_at
    ) VALUES (
      NEW.id, template_record.activity_name, template_record.purpose, 
      template_record.legal_basis, template_record.data_categories,
      template_record.data_subjects, template_record.recipients,
      template_record.special_categories, template_record.controller_name,
      template_record.controller_contact, template_record.retention_period,
      template_record.retention_basis, 'active', true, false, NOW(), NOW()
    );
  END LOOP;
  RETURN NEW;
END;
$$;
