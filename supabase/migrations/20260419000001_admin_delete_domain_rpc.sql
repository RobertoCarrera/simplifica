-- Migration: admin_delete_domain SECURITY DEFINER RPC
-- Date: 20260419
--
-- Context: DELETE on public.domains was revoked from authenticated in
-- 20260318200500_security_audit_misc_fixes.sql (comment: "should only be done
-- via SECURITY DEFINER RPCs").  This migration provides that RPC.
--
-- Callers: admin-webmail component (super-admin panel only).
-- Only super_admins can invoke this function.
-- The operation is recorded in gdpr_audit_log for RGPD / audit-trail compliance.

CREATE OR REPLACE FUNCTION public.admin_delete_domain(p_domain_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid  uuid := auth.uid();
  v_is_super_admin boolean;
  v_domain_name    text;
  v_company_id     uuid;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Authorization: caller must be super_admin
  -- ----------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON ar.id = u.app_role_id
    WHERE u.auth_user_id = v_caller_uid
      AND ar.name = 'super_admin'
  ) INTO v_is_super_admin;

  IF NOT v_is_super_admin THEN
    RAISE EXCEPTION 'permission denied: only super_admin can delete domains'
      USING ERRCODE = '42501';
  END IF;

  -- ----------------------------------------------------------------
  -- 2. Fetch domain metadata before deletion (needed for audit + response)
  -- ----------------------------------------------------------------
  SELECT domain, company_id
  INTO v_domain_name, v_company_id
  FROM public.domains
  WHERE id = p_domain_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'domain not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- ----------------------------------------------------------------
  -- 3. Delete the domain
  -- ----------------------------------------------------------------
  DELETE FROM public.domains WHERE id = p_domain_id;

  -- ----------------------------------------------------------------
  -- 4. RGPD audit trail
  -- ----------------------------------------------------------------
  INSERT INTO public.gdpr_audit_log (
    user_id,
    company_id,
    action_type,
    table_name,
    record_id,
    old_values,
    legal_basis,
    purpose
  ) VALUES (
    v_caller_uid,
    v_company_id,
    'domain_deletion',
    'domains',
    p_domain_id,
    jsonb_build_object('domain', v_domain_name, 'company_id', v_company_id),
    'legitimate_interest',
    'admin_domain_management'
  );

  -- ----------------------------------------------------------------
  -- 5. Return metadata for caller (toast + company notification)
  -- ----------------------------------------------------------------
  RETURN jsonb_build_object(
    'success',    true,
    'domain',     v_domain_name,
    'company_id', v_company_id
  );
END;
$$;

-- Revoke execute from PUBLIC (PostgreSQL grants to PUBLIC by default for functions)
REVOKE EXECUTE ON FUNCTION public.admin_delete_domain(uuid) FROM PUBLIC;

-- Only authenticated users can call it (RLS inside the function handles super_admin check)
GRANT EXECUTE ON FUNCTION public.admin_delete_domain(uuid) TO authenticated;
