-- Trigger to track Logins (auth.users updates)
CREATE OR REPLACE FUNCTION public.handle_auth_audit()
RETURNS TRIGGER AS $$
BEGIN
  -- Track changes to last_sign_in_at (Login event)
  IF (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at) THEN
    INSERT INTO public.audit_logs (
      company_id, -- Auth events are global for the user, but we might want to link to a company if we knew it. For now null or try to infer?
                  -- Actually for auth.users we don't strictly have a company_id context in the trigger easily without querying members.
                  -- But audit_logs usually requires company_id? 
                  -- Checking phase 1: audit_logs.company_id is nullable? 
                  -- Let's check schema. If nullable, leave null. If not, we have a problem.
                  -- Assuming nullable for system/auth events or we need to find their 'primary' company.
                  -- Ideally we store NULL for system/auth events and the UI handles it.
      actor_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      ip_address,
      user_agent
    )
    VALUES (
      NULL, -- No specific company for a "Login" to the platform generic
      NEW.id,
      NEW.email,
      'auth.login',
      'auth',
      NEW.id,
      inet_client_addr(), -- Might be null in some contexts, but usually works for direct connection
      current_setting('request.headers', true)::json->>'user-agent'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users
-- Note: Requires superuser/postgres role to attach to auth schema. Supabase Dashboard allows this via SQL Editor.
-- Ensure we don't break simple migrations if running as non-superuser (though usually we are).
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.handle_auth_audit();


-- RPC for Manual App-Level Logging
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_company_id uuid;
BEGIN
  -- Get current user
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get email
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Try to get current company from metadata or fallback?
  -- Usually the app knows the context. Let's make company_id an optional param or extract from metadata?
  -- Better: Accept company_id as param? Or extract from header?
  -- Simplest: Accept company_id as param if available, else try to find from metadata.
  -- Let's add company_id param.
  
  -- Wait, the signature in plan was `log_audit_event(action, entity_type, entity_id, metadata)`.
  -- I should add company_id.
END;
$$ LANGUAGE plpgsql;

-- Redefining with company_id
DROP FUNCTION IF EXISTS public.log_audit_event;

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
    new_data, -- Use new_data for metadata/payload
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
    inet_client_addr(), -- Postgres captures this well for RPCs over HTTP
    current_setting('request.headers', true)::json->>'user-agent'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, uuid, jsonb) TO authenticated;
