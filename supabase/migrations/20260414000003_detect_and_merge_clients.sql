-- Migration: duplicate client detection and merge
-- Provides two RPCs for company owners/admins:
--   1. detect_duplicate_clients(p_company_id) → candidate duplicate pairs
--   2. merge_clients(p_keep_id, p_discard_id, p_merged_data) → merges data, soft-deletes duplicate

-- 1. detect_duplicate_clients ---------------------------------------------------
-- Returns pairs of clients that share the same email OR the same (name + surname)
-- within the same company. Each pair is returned once (a.id < b.id to avoid duplicates).

CREATE OR REPLACE FUNCTION public.detect_duplicate_clients(p_company_id uuid)
RETURNS TABLE(
  id_a       uuid,
  name_a     text,
  surname_a  text,
  email_a    text,
  phone_a    text,
  created_a  timestamptz,
  is_active_a boolean,
  id_b       uuid,
  name_b     text,
  surname_b  text,
  email_b    text,
  phone_b    text,
  created_b  timestamptz,
  is_active_b boolean,
  match_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify caller is owner or admin of the company
  IF NOT (
    SELECT EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE cm.company_id = p_company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin')
        AND u.auth_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: must be owner or admin of this company';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT
      a.id         AS id_a,
      a.name       AS name_a,
      a.surname    AS surname_a,
      a.email      AS email_a,
      a.phone      AS phone_a,
      a.created_at AS created_a,
      a.is_active  AS is_active_a,
      b.id         AS id_b,
      b.name       AS name_b,
      b.surname    AS surname_b,
      b.email      AS email_b,
      b.phone      AS phone_b,
      b.created_at AS created_b,
      b.is_active  AS is_active_b,
      CASE
        WHEN a.email IS NOT NULL
          AND lower(trim(a.email)) = lower(trim(b.email))
          AND lower(trim(a.email)) <> ''
          AND lower(trim(a.name)) = lower(trim(b.name))
          AND lower(trim(a.surname)) = lower(trim(b.surname))
          THEN 'email_and_name'
        WHEN a.email IS NOT NULL
          AND lower(trim(a.email)) = lower(trim(b.email))
          AND lower(trim(a.email)) <> ''
          THEN 'email'
        ELSE 'name'
      END AS match_reason
    FROM public.clients a
    JOIN public.clients b ON b.company_id = a.company_id AND b.id > a.id
    WHERE a.company_id = p_company_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
      AND (
        -- Same email (non-empty)
        (
          a.email IS NOT NULL AND b.email IS NOT NULL
          AND lower(trim(a.email)) = lower(trim(b.email))
          AND lower(trim(a.email)) <> ''
        )
        OR
        -- Same name + surname (case-insensitive, both non-empty)
        (
          a.name IS NOT NULL AND b.name IS NOT NULL
          AND a.surname IS NOT NULL AND b.surname IS NOT NULL
          AND lower(trim(a.name)) = lower(trim(b.name))
          AND lower(trim(a.surname)) = lower(trim(b.surname))
          AND lower(trim(a.name)) <> ''
          AND lower(trim(a.surname)) <> ''
        )
      )
  )
  SELECT DISTINCT ON (LEAST(id_a, id_b), GREATEST(id_a, id_b))
    id_a, name_a, surname_a, email_a, phone_a, created_a, is_active_a,
    id_b, name_b, surname_b, email_b, phone_b, created_b, is_active_b,
    match_reason
  FROM candidates
  ORDER BY LEAST(id_a, id_b), GREATEST(id_a, id_b), match_reason DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;
COMMENT ON FUNCTION public.detect_duplicate_clients(uuid) IS
  'Returns candidate duplicate client pairs within a company (same email OR same name+surname). '
  'Caller must be owner or admin of the company.';

-- 2. merge_clients ---------------------------------------------------------------
-- Keeps p_keep_id, discards p_discard_id.
-- p_merged_data: jsonb with the fields to set on the kept client after merge:
--   { name, surname, email, phone, business_name, ... }
-- All related records from p_discard_id are re-assigned to p_keep_id.
-- The discarded client is soft-deleted.

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

  -- Fetch and validate: both must be in the same company, caller must be owner/admin
  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  WHERE c.id = p_keep_id AND c.deleted_at IS NULL;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'keep client not found or already deleted');
  END IF;

  -- Ensure discard also belongs to same company
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_discard_id AND company_id = v_company_id AND deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'discard client not found, already deleted, or belongs to different company');
  END IF;

  -- Verify caller is owner or admin of that company
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

  -- Reassign related records from discard → keep --------------------------------

  -- bookings
  UPDATE public.bookings SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_bookings = ROW_COUNT;

  -- invoices
  UPDATE public.invoices SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_invoices = ROW_COUNT;

  -- quotes
  UPDATE public.quotes SET client_id = p_keep_id WHERE client_id = p_discard_id;
  GET DIAGNOSTICS v_reassigned_quotes = ROW_COUNT;

  -- devices
  UPDATE public.devices SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_documents
  UPDATE public.client_documents SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_assignments (avoid duplicate PK: keep unique professional_id assignments)
  UPDATE public.client_assignments
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.client_assignments ca2
      WHERE ca2.client_id = p_keep_id
        AND ca2.professional_id = client_assignments.professional_id
    );
  DELETE FROM public.client_assignments WHERE client_id = p_discard_id;

  -- clients_tags (avoid duplicate PK: keep unique tag assignments)
  UPDATE public.clients_tags
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.clients_tags ct2
      WHERE ct2.client_id = p_keep_id
        AND ct2.tag_id = clients_tags.tag_id
    );
  DELETE FROM public.clients_tags WHERE client_id = p_discard_id;

  -- client_contacts
  UPDATE public.client_contacts SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_portal_users
  UPDATE public.client_portal_users
    SET client_id = p_keep_id
  WHERE client_id = p_discard_id
    AND NOT EXISTS (
      SELECT 1 FROM public.client_portal_users cpu2
      WHERE cpu2.client_id = p_keep_id
        AND cpu2.email = client_portal_users.email
        AND cpu2.company_id = client_portal_users.company_id
    );
  DELETE FROM public.client_portal_users
  WHERE client_id = p_discard_id;

  -- projects (kanban)
  UPDATE public.projects SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- client_inactivity_log
  UPDATE public.client_inactivity_log SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- tickets
  UPDATE public.tickets SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- addresses: reassign, skipping duplicates by label+city combo
  UPDATE public.addresses SET client_id = p_keep_id WHERE client_id = p_discard_id;

  -- Update the kept client with the merged field selection from p_merged_data ----
  UPDATE public.clients
  SET
    name           = COALESCE(NULLIF(p_merged_data->>'name',        ''), name),
    surname        = COALESCE(NULLIF(p_merged_data->>'surname',     ''), surname),
    email          = COALESCE(NULLIF(p_merged_data->>'email',       ''), email),
    phone          = COALESCE(NULLIF(p_merged_data->>'phone',       ''), phone),
    business_name  = COALESCE(NULLIF(p_merged_data->>'business_name',''), business_name),
    trade_name     = COALESCE(NULLIF(p_merged_data->>'trade_name',  ''), trade_name),
    notes          = COALESCE(NULLIF(p_merged_data->>'notes',       ''), notes)
  WHERE id = p_keep_id;

  -- Soft-delete the discarded client --------------------------------------------
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
COMMENT ON FUNCTION public.merge_clients(uuid, uuid, jsonb) IS
  'Merges two clients: reassigns all related records to p_keep_id, applies field overrides '
  'from p_merged_data, and soft-deletes p_discard_id. Caller must be owner or admin.';

NOTIFY pgrst, 'reload schema';
