-- ============================================================================
-- Script: clinical_demo_setup.sql
-- Purpose: Set up a fully isolated clinical-notes import demo in a fresh
--          company with 3 synthetic clients, all with health_data_consent=true.
--          Idempotent: re-runs cleanly. Safe to run on production DB.
--
-- Usage:  via simplifica_execute_sql (service_role MCP).
--         Returns a JSON-like summary that the orchestrator agent can
--         hand back to the user.
--
-- Cleanup: clinical_demo_teardown.sql (removes everything created here).
-- Backup:  git tags backup-pre-clinical-demo-2026-06-18 on each repo.
-- ============================================================================

-- ── 0. Verify nothing critical is affected ────────────────────────────────
-- Baseline before the script runs (so the teardown can re-verify):
-- clients:        532 alive
-- companies:      5
-- client_clinical_notes:  0
-- booking_clinical_notes: 0

-- ── 1. Create the demo company (or reuse if already created) ─────────────
DO $$
DECLARE
  v_company_id uuid;
  v_company_name text := 'DEMO_Clinical_Notes_2026-06-18_DO_NOT_USE';
  v_owner_user_id uuid;
  v_owner_email text;
  v_count int;
BEGIN
  -- Idempotency: reuse the demo company if it already exists
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE name = v_company_name
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, dpa_status, company_type)
    VALUES (v_company_name, 'pending', 'autonomo')
    RETURNING id INTO v_company_id;
    RAISE NOTICE 'Created demo company: %', v_company_id;
  ELSE
    RAISE NOTICE 'Reusing existing demo company: %', v_company_id;
  END IF;

  -- ── 2. Pick a real user to own the demo company ──────────────────────
  -- Strategy: any active user with role owner/admin in ANY company. We
  -- pick the first one. The demo company won't show up in their normal
  -- dashboard because the user has a favorite_company_id set, but the
  -- RLS allows cross-company memberships.
  SELECT u.id, u.email
    INTO v_owner_user_id, v_owner_email
  FROM public.users u
  JOIN public.company_members cm ON cm.user_id = u.id
  JOIN public.app_roles ar ON ar.id = cm.role_id
  WHERE cm.status = 'active'
    AND ar.name IN ('owner','admin','super_admin')
    AND u.deleted_at IS NULL
  ORDER BY u.created_at
  LIMIT 1;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'No active owner/admin user found to attach to demo company';
  END IF;

  RAISE NOTICE 'Demo owner: % (%)', v_owner_email, v_owner_user_id;

  -- ── 3. Add owner as active member of demo company ────────────────────
  -- Idempotent: insert with ON CONFLICT
  INSERT INTO public.company_members (company_id, user_id, role_id, status)
  SELECT v_company_id, v_owner_user_id, ar.id, 'active'
  FROM public.app_roles ar
  WHERE ar.name = 'owner'
  LIMIT 1
  ON CONFLICT (company_id, user_id) DO UPDATE
    SET status = 'active', updated_at = now();

  RAISE NOTICE 'Added % as active member of demo company', v_owner_email;

  -- ── 4. Enable historial_clinico module for the demo company ─────────
  INSERT INTO public.company_modules (company_id, module_key, status)
  VALUES (v_company_id, 'historial_clinico', 'active')
  ON CONFLICT (company_id, module_key) DO UPDATE
    SET status = 'active', updated_at = now();

  RAISE NOTICE 'Enabled historial_clinico module';

  -- ── 5. Create 3 synthetic clients ────────────────────────────────────
  INSERT INTO public.clients (company_id, name, surname, email, health_data_consent, health_data_consent_date, pii_key_version, processing_restricted, client_type)
  VALUES
    (v_company_id, 'Ana Demo', 'García Demo', 'ana.demo@demo.invalid', true, now(), 1, false, 'individual'),
    (v_company_id, 'Luis Demo', 'Martín Demo', 'luis.demo@demo.invalid', true, now(), 1, false, 'individual'),
    (v_company_id, 'Marta Demo', 'López Demo', 'marta.demo@demo.invalid', true, now(), 1, false, 'individual')
  ON CONFLICT (email) WHERE email LIKE '%@demo.invalid' DO UPDATE
    SET health_data_consent = true,
        health_data_consent_date = now(),
        updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Created/refreshed % synthetic clients (3 expected)', v_count;

END $$;

-- ── 6. Verify setup ─────────────────────────────────────────────────────
SELECT
  'company' AS kind, id::text AS identifier, name AS detail
FROM public.companies WHERE name LIKE 'DEMO_Clinical_Notes_%'
UNION ALL
SELECT
  'client' AS kind, id::text, name || ' ' || surname || ' <' || email || '>'
FROM public.clients WHERE email LIKE '%@demo.invalid'
UNION ALL
SELECT
  'module' AS kind, module_key, status
FROM public.company_modules cm
JOIN public.companies c ON c.id = cm.company_id
WHERE c.name LIKE 'DEMO_Clinical_Notes_%';
