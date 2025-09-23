-- Fix recursive clients GDPR trigger causing stack depth (54001)
-- Root cause: trigger function updated public.clients inside its own AFTER trigger without a guard
-- Solution: make the trigger reentrancy-safe using pg_trigger_depth() and correct NEW/OLD usage

BEGIN;

CREATE OR REPLACE FUNCTION public.log_client_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_record_id uuid;
  v_email text;
  v_action text;
BEGIN
  -- Determine action and safely pick fields from NEW/OLD
  IF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id;
    v_record_id := NEW.id;
    v_email := NEW.email;
    v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    v_company_id := NEW.company_id;
    v_record_id := NEW.id;
    v_email := NEW.email;
    v_action := 'update';
  ELSIF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
    v_record_id := OLD.id;
    v_email := OLD.email;
    v_action := 'delete';
  END IF;

  -- Audit log (reuses central logger)
  PERFORM public.gdpr_log_access(
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_email,
    'client_data_management',
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  -- Update convenience fields ONLY for UPDATE, and avoid infinite recursion
  -- pg_trigger_depth() = 1 ensures we don't re-enter due to our own UPDATE below
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() = 1 THEN
    UPDATE public.clients
    SET
      last_accessed_at = now(),
      access_count = COALESCE(access_count, 0) + 1
    WHERE id = NEW.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Note: Trigger binding already exists as AFTER INSERT OR UPDATE OR DELETE ON public.clients
--       No changes needed to the trigger itself; this function replacement takes effect immediately.

COMMIT;
