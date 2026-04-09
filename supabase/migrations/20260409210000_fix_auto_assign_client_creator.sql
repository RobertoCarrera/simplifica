-- Migration: Fix auto_assign_client_creator trigger and can_view_client RLS helper
--
-- Bugs fixed:
--   1. Trigger used `cm.user_id = NEW.created_by` but company_members.user_id
--      references public.users(id) while created_by references auth.users(id).
--      They are different UUIDs → the query never returned a row → no assignment.
--   2. Trigger only populated company_member_id; since migration 20260404100000
--      client_assignments also has professional_id (used by newer RLS policies).
--      The trigger must populate both columns.
--   3. can_view_client() checked assignments only via company_member_id JOIN.
--      Assignments created after 20260404100000 may have professional_id set
--      (and company_member_id NULL), so the check must cover both paths.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix the auto_assign_client_creator trigger function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_assign_client_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_creator_role   TEXT;
    v_member_id      UUID;
    v_prof_id        UUID;
    v_public_user_id UUID;
BEGIN
    -- Only act when created_by is set
    IF NEW.created_by IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve public.users.id from auth.users.id (created_by stores auth.users.id)
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = NEW.created_by
    LIMIT 1;

    IF v_public_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve the creator's role & company_member id in the client's company
    SELECT ar.name, cm.id
    INTO   v_creator_role, v_member_id
    FROM   public.company_members cm
    JOIN   public.app_roles ar ON ar.id = cm.role_id
    WHERE  cm.user_id    = v_public_user_id   -- ← FIXED: was NEW.created_by (wrong FK)
    AND    cm.company_id = NEW.company_id
    AND    cm.status     = 'active'
    LIMIT  1;

    -- Admins / owners already have global RLS access; don't clutter client_assignments
    IF v_creator_role IS NULL OR v_creator_role IN ('owner', 'admin', 'super_admin') THEN
        RETURN NEW;
    END IF;

    -- Also look up the professionals record (populated since 20260404100000)
    SELECT id INTO v_prof_id
    FROM public.professionals
    WHERE user_id    = v_public_user_id
    AND   company_id = NEW.company_id
    LIMIT 1;

    -- Insert assignment with both company_member_id AND professional_id when available
    INSERT INTO public.client_assignments (client_id, company_member_id, professional_id, assigned_by)
    VALUES (NEW.id, v_member_id, v_prof_id, NEW.created_by)
    ON CONFLICT (client_id, company_member_id) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Re-attach the trigger (DROP+CREATE to apply the new function body)
DROP TRIGGER IF EXISTS trg_auto_assign_client_creator ON public.clients;
CREATE TRIGGER trg_auto_assign_client_creator
    AFTER INSERT ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_assign_client_creator();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix can_view_client() to check both assignment paths
--    (company_member_id for legacy rows, professional_id for new rows)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_client(
  p_client_company_id   uuid,
  p_client_auth_user_id uuid,
  p_client_created_by   uuid,
  p_client_id           uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_public_user_id uuid;
BEGIN
  -- Fast path 1: the end-client accessing their own portal record
  IF p_client_auth_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 2: creator always sees their own clients
  IF p_client_created_by = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 3: admin/owner of the company sees all clients
  IF p_client_company_id = ANY(get_my_company_ids()) THEN
    IF current_user_is_admin(p_client_company_id) THEN
      RETURN true;
    END IF;

    -- Non-admin staff: resolve their public user id once
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    IF v_public_user_id IS NOT NULL THEN
      -- Path A: assignment via company_member_id (legacy rows)
      IF EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.client_assignments ca ON ca.company_member_id = cm.id
        WHERE cm.user_id    = v_public_user_id
          AND cm.company_id = p_client_company_id
          AND cm.status     = 'active'
          AND ca.client_id  = p_client_id
      ) THEN
        RETURN true;
      END IF;

      -- Path B: assignment via professional_id (rows after migration 20260404100000)
      IF EXISTS (
        SELECT 1
        FROM public.professionals p
        JOIN public.client_assignments ca ON ca.professional_id = p.id
        WHERE p.user_id    = v_public_user_id
          AND p.company_id = p_client_company_id
          AND ca.client_id = p_client_id
      ) THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verify: quick sanity check — trigger must exist after this migration
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'clients'
      AND t.tgname  = 'trg_auto_assign_client_creator'
  ) THEN
    RAISE EXCEPTION 'trg_auto_assign_client_creator trigger is missing after migration';
  END IF;
END $$;
