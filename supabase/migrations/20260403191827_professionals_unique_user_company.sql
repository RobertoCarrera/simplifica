-- ============================================================
-- Prevent duplicate professional records per user+company
--
-- Problem: link_or_create_my_professional() can create duplicates
-- when a user's company_id in public.users differs from their
-- existing professional record's company_id. This happened when
-- the user's company_id was accidentally changed.
--
-- Fix 1: Add UNIQUE partial index on (user_id, company_id) where
-- user_id IS NOT NULL — prevents multiple pro records for the
-- same user in the same company.
--
-- Fix 2: Improve the RPC to also search across ALL companies for
-- an existing user_id match (Case A2), so if the user's
-- company_id changes, we still find their existing record.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Unique partial index (only when user_id is set)
-- ─────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_user_company_unique
  ON public.professionals (user_id, company_id)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Improved RPC: add Case A2 — find pro by user_id in ANY company
--    This returns the existing record even if the user's current
--    company_id doesn't match (cross-company self-lookup).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_or_create_my_professional()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id    uuid;
  v_user_id    uuid;
  v_company_id uuid;
  v_email      text;
  v_full_name  text;
  v_prof_id    uuid;
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

  -- ── Case A: row already linked by user_id in SAME company ──
  SELECT id INTO v_prof_id
    FROM public.professionals
   WHERE user_id = v_user_id
     AND company_id = v_company_id
   LIMIT 1;

  IF v_prof_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_prof_id, 'is_new', false);
  END IF;

  -- ── Case A2: row linked by user_id in ANY company ──────────
  -- This catches cases where user's company_id changed but their
  -- professional record still exists in the original company.
  SELECT id INTO v_prof_id
    FROM public.professionals
   WHERE user_id = v_user_id
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
