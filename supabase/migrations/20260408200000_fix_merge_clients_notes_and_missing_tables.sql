-- Fix: merge_clients referenced clients.notes which does not exist (column is internal_notes).
-- Also adds reassignment for 14 tables with client_id that were missing from the function:
--   booking_clinical_notes, booking_documents, client_clinical_notes, client_notes,
--   client_variant_assignments (unique: client_id,service_id), contracts,
--   gdpr_consent_requests, marketing_logs, project_activity, project_comments,
--   project_notification_preferences (unique: project_id,client_id), project_reads,
--   ticket_comments, waitlist.
-- Views (client_visible_bookings/quotes/tickets) are not updated — they derive from base tables.

CREATE OR REPLACE FUNCTION public.merge_clients(
  p_keep_id    uuid,
  p_discard_id uuid,
  p_merged_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_reassigned_bookings  integer := 0;
  v_reassigned_invoices  integer := 0;
  v_reassigned_quotes    integer := 0;
BEGIN
  -- ── Validation ──────────────────────────────────────────────────────────────
  IF p_keep_id = p_discard_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'keep and discard must be different');
  END IF;

  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  WHERE c.id = p_keep_id AND c.deleted_at IS NULL;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'keep client not found or already deleted');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_discard_id AND company_id = v_company_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'discard client not found, already deleted, or belongs to different company');
  END IF;

  -- ── Authorization: owner or admin of the company ────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON ar.id = cm.role_id
    JOIN public.users u ON u.id = cm.user_id
    WHERE cm.company_id = v_company_id
      AND cm.status = 'active'
      AND ar.name IN ('owner', 'admin')
      AND u.auth_user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied: must be owner or admin');
  END IF;

  -- ── Reassign core entities ──────────────────────────────────────────────────
  UPDATE public.bookings SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_bookings = ROW_COUNT;

  UPDATE public.invoices SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_invoices = ROW_COUNT;

  UPDATE public.quotes SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_quotes = ROW_COUNT;

  UPDATE public.devices SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.client_documents SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.contracts SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.tickets SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.projects SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.client_inactivity_log SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- ── Clinical / notes ────────────────────────────────────────────────────────
  UPDATE public.booking_clinical_notes SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.booking_documents SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.client_clinical_notes SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.client_notes SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- ── GDPR / marketing ───────────────────────────────────────────────────────
  UPDATE public.gdpr_consent_requests SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.marketing_logs SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- ── Project sub-entities ────────────────────────────────────────────────────
  UPDATE public.project_activity SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.project_comments SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.project_reads SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- project_notification_preferences: unique (project_id, client_id)
  UPDATE public.project_notification_preferences
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.project_notification_preferences pnp2
      WHERE pnp2.client_id = p_keep_id
        AND pnp2.project_id = project_notification_preferences.project_id
    );
  DELETE FROM public.project_notification_preferences WHERE client_id = p_discard_id;

  -- ── Ticket comments ─────────────────────────────────────────────────────────
  UPDATE public.ticket_comments SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- ── Waitlist ────────────────────────────────────────────────────────────────
  UPDATE public.waitlist SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- ── Junction tables with unique constraints ─────────────────────────────────

  -- client_assignments: unique (client_id, company_member_id)
  UPDATE public.client_assignments
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.client_assignments ca2
      WHERE ca2.client_id = p_keep_id
        AND ca2.company_member_id = client_assignments.company_member_id
    );
  DELETE FROM public.client_assignments WHERE client_id = p_discard_id;

  -- clients_tags: unique (client_id, tag_id)
  UPDATE public.clients_tags
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.clients_tags ct2
      WHERE ct2.client_id = p_keep_id
        AND ct2.tag_id = clients_tags.tag_id
    );
  DELETE FROM public.clients_tags WHERE client_id = p_discard_id;

  -- client_variant_assignments: unique (client_id, service_id)
  UPDATE public.client_variant_assignments
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.client_variant_assignments cva2
      WHERE cva2.client_id = p_keep_id
        AND cva2.service_id = client_variant_assignments.service_id
    );
  DELETE FROM public.client_variant_assignments WHERE client_id = p_discard_id;

  UPDATE public.client_contacts SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_portal_users: unique (client_id, email, company_id)
  UPDATE public.client_portal_users
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.client_portal_users cpu2
      WHERE cpu2.client_id = p_keep_id
        AND cpu2.email = client_portal_users.email
        AND cpu2.company_id = client_portal_users.company_id
    );
  DELETE FROM public.client_portal_users WHERE client_id = p_discard_id;

  -- NOTE: public.addresses uses usuario_id (auth user link), not client_id — not migrated here.

  -- ── Update kept client with merged data ─────────────────────────────────────
  UPDATE public.clients
  SET
    name           = COALESCE(NULLIF(p_merged_data->>'name',          ''), name),
    surname        = COALESCE(NULLIF(p_merged_data->>'surname',       ''), surname),
    email          = COALESCE(NULLIF(p_merged_data->>'email',         ''), email),
    phone          = COALESCE(NULLIF(p_merged_data->>'phone',         ''), phone),
    business_name  = COALESCE(NULLIF(p_merged_data->>'business_name', ''), business_name),
    trade_name     = COALESCE(NULLIF(p_merged_data->>'trade_name',    ''), trade_name),
    internal_notes = COALESCE(NULLIF(p_merged_data->>'notes',         ''), internal_notes)
  WHERE id = p_keep_id;

  -- ── Soft-delete the discarded client ────────────────────────────────────────
  UPDATE public.clients
  SET is_active = false, deleted_at = now()
  WHERE id = p_discard_id;

  RETURN jsonb_build_object(
    'success', true,
    'kept_id', p_keep_id,
    'discarded_id', p_discard_id,
    'reassigned', jsonb_build_object(
      'bookings', v_reassigned_bookings,
      'invoices', v_reassigned_invoices,
      'quotes',   v_reassigned_quotes
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_clients(uuid, uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
