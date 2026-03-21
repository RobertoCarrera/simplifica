-- Migration: Client Ownership & Sharing
-- Description:
--   1. Add `created_by` (auth.users FK) to `clients` table to track who created each client.
--   2. Update `upsert_client` RPC to record `created_by` on INSERT (never overwritten on UPDATE).
--   3. Trigger: auto-assign the creating professional to the new client so RLS SELECT works immediately.
--      Admin/owner creators are NOT auto-assigned (they already have global access via RLS).
--   4. Update `clients_select_policy` to also allow `created_by = auth.uid()` as a direct bypass
--      (safety net for existing rows that pre-date the trigger, or edge cases).
--   5. Update `clients_update_policy` similarly.
--   6. Update "Manage assignments" on `client_assignments` to allow the `created_by` user
--      to manage assignments for their own clients (i.e. "share" them with other professionals).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add created_by column to clients
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Update upsert_client RPC to capture created_by on INSERT
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_client(
    payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_id uuid;
    result_record jsonb;
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();

    IF payload->>'id' IS NOT NULL THEN
        new_id := (payload->>'id')::uuid;
    ELSE
        new_id := gen_random_uuid();
    END IF;

    INSERT INTO public.clients (
        id,
        name,
        apellidos,
        dni,
        phone,
        client_type,
        business_name,
        cif_nif,
        trade_name,
        legal_representative_name,
        legal_representative_dni,
        email,
        direccion_id,
        mercantile_registry_data,
        metadata,
        company_id,
        created_by,
        created_at,
        updated_at
    )
    VALUES (
        new_id,
        COALESCE(payload->>'name', ''),
        COALESCE(payload->>'apellidos', ''),
        COALESCE(payload->>'dni', ''),
        COALESCE(payload->>'phone', ''),
        COALESCE(payload->>'client_type', 'individual'),
        payload->>'business_name',
        payload->>'cif_nif',
        payload->>'trade_name',
        payload->>'legal_representative_name',
        payload->>'legal_representative_dni',
        payload->>'email',
        (payload->>'direccion_id')::uuid,
        CASE
            WHEN payload->'mercantile_registry_data' IS NULL OR jsonb_typeof(payload->'mercantile_registry_data') = 'null' THEN null
            ELSE payload->'mercantile_registry_data'
        END,
        CASE
            WHEN payload->'metadata' IS NULL OR jsonb_typeof(payload->'metadata') = 'null' THEN '{}'::jsonb
            ELSE payload->'metadata'
        END,
        COALESCE((payload->>'company_id')::uuid, (payload->>'usuario_id')::uuid, current_user_id),
        current_user_id,  -- created_by = calling user
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        name                        = EXCLUDED.name,
        apellidos                   = EXCLUDED.apellidos,
        dni                         = EXCLUDED.dni,
        phone                       = EXCLUDED.phone,
        client_type                 = EXCLUDED.client_type,
        business_name               = EXCLUDED.business_name,
        cif_nif                     = EXCLUDED.cif_nif,
        trade_name                  = EXCLUDED.trade_name,
        legal_representative_name   = EXCLUDED.legal_representative_name,
        legal_representative_dni    = EXCLUDED.legal_representative_dni,
        email                       = EXCLUDED.email,
        direccion_id                = EXCLUDED.direccion_id,
        mercantile_registry_data    = EXCLUDED.mercantile_registry_data,
        metadata                    = EXCLUDED.metadata,
        company_id                  = COALESCE(clients.company_id, EXCLUDED.company_id),
        -- created_by is intentionally NOT updated: the original creator keeps ownership
        updated_at                  = NOW()
    RETURNING to_jsonb(clients.*) INTO result_record;

    RETURN result_record;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: auto-assign the creating professional to the new client
--    Only fires for non-admin/owner creators so they can immediately see the client.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_assign_client_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_creator_role   TEXT;
    v_member_id      UUID;
BEGIN
    -- Only act when created_by is set
    IF NEW.created_by IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolve the creator's role & company_member id in the client's company
    SELECT ar.name, cm.id
    INTO   v_creator_role, v_member_id
    FROM   public.company_members cm
    JOIN   public.app_roles ar ON ar.id = cm.role_id
    WHERE  cm.user_id   = NEW.created_by
    AND    cm.company_id = NEW.company_id
    AND    cm.status     = 'active'
    LIMIT  1;

    -- Admins/owners already have global RLS access; don't clutter client_assignments
    IF v_creator_role IS NULL OR v_creator_role IN ('owner', 'admin', 'super_admin') THEN
        RETURN NEW;
    END IF;

    -- Insert assignment (ignore if already exists)
    INSERT INTO public.client_assignments (client_id, company_member_id, assigned_by)
    VALUES (NEW.id, v_member_id, NEW.created_by)
    ON CONFLICT (client_id, company_member_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_client_creator ON public.clients;
CREATE TRIGGER trg_auto_assign_client_creator
    AFTER INSERT ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_assign_client_creator();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. clients_select_policy: also allow created_by = auth.uid() as direct bypass
--    (handles existing rows pre-dating the trigger, or edge cases where
--     company_members lookup fails for a brief moment)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;
CREATE POLICY "clients_select_policy" ON public.clients
    FOR SELECT USING (
        -- The end-client accessing their own portal record
        (auth_user_id = auth.uid())
        OR
        -- The professional who created this client always sees it
        (created_by = auth.uid())
        OR
        -- Staff via role/assignment
        EXISTS (
            SELECT 1
            FROM   public.company_members cm
            JOIN   public.app_roles ar ON ar.id = cm.role_id
            WHERE  cm.user_id    = auth.uid()
            AND    cm.company_id = clients.company_id
            AND    cm.status     = 'active'
            AND    (
                ar.name IN ('owner', 'admin', 'super_admin')
                OR
                EXISTS (
                    SELECT 1 FROM public.client_assignments ca
                    WHERE ca.client_id        = clients.id
                    AND   ca.company_member_id = cm.id
                )
            )
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. clients_update_policy: mirror the same logic
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients_update_policy" ON public.clients;
CREATE POLICY "clients_update_policy" ON public.clients
    FOR UPDATE USING (
        (auth_user_id = auth.uid())
        OR
        (created_by = auth.uid())
        OR
        EXISTS (
            SELECT 1
            FROM   public.company_members cm
            JOIN   public.app_roles ar ON ar.id = cm.role_id
            WHERE  cm.user_id    = auth.uid()
            AND    cm.company_id = clients.company_id
            AND    cm.status     = 'active'
            AND    (
                ar.name IN ('owner', 'admin', 'super_admin')
                OR
                EXISTS (
                    SELECT 1 FROM public.client_assignments ca
                    WHERE ca.client_id        = clients.id
                    AND   ca.company_member_id = cm.id
                )
            )
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. "Manage assignments": allow the client's creator to share their own clients
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Manage assignments" ON public.client_assignments;
CREATE POLICY "Manage assignments" ON public.client_assignments
    FOR ALL USING (
        -- Owner/admin can always manage assignments within their company
        EXISTS (
            SELECT 1
            FROM   public.company_members requester
            JOIN   public.app_roles ar ON ar.id = requester.role_id
            JOIN   public.company_members target_member
                       ON target_member.id = client_assignments.company_member_id
            WHERE  requester.user_id    = auth.uid()
            AND    requester.company_id = target_member.company_id
            AND    ar.name IN ('owner', 'admin', 'super_admin')
            AND    requester.status     = 'active'
        )
        OR
        -- The creator of the client can manage assignments for their own clients
        EXISTS (
            SELECT 1
            FROM   public.clients c
            WHERE  c.id         = client_assignments.client_id
            AND    c.created_by = auth.uid()
        )
    );
