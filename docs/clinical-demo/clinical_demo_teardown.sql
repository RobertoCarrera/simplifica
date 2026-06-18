-- ============================================================================
-- Script: clinical_demo_teardown.sql
-- Purpose: Remove the clinical-notes import demo created by clinical_demo_setup.sql.
--          Removes: 1 demo company, 3 synthetic clients, the owner membership,
--          3 demo clinical notes. Restores DB to pre-demo state.
--
-- ⚠️  IDEMPOTENT: safe to re-run. Will report "0 rows deleted" if already clean.
-- ⚠️  DRY-RUN SUPPORTED: replace DELETE with SELECT to preview.
-- ⚠️  AFFECTED ROWS ARE LOGGED: the script reports exact counts.
--
-- When to run: AFTER the client sees the demo. NEVER before.
-- Backup:     git tag backup-pre-clinical-demo-2026-06-18 already exists.
-- ============================================================================

DO $$
DECLARE
  v_company_id uuid;
  v_clients_deleted int;
  v_notes_deleted int;
  v_members_deleted int;
  v_modules_deleted int;
  v_company_deleted int;
  v_remaining int;
BEGIN
  -- Locate demo company
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE name = 'DEMO_Clinical_Notes_2026-06-18_DO_NOT_USE'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No demo company found — already cleaned up. Nothing to do.';
    RETURN;
  END IF;

  RAISE NOTICE 'Tearing down demo company: %', v_company_id;

  -- 1. Delete clinical notes (cascade: depends on client_id)
  -- Notes reference clients by FK, so we must delete notes before clients.
  DELETE FROM public.client_clinical_notes
  WHERE client_id IN (
    SELECT id FROM public.clients WHERE company_id = v_company_id
  );
  GET DIAGNOSTICS v_notes_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % clinical notes', v_notes_deleted;

  -- 2. Delete synthetic clients
  -- Soft-delete first (sets deleted_at) then hard-delete to fully remove
  UPDATE public.clients
  SET deleted_at = now()
  WHERE company_id = v_company_id;
  DELETE FROM public.clients WHERE company_id = v_company_id;
  GET DIAGNOSTICS v_clients_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % synthetic clients', v_clients_deleted;

  -- 3. Delete company_modules entries for the demo company
  DELETE FROM public.company_modules WHERE company_id = v_company_id;
  GET DIAGNOSTICS v_modules_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % company_modules rows', v_modules_deleted;

  -- 4. Delete company_members entries for the demo company
  DELETE FROM public.company_members WHERE company_id = v_company_id;
  GET DIAGNOSTICS v_members_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % company_members rows', v_members_deleted;

  -- 5. Delete the demo company itself
  DELETE FROM public.companies WHERE id = v_company_id;
  GET DIAGNOSTICS v_company_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % company row', v_company_deleted;

  -- 6. Sanity check
  SELECT COUNT(*) INTO v_remaining
  FROM public.companies
  WHERE name = 'DEMO_Clinical_Notes_2026-06-18_DO_NOT_USE';

  IF v_remaining = 0 THEN
    RAISE NOTICE 'Teardown complete. Demo fully removed.';
  ELSE
    RAISE WARNING 'Teardown incomplete: % demo companies still exist', v_remaining;
  END IF;

END $$;

-- ── Verify post-teardown state matches pre-demo baseline ──────────────────
-- Expected: clients=914 total / 532 alive, companies=5, client_notes=0
SELECT
  (SELECT COUNT(*) FROM public.clients) AS clients_total,
  (SELECT COUNT(*) FROM public.clients WHERE deleted_at IS NULL) AS clients_alive,
  (SELECT COUNT(*) FROM public.client_clinical_notes) AS client_notes_total,
  (SELECT COUNT(*) FROM public.booking_clinical_notes) AS booking_notes_total,
  (SELECT COUNT(*) FROM public.companies) AS companies_total,
  (SELECT COUNT(*) FROM public.companies WHERE name LIKE 'DEMO_%') AS demo_companies_remaining;
