-- Fix for Audit Logs Phase 2 issues

-- 1. Allow company_id to be NULL in audit_logs table
-- This is necessary for global events like "User Login" which are not tied to a specific company context at the trigger level.
ALTER TABLE public.audit_logs ALTER COLUMN company_id DROP NOT NULL;

-- 2. Update handle_auth_audit trigger function with SECURITY BEST PRACTICES (search_path)
CREATE OR REPLACE FUNCTION public.handle_auth_audit()
RETURNS TRIGGER AS $$
BEGIN
  -- Track changes to last_sign_in_at (Login event)
  IF (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at) THEN
    INSERT INTO public.audit_logs (
      company_id,
      actor_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      ip_address,
      user_agent
    )
    VALUES (
      NULL, -- Now allowed
      NEW.id,
      NEW.email,
      'auth.login',
      'auth',
      NEW.id,
      inet_client_addr(),
      current_setting('request.headers', true)::json->>'user-agent'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;

-- 3. Update log_audit_event RPC with SECURITY BEST PRACTICES (search_path)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_company_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void AS $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  -- Get current user
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.audit_logs (
    company_id,
    actor_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    new_data,
    ip_address,
    user_agent
  )
  VALUES (
    p_company_id,
    v_uid,
    v_email,
    p_action,
    p_entity_type,
    p_entity_id,
    p_metadata,
    inet_client_addr(),
    current_setting('request.headers', true)::json->>'user-agent'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions;
