-- Fix: merge_clients attempted to UPDATE public.addresses with client_id, but that table
-- uses usuario_id (linked to auth users), not client_id. Remove that UPDATE entirely.

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

  UPDATE public.bookings SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_bookings = ROW_COUNT;

  UPDATE public.invoices SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_invoices = ROW_COUNT;

  UPDATE public.quotes SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_quotes = ROW_COUNT;

  UPDATE public.devices SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.client_documents SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_assignments: avoid duplicate (client_id, company_member_id) unique pairs
  UPDATE public.client_assignments
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.client_assignments ca2
      WHERE ca2.client_id = p_keep_id
        AND ca2.company_member_id = client_assignments.company_member_id
    );
  DELETE FROM public.client_assignments WHERE client_id = p_discard_id;

  -- clients_tags: avoid duplicate (client_id, tag_id) pairs
  UPDATE public.clients_tags
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.clients_tags ct2
      WHERE ct2.client_id = p_keep_id
        AND ct2.tag_id = clients_tags.tag_id
    );
  DELETE FROM public.clients_tags WHERE client_id = p_discard_id;

  UPDATE public.client_contacts SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_portal_users: avoid duplicate (client_id, email, company_id) pairs
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

  UPDATE public.projects SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.client_inactivity_log SET client_id = p_keep_id WHERE client_id = p_discard_id;
  UPDATE public.tickets SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- NOTE: public.addresses uses usuario_id (auth user link), not client_id — not migrated here.

  UPDATE public.clients
  SET
    name           = COALESCE(NULLIF(p_merged_data->>'name',         ''), name),
    surname        = COALESCE(NULLIF(p_merged_data->>'surname',      ''), surname),
    email          = COALESCE(NULLIF(p_merged_data->>'email',        ''), email),
    phone          = COALESCE(NULLIF(p_merged_data->>'phone',        ''), phone),
    business_name  = COALESCE(NULLIF(p_merged_data->>'business_name',''), business_name),
    trade_name     = COALESCE(NULLIF(p_merged_data->>'trade_name',   ''), trade_name),
    notes          = COALESCE(NULLIF(p_merged_data->>'notes',        ''), notes)
  WHERE id = p_keep_id;

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
