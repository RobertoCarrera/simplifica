-- Migration: Bulk transfer client assignments & professional offboarding
-- Creates two SECURITY DEFINER RPCs:
--   1. bulk_transfer_client_assignments()  — move all clients + future bookings between professionals
--   2. offboard_professional()             — full offboarding orchestration (revoke, transfer/cancel, cleanup)

-- =============================================================================
-- 1. bulk_transfer_client_assignments
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bulk_transfer_client_assignments(
  p_from_professional_id UUID,
  p_to_professional_id   UUID,
  p_reason               TEXT    DEFAULT 'offboarding',
  p_transfer_bookings    BOOLEAN DEFAULT TRUE
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
  v_to_member_id     UUID;
  v_from_name        TEXT;
  v_to_name          TEXT;
  v_client_count     INT := 0;
  v_booking_count    INT := 0;
  v_assignment       RECORD;
  v_owner            RECORD;
BEGIN
  -- 1. Verify authentication
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- 2. Resolve caller's company membership and role (same pattern as transfer_client_assignment)
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

  IF v_caller_role NOT IN ('owner', 'admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions — owner, admin, or super_admin required');
  END IF;

  -- 3. Validate both professionals belong to the SAME company
  IF NOT EXISTS (
    SELECT 1 FROM public.professionals
     WHERE id = p_from_professional_id AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source professional not found in company');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.professionals
     WHERE id = p_to_professional_id AND company_id = v_company_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target professional not found in company');
  END IF;

  -- 4. Validate target professional is active
  IF NOT EXISTS (
    SELECT 1 FROM public.professionals
     WHERE id = p_to_professional_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target professional is not active');
  END IF;

  -- 5. Resolve target professional's company_member_id
  SELECT cm.id INTO v_to_member_id
    FROM public.professionals p
    JOIN public.company_members cm
      ON cm.user_id = p.user_id AND cm.company_id = p.company_id
   WHERE p.id = p_to_professional_id
   LIMIT 1;

  -- 6. Resolve display names
  SELECT COALESCE(display_name, 'Profesional') INTO v_from_name
    FROM public.professionals WHERE id = p_from_professional_id;

  SELECT COALESCE(display_name, 'Profesional') INTO v_to_name
    FROM public.professionals WHERE id = p_to_professional_id;

  -- 7. Transfer all client assignments
  FOR v_assignment IN
    SELECT id, client_id, company_member_id, professional_id
      FROM public.client_assignments
     WHERE professional_id = p_from_professional_id
  LOOP
    -- Insert new assignment for the target professional (skip if exists)
    INSERT INTO public.client_assignments (client_id, company_member_id, professional_id, assigned_by)
    VALUES (v_assignment.client_id, v_to_member_id, p_to_professional_id, v_caller_uid)
    ON CONFLICT (client_id, company_member_id) DO NOTHING;

    -- Delete the old assignment from the source professional
    DELETE FROM public.client_assignments WHERE id = v_assignment.id;

    v_client_count := v_client_count + 1;
  END LOOP;

  -- 8. Transfer future bookings if requested
  IF p_transfer_bookings THEN
    WITH updated AS (
      UPDATE public.bookings
         SET professional_id = p_to_professional_id,
             updated_at      = now()
       WHERE professional_id = p_from_professional_id
         AND start_time > now()
         AND status IN ('confirmed', 'pending')
      RETURNING id
    )
    SELECT count(*) INTO v_booking_count FROM updated;
  END IF;

  -- 9. GDPR audit log
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, record_id, user_id, company_id,
    purpose, new_values
  ) VALUES (
    'BULK_TRANSFER_ASSIGNMENTS',
    'client_assignments',
    p_from_professional_id,
    v_caller_uid,
    v_company_id,
    'Professional offboarding — bulk client transfer',
    jsonb_build_object(
      'from_professional_id', p_from_professional_id,
      'from_professional_name', v_from_name,
      'to_professional_id', p_to_professional_id,
      'to_professional_name', v_to_name,
      'clients_transferred', v_client_count,
      'bookings_transferred', v_booking_count,
      'reason', COALESCE(p_reason, '')
    )
  );

  -- 10. Notify every owner / admin of the company
  FOR v_owner IN
    SELECT cm.user_id
      FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
     WHERE cm.company_id = v_company_id
       AND ar.name IN ('owner', 'admin', 'super_admin')
       AND cm.status = 'active'
  LOOP
    INSERT INTO public.notifications (
      company_id, recipient_id, type, reference_id, title, content, is_read, metadata
    ) VALUES (
      v_company_id,
      v_owner.user_id,
      'professional_offboard',
      p_from_professional_id,
      'Transferencia masiva de clientes',
      v_from_name || ' → ' || v_to_name || ': '
        || v_client_count || ' cliente(s) y '
        || v_booking_count || ' reserva(s) transferidos'
        || CASE WHEN COALESCE(p_reason, '') <> '' THEN '. Motivo: ' || p_reason ELSE '' END,
      false,
      jsonb_build_object(
        'from_professional_id', p_from_professional_id,
        'from_name', v_from_name,
        'to_professional_id', p_to_professional_id,
        'to_name', v_to_name,
        'clients_transferred', v_client_count,
        'bookings_transferred', v_booking_count,
        'reason', COALESCE(p_reason, '')
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success',              true,
    'clients_transferred',  v_client_count,
    'bookings_transferred', v_booking_count,
    'from_professional',    v_from_name,
    'to_professional',      v_to_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_transfer_client_assignments(UUID, UUID, TEXT, BOOLEAN)
  TO authenticated;

-- =============================================================================
-- 2. offboard_professional
-- =============================================================================
CREATE OR REPLACE FUNCTION public.offboard_professional(
  p_professional_id        UUID,
  p_to_professional_id     UUID    DEFAULT NULL,
  p_reason                 TEXT    DEFAULT '',
  p_cancel_future_bookings BOOLEAN DEFAULT TRUE,
  p_transfer_bookings      BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid         UUID;
  v_company_id         UUID;
  v_caller_member_id   UUID;
  v_caller_role        TEXT;
  v_prof_user_id       UUID;
  v_prof_name          TEXT;
  v_target_name        TEXT;
  v_clients_transferred INT := 0;
  v_bookings_transferred INT := 0;
  v_bookings_cancelled  INT := 0;
  v_services_removed    INT := 0;
  v_transfer_result     JSONB;
  v_owner               RECORD;
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

  IF v_caller_role NOT IN ('owner', 'admin', 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions — owner, admin, or super_admin required');
  END IF;

  -- 3. Validate professional exists in caller's company
  SELECT user_id, COALESCE(display_name, 'Profesional')
    INTO v_prof_user_id, v_prof_name
    FROM public.professionals
   WHERE id = p_professional_id AND company_id = v_company_id;

  IF v_prof_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Professional not found in company');
  END IF;

  -- 4. Prevent self-offboarding
  IF v_prof_user_id = v_caller_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot offboard yourself');
  END IF;

  ---------------------------------------------------------------------------
  -- Step 1: Revoke access immediately
  ---------------------------------------------------------------------------
  UPDATE public.professionals
     SET is_active   = false,
         updated_at  = now()
   WHERE id = p_professional_id;

  UPDATE public.company_members
     SET status     = 'suspended',
         updated_at = now()
   WHERE user_id    = v_prof_user_id
     AND company_id = v_company_id;

  ---------------------------------------------------------------------------
  -- Step 2: Handle future bookings when NO transfer target
  ---------------------------------------------------------------------------
  IF p_cancel_future_bookings AND p_to_professional_id IS NULL THEN
    WITH cancelled AS (
      UPDATE public.bookings
         SET status     = 'cancelled',
             updated_at = now()
       WHERE professional_id = p_professional_id
         AND start_time > now()
         AND status IN ('confirmed', 'pending')
      RETURNING id
    )
    SELECT count(*) INTO v_bookings_cancelled FROM cancelled;
  END IF;

  ---------------------------------------------------------------------------
  -- Step 3: Transfer clients and bookings (when transfer target provided)
  ---------------------------------------------------------------------------
  IF p_to_professional_id IS NOT NULL THEN
    v_transfer_result := public.bulk_transfer_client_assignments(
      p_from_professional_id := p_professional_id,
      p_to_professional_id   := p_to_professional_id,
      p_reason               := COALESCE(p_reason, 'offboarding'),
      p_transfer_bookings    := p_transfer_bookings
    );

    IF (v_transfer_result ->> 'success')::boolean THEN
      v_clients_transferred  := (v_transfer_result ->> 'clients_transferred')::int;
      v_bookings_transferred := (v_transfer_result ->> 'bookings_transferred')::int;
      v_target_name          := v_transfer_result ->> 'to_professional';
    END IF;

    -- If transfer target was provided but bookings were NOT transferred,
    -- cancel remaining future bookings to avoid orphaned bookings.
    IF NOT p_transfer_bookings AND p_cancel_future_bookings THEN
      WITH cancelled AS (
        UPDATE public.bookings
           SET status     = 'cancelled',
               updated_at = now()
         WHERE professional_id = p_professional_id
           AND start_time > now()
           AND status IN ('confirmed', 'pending')
        RETURNING id
      )
      SELECT count(*) INTO v_bookings_cancelled FROM cancelled;
    END IF;
  END IF;

  ---------------------------------------------------------------------------
  -- Step 4: Clean up professional_services
  ---------------------------------------------------------------------------
  WITH deleted AS (
    DELETE FROM public.professional_services
     WHERE professional_id = p_professional_id
    RETURNING id
  )
  SELECT count(*) INTO v_services_removed FROM deleted;

  ---------------------------------------------------------------------------
  -- Step 5: GDPR audit log
  ---------------------------------------------------------------------------
  INSERT INTO public.gdpr_audit_log (
    action_type, table_name, record_id, user_id, company_id,
    purpose, new_values
  ) VALUES (
    'OFFBOARD_PROFESSIONAL',
    'professionals',
    p_professional_id,
    v_caller_uid,
    v_company_id,
    'Professional offboarding',
    jsonb_build_object(
      'professional_id', p_professional_id,
      'professional_name', v_prof_name,
      'transfer_target_id', p_to_professional_id,
      'transfer_target_name', v_target_name,
      'clients_transferred', v_clients_transferred,
      'bookings_transferred', v_bookings_transferred,
      'bookings_cancelled', v_bookings_cancelled,
      'services_removed', v_services_removed,
      'reason', COALESCE(p_reason, '')
    )
  );

  ---------------------------------------------------------------------------
  -- Step 6: Notify admins / owners
  ---------------------------------------------------------------------------
  FOR v_owner IN
    SELECT cm.user_id
      FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
     WHERE cm.company_id = v_company_id
       AND ar.name IN ('owner', 'admin', 'super_admin')
       AND cm.status = 'active'
  LOOP
    INSERT INTO public.notifications (
      company_id, recipient_id, type, reference_id, title, content, is_read, metadata
    ) VALUES (
      v_company_id,
      v_owner.user_id,
      'professional_offboard',
      p_professional_id,
      'Profesional dado de baja: ' || v_prof_name,
      v_prof_name || ' ha sido dado de baja.'
        || CASE WHEN v_target_name IS NOT NULL
             THEN ' Clientes transferidos a ' || v_target_name || '.'
             ELSE ''
           END
        || CASE WHEN v_bookings_cancelled > 0
             THEN ' ' || v_bookings_cancelled || ' reserva(s) cancelada(s).'
             ELSE ''
           END
        || CASE WHEN v_services_removed > 0
             THEN ' ' || v_services_removed || ' servicio(s) desvinculados.'
             ELSE ''
           END
        || CASE WHEN COALESCE(p_reason, '') <> ''
             THEN ' Motivo: ' || p_reason
             ELSE ''
           END,
      false,
      jsonb_build_object(
        'professional_id', p_professional_id,
        'professional_name', v_prof_name,
        'transfer_target_id', p_to_professional_id,
        'transfer_target_name', v_target_name,
        'clients_transferred', v_clients_transferred,
        'bookings_transferred', v_bookings_transferred,
        'bookings_cancelled', v_bookings_cancelled,
        'services_removed', v_services_removed,
        'reason', COALESCE(p_reason, '')
      )
    );
  END LOOP;

  ---------------------------------------------------------------------------
  -- Return comprehensive result
  ---------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'success',              true,
    'professional_name',    v_prof_name,
    'access_revoked',       true,
    'clients_transferred',  v_clients_transferred,
    'bookings_transferred', v_bookings_transferred,
    'bookings_cancelled',   v_bookings_cancelled,
    'services_removed',     v_services_removed,
    'transfer_target',      v_target_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.offboard_professional(UUID, UUID, TEXT, BOOLEAN, BOOLEAN)
  TO authenticated;
