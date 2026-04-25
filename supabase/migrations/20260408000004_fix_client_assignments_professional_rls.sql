-- Fix: client_assignments & can_view_client don't handle professional_id path
--
-- Problem: client_assignments.professional_id (FK → professionals.id) was saved
-- without the corresponding company_member_id column. The RLS function
-- can_view_client checks only via company_member_id, so professionals who
-- have clients assigned via professional_id could never see those clients.
--
-- Fixes:
--   1. Update can_view_client to also check the professional_id path
--   2. Backfill company_member_id in existing assignments where it is NULL

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill company_member_id for existing assignments
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.client_assignments ca
SET    company_member_id = cm.id
FROM   public.professionals p
JOIN   public.company_members cm
       ON  cm.user_id    = p.user_id
       AND cm.company_id = p.company_id
       AND cm.status      = 'active'
WHERE  ca.professional_id = p.id
  AND  ca.company_member_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace can_view_client to handle both lookup paths
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_client(
  p_client_company_id uuid,
  p_client_auth_user_id uuid,
  p_client_created_by uuid,
  p_client_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public_user_id uuid;
BEGIN
  -- Fast path 1: client accessing own record
  IF p_client_auth_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 2: creator always sees their clients
  IF p_client_created_by = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 3: admin/owner of the company sees all clients
  IF p_client_company_id = ANY(get_my_company_ids()) THEN
    IF current_user_is_admin(p_client_company_id) THEN
      RETURN true;
    END IF;

    -- Non-admin staff: resolve public user ID once
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    IF v_public_user_id IS NOT NULL THEN
      -- Path A: assignment recorded via company_member_id (legacy)
      IF EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.client_assignments ca ON ca.company_member_id = cm.id
        WHERE cm.user_id         = v_public_user_id
          AND cm.company_id      = p_client_company_id
          AND cm.status          = 'active'
          AND ca.client_id       = p_client_id
      ) THEN
        RETURN true;
      END IF;

      -- Path B: assignment recorded via professional_id (current frontend)
      RETURN EXISTS (
        SELECT 1
        FROM public.professionals p
        JOIN public.client_assignments ca ON ca.professional_id = p.id
        WHERE p.user_id      = v_public_user_id
          AND p.company_id   = p_client_company_id
          AND p.is_active    = true
          AND ca.client_id   = p_client_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;
