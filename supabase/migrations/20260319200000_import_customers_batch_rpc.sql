-- Migration: import_customers_batch RPC
-- Replaces the Edge Function + proxy + CORS dance with a direct authenticated RPC.
-- Security guarantees:
--   • auth.uid() enforces the caller is authenticated
--   • company_id is derived server-side from the users table — cannot be spoofed
--   • Input is sanitised (HTML injection chars stripped, length-capped)
--   • client_type is whitelisted against known enum values
--   • Maximum 2 000 rows per call prevents DoS via oversized payloads
--   • SECURITY DEFINER + SET search_path prevents search_path injection
--   • GRANT only to the `authenticated` role (not PUBLIC)

CREATE OR REPLACE FUNCTION public.import_customers_batch(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_inserted      jsonb := '[]'::jsonb;
  v_errors        jsonb := '[]'::jsonb;
  v_row           jsonb;
  v_new_id        uuid;
  v_name          text;
  v_surname       text;
  v_email         text;
  v_phone         text;
  v_dni           text;
  v_client_type   text;
  v_business_name text;
  v_cif_nif       text;
  v_trade_name    text;
  v_metadata      jsonb;
  v_is_active     boolean;
BEGIN
  -- ── Authentication ─────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ── Authoritative company resolution (server-side only) ─────────────────── --
  SELECT company_id INTO v_company_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User has no associated company';
  END IF;

  -- ── Input validation ───────────────────────────────────────────────────────
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;

  IF jsonb_array_length(p_rows) > 2000 THEN
    RAISE EXCEPTION 'Maximum 2000 rows per import batch';
  END IF;

  -- ── Row processing ─────────────────────────────────────────────────────────
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      -- Sanitise: strip HTML/script injection chars and enforce max lengths
      v_name          := left(regexp_replace(coalesce(v_row->>'name',          'Cliente'),  E'[<>"\'`]', '', 'g'), 255);
      v_surname       := left(regexp_replace(coalesce(v_row->>'surname',       ''),         E'[<>"\'`]', '', 'g'), 255);
      v_email         := lower(trim(left(regexp_replace(coalesce(v_row->>'email', ''),      E'[<>"\'`\\s]', '', 'g'), 320)));
      v_phone         := left(regexp_replace(coalesce(v_row->>'phone',         ''),         E'[<>"\'`]', '', 'g'), 50);
      v_dni           := upper(left(regexp_replace(coalesce(v_row->>'dni',     ''),         '[^A-Za-z0-9]', '', 'g'), 20));
      v_client_type   := coalesce(v_row->>'client_type', 'individual');
      v_business_name := left(regexp_replace(coalesce(v_row->>'business_name', ''),         E'[<>"\'`]', '', 'g'), 255);
      v_cif_nif       := upper(left(regexp_replace(coalesce(v_row->>'cif_nif', ''),         '[^A-Za-z0-9]', '', 'g'), 20));
      v_trade_name    := left(regexp_replace(coalesce(v_row->>'trade_name',    ''),         E'[<>"\'`]', '', 'g'), 255);
      v_metadata      := coalesce(v_row->'metadata', '{}'::jsonb);
      v_is_active     := coalesce((v_row->>'is_active')::boolean, true);

      -- Whitelist client_type
      IF v_client_type NOT IN ('individual', 'business', 'self_employed', 'consumer') THEN
        v_client_type := 'individual';
      END IF;

      -- Require a non-empty name
      IF trim(v_name) = '' THEN
        v_name := 'Cliente';
      END IF;

      v_new_id := gen_random_uuid();

      INSERT INTO public.clients (
        id, company_id,
        name, surname, email, phone, dni,
        client_type, business_name, cif_nif, trade_name,
        metadata, is_active,
        created_at, updated_at
      ) VALUES (
        v_new_id, v_company_id,          -- company_id is always server-derived
        v_name,
        nullif(v_surname,       ''),
        nullif(v_email,         ''),
        nullif(v_phone,         ''),
        nullif(v_dni,           ''),
        v_client_type,
        nullif(v_business_name, ''),
        nullif(v_cif_nif,       ''),
        nullif(v_trade_name,    ''),
        v_metadata,
        v_is_active,
        now(), now()
      );

      v_inserted := v_inserted || jsonb_build_array(
        jsonb_build_object(
          'id',         v_new_id,
          'name',       v_name,
          'surname',    v_surname,
          'email',      v_email,
          'phone',      v_phone,
          'company_id', v_company_id,
          'created_at', now()
        )
      );

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('error', SQLERRM, 'row', v_row)
      );
    END;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'errors', v_errors);
END;
$$;

-- Least-privilege: only authenticated users may call this function
REVOKE ALL ON FUNCTION public.import_customers_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_customers_batch(jsonb) TO authenticated;
