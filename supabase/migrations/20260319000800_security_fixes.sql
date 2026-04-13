-- Migration: Security fixes from Supabase advisor
-- 1. Fix mutable search_path on SECURITY DEFINER functions
-- 2. Fix overly-permissive project_files RLS policies
-- 3. Add missing RLS policies on tables with RLS enabled but no policies

-- ============================================================
-- 1. FIX FUNCTION search_path (prevents search_path injection)
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_stage_coverage_after_hide(p_company_id uuid, p_stage_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_category text;
  v_visible_count int;
BEGIN
  SELECT workflow_category INTO v_category
  FROM ticket_stages
  WHERE id = p_stage_id;

  IF v_category IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*)
  INTO v_visible_count
  FROM ticket_stages ts
  WHERE ts.workflow_category = v_category
    AND ts.deleted_at IS NULL
    AND (
      ts.company_id = p_company_id
      OR
      (ts.company_id IS NULL
       AND ts.id != p_stage_id
       AND NOT EXISTS (
         SELECT 1 FROM hidden_stages hs
         WHERE hs.company_id = p_company_id
           AND hs.stage_id = ts.id
       )
      )
    );

  RETURN v_visible_count > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin_by_id(p_user_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
    is_admin boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = p_user_id
          AND ar.name = 'super_admin'
          AND u.active = true
    ) INTO is_admin;

    RETURN is_admin;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin_real()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
      AND u.active = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.my_company_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
  SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.join_waiting_list(p_user_id uuid, p_class_session_id bigint)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
    v_entry_exists boolean;
    v_result json;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.waiting_list
        WHERE user_id = p_user_id
        AND class_session_id = p_class_session_id
    ) INTO v_entry_exists;

    IF v_entry_exists THEN
        SELECT row_to_json(w) INTO v_result
        FROM public.waiting_list w
        WHERE user_id = p_user_id
        AND class_session_id = p_class_session_id;

        RETURN v_result;
    END IF;

    INSERT INTO public.waiting_list (
        user_id,
        class_session_id,
        join_date_time,
        status
    )
    VALUES (
        p_user_id,
        p_class_session_id,
        NOW(),
        'waiting'
    )
    RETURNING row_to_json(waiting_list.*) INTO v_result;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_new_owner_from_invite(
    p_invitation_token text,
    p_company_name text,
    p_company_nif text,
    p_user_name text,
    p_user_surname text
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_invitation record;
  v_new_company_id uuid;
  v_user_id uuid;
  v_auth_user_id uuid;
  v_owner_role_id uuid;
BEGIN
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    return json_build_object('success', false, 'error', 'Not authenticated');
  end if;

  select * into v_invitation
  from public.company_invitations
  where token = p_invitation_token
    and status = 'pending'
    and role = 'owner';

  if v_invitation.id is null then
    return json_build_object('success', false, 'error', 'Invitation not found or invalid');
  end if;

  select id into v_owner_role_id from public.app_roles where name = 'owner';
  if v_owner_role_id is null then
      return json_build_object('success', false, 'error', 'Owner role configuration missing in database');
  end if;

  insert into public.companies (name, nif)
  values (p_company_name, p_company_nif)
  returning id into v_new_company_id;

  insert into public.users (
      auth_user_id,
      company_id,
      app_role_id,
      name,
      surname,
      email,
      active
  )
  values (
      v_auth_user_id,
      v_new_company_id,
      v_owner_role_id,
      p_user_name,
      p_user_surname,
      v_invitation.email,
      true
  )
  on conflict (auth_user_id) do update
  set
      company_id = v_new_company_id,
      app_role_id = v_owner_role_id,
      name = p_user_name,
      surname = p_user_surname,
      active = true,
      updated_at = now()
  returning id into v_user_id;

  insert into public.company_members (
      user_id,
      company_id,
      role_id,
      status
  ) values (
      v_user_id,
      v_new_company_id,
      v_owner_role_id,
      'active'
  )
  on conflict (user_id, company_id) do update
  set
    role_id = v_owner_role_id,
    status = 'active',
    updated_at = now();

  update public.company_invitations
  set
    status = 'accepted',
    responded_at = now()
  where id = v_invitation.id;

  return json_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'user_id', v_user_id
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$function$;

-- get_effective_modules is long — add search_path via ALTER (supported since PG15)
DO $$ BEGIN
  ALTER FUNCTION public.get_effective_modules(uuid) SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_effective_modules(uuid) not found, skipping';
END $$;

-- ============================================================
-- 2. FIX project_files: drop the always-true permissive policies
--    Keep delete_own_file and insert_own_file (use created_by = auth.uid())
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can delete files" ON public.project_files;
DROP POLICY IF EXISTS "Authenticated users can insert files" ON public.project_files;

-- Tighten insert: only allow if the project belongs to caller's company
DROP POLICY IF EXISTS insert_own_file ON public.project_files;
CREATE POLICY insert_own_file ON public.project_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.company_members cm ON cm.company_id = p.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE p.id = project_files.project_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- Tighten delete: only files within caller's company's projects
DROP POLICY IF EXISTS delete_own_file ON public.project_files;
CREATE POLICY delete_own_file ON public.project_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.company_members cm ON cm.company_id = p.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE p.id = project_files.project_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- ============================================================
-- 3. ADD RLS POLICIES to tables that have RLS but no policies
-- (All wrapped in DO blocks to skip tables that don't exist yet)
-- ============================================================

DO $$
BEGIN
  -- company_stage_order: tenant isolation via company_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_stage_order') THEN
    DROP POLICY IF EXISTS "company_stage_order_select" ON public.company_stage_order;
    EXECUTE $pol$
      CREATE POLICY "company_stage_order_select" ON public.company_stage_order
        FOR SELECT TO authenticated
        USING (
          company_id IN (
            SELECT cm.company_id FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
    DROP POLICY IF EXISTS "company_stage_order_write" ON public.company_stage_order;
    EXECUTE $pol$
      CREATE POLICY "company_stage_order_write" ON public.company_stage_order
        FOR ALL TO authenticated
        USING (
          company_id IN (
            SELECT cm.company_id FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            JOIN public.app_roles ar ON ar.id = cm.role_id
            WHERE u.auth_user_id = auth.uid()
              AND cm.status = 'active'
              AND ar.name IN ('owner', 'admin')
          )
        )
        WITH CHECK (
          company_id IN (
            SELECT cm.company_id FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            JOIN public.app_roles ar ON ar.id = cm.role_id
            WHERE u.auth_user_id = auth.uid()
              AND cm.status = 'active'
              AND ar.name IN ('owner', 'admin')
          )
        )
    $pol$;
  END IF;

  -- company_ticket_sequences: only readable by company members, no direct writes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_ticket_sequences') THEN
    DROP POLICY IF EXISTS "company_ticket_sequences_select" ON public.company_ticket_sequences;
    EXECUTE $pol$
      CREATE POLICY "company_ticket_sequences_select" ON public.company_ticket_sequences
        FOR SELECT TO authenticated
        USING (
          company_id IN (
            SELECT cm.company_id FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
  END IF;

  -- invoice_meta: scoped through the invoices table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_meta') THEN
    DROP POLICY IF EXISTS "invoice_meta_select" ON public.invoice_meta;
    EXECUTE $pol$
      CREATE POLICY "invoice_meta_select" ON public.invoice_meta
        FOR SELECT TO authenticated
        USING (
          invoice_id IN (
            SELECT i.id FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
    DROP POLICY IF EXISTS "invoice_meta_write" ON public.invoice_meta;
    EXECUTE $pol$
      CREATE POLICY "invoice_meta_write" ON public.invoice_meta
        FOR ALL TO authenticated
        USING (
          invoice_id IN (
            SELECT i.id FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
        WITH CHECK (
          invoice_id IN (
            SELECT i.id FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
  END IF;

  -- public_bookings: public insert (booking form), company members can read/manage
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'public_bookings') THEN
    DROP POLICY IF EXISTS "public_bookings_anon_insert" ON public.public_bookings;
    EXECUTE $pol$
      CREATE POLICY "public_bookings_anon_insert" ON public.public_bookings
        FOR INSERT TO anon, authenticated
        WITH CHECK (true)
    $pol$;
    DROP POLICY IF EXISTS "public_bookings_member_select" ON public.public_bookings;
    EXECUTE $pol$
      CREATE POLICY "public_bookings_member_select" ON public.public_bookings
        FOR SELECT TO authenticated
        USING (
          company_slug IN (
            SELECT c.slug FROM public.companies c
            JOIN public.company_members cm ON cm.company_id = c.id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
    DROP POLICY IF EXISTS "public_bookings_member_delete" ON public.public_bookings;
    EXECUTE $pol$
      CREATE POLICY "public_bookings_member_delete" ON public.public_bookings
        FOR DELETE TO authenticated
        USING (
          company_slug IN (
            SELECT c.slug FROM public.companies c
            JOIN public.company_members cm ON cm.company_id = c.id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
  END IF;

  -- verifactu_invoice_meta: same pattern as invoice_meta
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'verifactu_invoice_meta') THEN
    DROP POLICY IF EXISTS "verifactu_invoice_meta_select" ON public.verifactu_invoice_meta;
    EXECUTE $pol$
      CREATE POLICY "verifactu_invoice_meta_select" ON public.verifactu_invoice_meta
        FOR SELECT TO authenticated
        USING (
          invoice_id IN (
            SELECT i.id FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
    DROP POLICY IF EXISTS "verifactu_invoice_meta_write" ON public.verifactu_invoice_meta;
    EXECUTE $pol$
      CREATE POLICY "verifactu_invoice_meta_write" ON public.verifactu_invoice_meta
        FOR ALL TO authenticated
        USING (
          invoice_id IN (
            SELECT i.id FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
        WITH CHECK (
          invoice_id IN (
            SELECT i.id FROM public.invoices i
            JOIN public.company_members cm ON cm.company_id = i.company_id
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
          )
        )
    $pol$;
  END IF;
END;
$$;
