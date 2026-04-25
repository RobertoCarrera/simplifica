-- ============================================================
-- Fix: professionals table RLS + link_or_create_my_professional RPC
--
-- Problem: users with role 'professional' (non-admin) cannot INSERT
-- or UPDATE rows in the professionals table, so "Mi Perfil" fails
-- with HTTP 403 on initial load.
--
-- Fix 1: Update professionals_update policy to allow a professional
--   to update their OWN row (where user_id = get_my_public_id()).
--   INSERT stays admin-only because we use the RPC for new rows.
--
-- Fix 2: SECURITY DEFINER RPC link_or_create_my_professional()
--   Handles three cases for the "Mi Perfil" flow:
--     A) professionals row exists with user_id set  -> return its id
--     B) professionals row exists but user_id IS NULL (invited, not linked)
--        -> UPDATE user_id, return its id
--     C) no row exists at all -> INSERT new row, return its id
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Fix UPDATE policy — allow professionals to update own row
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "professionals_update" ON professionals;

CREATE POLICY "professionals_update" ON professionals
  FOR UPDATE
  USING (
    current_user_is_admin(company_id)
    OR user_id = get_my_public_id()
  )
  WITH CHECK (
    current_user_is_admin(company_id)
    OR user_id = get_my_public_id()
  );

-- ─────────────────────────────────────────────────────────────
-- 2. Also allow INSERT for own row (fallback path if RPC not used)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "professionals_insert" ON professionals;

CREATE POLICY "professionals_insert" ON professionals
  FOR INSERT WITH CHECK (
    current_user_is_admin(company_id)
    OR (
      user_id = get_my_public_id()
      AND company_id = get_user_company_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. RPC: link_or_create_my_professional
--    Returns: { id: uuid, is_new: boolean }
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_or_create_my_professional()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id   uuid;
  v_user_id   uuid;
  v_company_id uuid;
  v_email     text;
  v_full_name text;
  v_prof_id   uuid;
BEGIN
  v_auth_id := auth.uid();
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve the public.users row for the current auth user
  SELECT u.id, u.company_id, u.email,
         TRIM(COALESCE(u.name, '') || ' ' || COALESCE(u.surname, ''))
    INTO v_user_id, v_company_id, v_email, v_full_name
    FROM public.users u
   WHERE u.auth_user_id = v_auth_id
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found in public.users for auth uid %', v_auth_id;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User % has no company_id', v_user_id;
  END IF;

  -- ── Case A: row already linked by user_id ────────────────
  SELECT id INTO v_prof_id
    FROM public.professionals
   WHERE user_id = v_user_id
     AND company_id = v_company_id
   LIMIT 1;

  IF v_prof_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_prof_id, 'is_new', false);
  END IF;

  -- ── Case B: row exists with matching email, user_id IS NULL ─
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_prof_id
      FROM public.professionals
     WHERE email = v_email
       AND company_id = v_company_id
       AND user_id IS NULL
     LIMIT 1;

    IF v_prof_id IS NOT NULL THEN
      UPDATE public.professionals
         SET user_id = v_user_id,
             updated_at = now()
       WHERE id = v_prof_id;

      RETURN jsonb_build_object('id', v_prof_id, 'is_new', false);
    END IF;
  END IF;

  -- ── Case C: no row at all, create one ────────────────────
  INSERT INTO public.professionals (
    user_id, company_id, display_name, email, is_active
  ) VALUES (
    v_user_id,
    v_company_id,
    NULLIF(TRIM(v_full_name), ''),
    v_email,
    true
  )
  RETURNING id INTO v_prof_id;

  RETURN jsonb_build_object('id', v_prof_id, 'is_new', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_or_create_my_professional() TO authenticated;
