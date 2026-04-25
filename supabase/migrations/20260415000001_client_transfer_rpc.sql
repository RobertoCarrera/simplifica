-- Migration: Client Transfer RPC
-- Allows professionals to transfer / derive a client to another professional.
-- On success, inserts a 'client_transfer' notification row for every company owner/admin.

CREATE OR REPLACE FUNCTION public.transfer_client_assignment(
  p_client_id          UUID,
  p_to_professional_id UUID,
  p_reason             TEXT    DEFAULT '',
  p_is_new_case        BOOLEAN DEFAULT FALSE,
  p_remove_self        BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid       UUID;
  v_company_id       UUID;
  v_caller_member_id UUID;
  v_caller_role      TEXT;
  v_caller_prof_id   UUID;
  v_to_member_id     UUID;
  v_client_name      TEXT;
  v_from_name        TEXT;
  v_to_name          TEXT;
  v_owner            RECORD;
BEGIN
  -- 1. Verify authentication
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- 2. Resolve caller's company membership and role
  SELECT cm.id, cm.company_id, ar.name
    INTO v_caller_member_id, v_company_id, v_caller_role
    FROM public.company_members cm
    JOIN public.app_roles ar ON ar.id = cm.role_id
   WHERE cm.user_id = v_caller_uid
     AND cm.status  = 'active'
   LIMIT 1;

  IF v_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active membership found');
  END IF;

  -- 3. Validate client belongs to caller's company
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
     WHERE id = p_client_id AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client not found in company');
  END IF;

  -- 4. Resolve caller's professionals record (may be NULL for admin-only users)
  SELECT id INTO v_caller_prof_id
    FROM public.professionals
   WHERE user_id    = v_caller_uid
     AND company_id = v_company_id
   LIMIT 1;

  -- 5. Authorization check for non-admin roles
  IF v_caller_role NOT IN ('owner', 'admin', 'super_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.client_assignments
       WHERE client_id = p_client_id
         AND (company_member_id = v_caller_member_id
              OR professional_id = v_caller_prof_id)
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not assigned to this client');
    END IF;
  END IF;

  -- 6. Validate target professional belongs to the same company
  IF NOT EXISTS (
    SELECT 1 FROM public.professionals
     WHERE id = p_to_professional_id AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target professional not in company');
  END IF;

  -- 7. Resolve target professional's company_member_id
  SELECT cm.id INTO v_to_member_id
    FROM public.professionals p
    JOIN public.company_members cm
      ON cm.user_id = p.user_id AND cm.company_id = v_company_id
   WHERE p.id = p_to_professional_id
   LIMIT 1;

  -- 8. Build display names for the notification message
  SELECT TRIM(COALESCE(name, '') || CASE WHEN surname IS NOT NULL THEN ' ' || surname ELSE '' END)
    INTO v_client_name
    FROM public.clients WHERE id = p_client_id;
  v_client_name := COALESCE(NULLIF(v_client_name, ''), 'Cliente');

  SELECT COALESCE(display_name, 'Profesional') INTO v_from_name
    FROM public.professionals
   WHERE user_id = v_caller_uid AND company_id = v_company_id;

  SELECT COALESCE(display_name, 'Profesional') INTO v_to_name
    FROM public.professionals
   WHERE id = p_to_professional_id;

  -- 9. Add new assignment (skip if already assigned)
  IF NOT EXISTS (
    SELECT 1 FROM public.client_assignments
     WHERE client_id = p_client_id AND professional_id = p_to_professional_id
  ) THEN
    INSERT INTO public.client_assignments (
      client_id, company_member_id, professional_id, assigned_by
    ) VALUES (
      p_client_id, v_to_member_id, p_to_professional_id, v_caller_uid
    )
    ON CONFLICT (client_id, company_member_id) DO NOTHING;
  END IF;

  -- 10. Remove caller's own assignment when requested
  IF p_remove_self AND v_caller_prof_id IS NOT NULL THEN
    DELETE FROM public.client_assignments
     WHERE client_id = p_client_id
       AND (professional_id  = v_caller_prof_id
            OR company_member_id = v_caller_member_id);
  END IF;

  -- 11. Insert a notification for every owner / admin of the company
  FOR v_owner IN (
    SELECT cm.user_id
      FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
     WHERE cm.company_id = v_company_id
       AND ar.name IN ('owner', 'admin', 'super_admin')
       AND cm.status = 'active'
  ) LOOP
    INSERT INTO public.notifications (
      company_id, recipient_id, type, reference_id, title, content, is_read, metadata
    ) VALUES (
      v_company_id,
      v_owner.user_id,
      'client_transfer',
      p_client_id,
      CASE WHEN p_is_new_case
           THEN 'Caso nuevo derivado: ' || v_client_name
           ELSE 'Traspaso de cliente: ' || v_client_name
      END,
      v_from_name || ' trasladó a ' || v_client_name || ' a ' || v_to_name
        || CASE WHEN COALESCE(p_reason, '') <> ''
               THEN '. Motivo: ' || p_reason
               ELSE ''
          END,
      false,
      jsonb_build_object(
        'from_name',    v_from_name,
        'to_name',      v_to_name,
        'client_name',  v_client_name,
        'reason',       COALESCE(p_reason, ''),
        'is_new_case',  p_is_new_case,
        'removed_self', p_remove_self
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success',     true,
    'from_name',   v_from_name,
    'to_name',     v_to_name,
    'client_name', v_client_name
  );
END;
$$;

-- Grant execution to authenticated users (RLS-equivalent: function validates internally)
GRANT EXECUTE ON FUNCTION public.transfer_client_assignment(UUID, UUID, TEXT, BOOLEAN, BOOLEAN)
  TO authenticated;
