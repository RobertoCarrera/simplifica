-- ============================================================================
-- Test: validate_project_association() trigger
-- Run as: psql -f this_file.sql
-- All operations run inside a transaction (BEGIN/ROLLBACK) so no data persists.
-- ============================================================================

\set ON_ERROR_STOP on
\set QUIET on

\echo '========================================'
\echo 'PROJECT ASSOCIABLE_TO TRIGGER TESTS'
\echo '========================================'

BEGIN;

DO $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
  v_team_user_id uuid;
  v_stage_id uuid;
  v_project_id uuid;
  v_err_text text;
  v_err_code text;
  v_pass integer := 0;
  v_fail integer := 0;
  v_original_setting text;
  v_company_exists boolean;
BEGIN
  -- ==========================================================================
  -- Discover fixtures
  -- ==========================================================================

  -- Pick a company that has both clients and company_members
  SELECT c.id INTO v_company_id
  FROM companies c
  WHERE EXISTS (SELECT 1 FROM clients cl WHERE cl.company_id = c.id)
    AND EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = c.id)
    AND EXISTS (SELECT 1 FROM project_stages ps WHERE ps.company_id = c.id)
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No suitable company found with clients, members, and stages — cannot run tests';
  END IF;

  -- Get a client
  SELECT cl.id INTO v_client_id
  FROM clients cl
  WHERE cl.company_id = v_company_id
  LIMIT 1;

  -- Get a team member (not the client's auth user if possible)
  SELECT cm.user_id INTO v_team_user_id
  FROM company_members cm
  WHERE cm.company_id = v_company_id
  LIMIT 1;

  -- Get a stage
  SELECT ps.id INTO v_stage_id
  FROM project_stages ps
  WHERE ps.company_id = v_company_id
  ORDER BY ps.position
  LIMIT 1;

  -- Save original setting
  SELECT project_associable_to INTO v_original_setting
  FROM company_settings
  WHERE company_id = v_company_id;

  RAISE NOTICE 'Test fixtures: company=%, client=%, team_user=%, stage=%', v_company_id, v_client_id, v_team_user_id, v_stage_id;
  RAISE NOTICE 'Original setting: % (will restore after tests)', COALESCE(v_original_setting, 'NULL (defaults to clients)');

  -- Ensure company_settings row exists with the column populated
  INSERT INTO company_settings (company_id, project_associable_to)
  VALUES (v_company_id, 'clients')
  ON CONFLICT (company_id) DO UPDATE SET project_associable_to = EXCLUDED.project_associable_to;

  -- ==========================================================================
  -- TEST SUITE 1: setting = 'clients'
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 1: project_associable_to = clients ===';

  UPDATE company_settings SET project_associable_to = 'clients' WHERE company_id = v_company_id;

  -- TEST 1a: INSERT with client_id (no assigned_to) → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 1a: INSERT project with client_id only (setting=clients) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, client_id, stage_id, name, priority)
    VALUES (v_company_id, v_client_id, v_stage_id, 'Test Project 1a', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 1a PASSED: Project created: %', v_project_id;
    v_pass := v_pass + 1;

    -- Clean up
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 1a FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 1b: INSERT with assigned_to (no client_id) → should FAIL
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 1b: INSERT project with assigned_to only (setting=clients) → should RAISE EXCEPTION';
  BEGIN
    INSERT INTO projects (company_id, assigned_to, stage_id, name, priority)
    VALUES (v_company_id, v_team_user_id, v_stage_id, 'Test Project 1b', 'medium')
    RETURNING id INTO v_project_id;

    RAISE WARNING 'TEST 1b FAILED: Insert succeeded but should have raised an exception';
    v_fail := v_fail + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE '%solo permite asociar proyectos a clientes%' THEN
      RAISE NOTICE 'TEST 1b PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 1b FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 1b FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 1c: INSERT with both client_id and assigned_to → should FAIL (setting=clients)
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 1c: INSERT project with both client and team (setting=clients) → should RAISE EXCEPTION';
  BEGIN
    INSERT INTO projects (company_id, client_id, assigned_to, stage_id, name, priority)
    VALUES (v_company_id, v_client_id, v_team_user_id, v_stage_id, 'Test Project 1c', 'medium')
    RETURNING id INTO v_project_id;

    RAISE WARNING 'TEST 1c FAILED: Insert succeeded but should have raised an exception';
    v_fail := v_fail + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE '%solo permite asociar proyectos a clientes%' THEN
      RAISE NOTICE 'TEST 1c PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 1c FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 1c FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 1d: INSERT with neither client_id nor assigned_to → should SUCCEED (no restriction)
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 1d: INSERT project with no association (setting=clients) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, stage_id, name, priority)
    VALUES (v_company_id, v_stage_id, 'Test Project 1d', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 1d PASSED: Project with no association created: %', v_project_id;
    v_pass := v_pass + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 1d FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST SUITE 2: setting = 'team'
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 2: project_associable_to = team ===';

  UPDATE company_settings SET project_associable_to = 'team' WHERE company_id = v_company_id;

  -- TEST 2a: INSERT with assigned_to (no client_id) → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 2a: INSERT project with assigned_to only (setting=team) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, assigned_to, stage_id, name, priority)
    VALUES (v_company_id, v_team_user_id, v_stage_id, 'Test Project 2a', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 2a PASSED: Project created: %', v_project_id;
    v_pass := v_pass + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 2a FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 2b: INSERT with client_id (no assigned_to) → should FAIL
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 2b: INSERT project with client_id only (setting=team) → should RAISE EXCEPTION';
  BEGIN
    INSERT INTO projects (company_id, client_id, stage_id, name, priority)
    VALUES (v_company_id, v_client_id, v_stage_id, 'Test Project 2b', 'medium')
    RETURNING id INTO v_project_id;

    RAISE WARNING 'TEST 2b FAILED: Insert succeeded but should have raised an exception';
    v_fail := v_fail + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE '%solo permite asociar proyectos al equipo%' THEN
      RAISE NOTICE 'TEST 2b PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 2b FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 2b FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 2c: INSERT with both client_id and assigned_to → should FAIL (setting=team)
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 2c: INSERT project with both client and team (setting=team) → should RAISE EXCEPTION';
  BEGIN
    INSERT INTO projects (company_id, client_id, assigned_to, stage_id, name, priority)
    VALUES (v_company_id, v_client_id, v_team_user_id, v_stage_id, 'Test Project 2c', 'medium')
    RETURNING id INTO v_project_id;

    RAISE WARNING 'TEST 2c FAILED: Insert succeeded but should have raised an exception';
    v_fail := v_fail + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE '%solo permite asociar proyectos al equipo%' THEN
      RAISE NOTICE 'TEST 2c PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 2c FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 2c FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST SUITE 3: setting = 'both'
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 3: project_associable_to = both ===';

  UPDATE company_settings SET project_associable_to = 'both' WHERE company_id = v_company_id;

  -- TEST 3a: INSERT with client_id only → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 3a: INSERT project with client_id only (setting=both) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, client_id, stage_id, name, priority)
    VALUES (v_company_id, v_client_id, v_stage_id, 'Test Project 3a', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 3a PASSED: Project created: %', v_project_id;
    v_pass := v_pass + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 3a FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 3b: INSERT with assigned_to only → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 3b: INSERT project with assigned_to only (setting=both) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, assigned_to, stage_id, name, priority)
    VALUES (v_company_id, v_team_user_id, v_stage_id, 'Test Project 3b', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 3b PASSED: Project created: %', v_project_id;
    v_pass := v_pass + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 3b FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 3c: INSERT with both client_id and assigned_to → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 3c: INSERT project with both client and team (setting=both) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, client_id, assigned_to, stage_id, name, priority)
    VALUES (v_company_id, v_client_id, v_team_user_id, v_stage_id, 'Test Project 3c', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 3c PASSED: Project created: %', v_project_id;
    v_pass := v_pass + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 3c FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 3d: INSERT with neither → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 3d: INSERT project with no association (setting=both) → should SUCCEED';
  BEGIN
    INSERT INTO projects (company_id, stage_id, name, priority)
    VALUES (v_company_id, v_stage_id, 'Test Project 3d', 'medium')
    RETURNING id INTO v_project_id;

    RAISE NOTICE 'TEST 3d PASSED: Project created: %', v_project_id;
    v_pass := v_pass + 1;
    DELETE FROM projects WHERE id = v_project_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 3d FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- ==========================================================================
  -- TEST SUITE 4: UPDATE validation
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 4: UPDATE validation ===';

  -- First: create a clean project under 'both' setting
  UPDATE company_settings SET project_associable_to = 'both' WHERE company_id = v_company_id;
  INSERT INTO projects (company_id, client_id, assigned_to, stage_id, name, priority)
  VALUES (v_company_id, v_client_id, v_team_user_id, v_stage_id, 'Test Project Update', 'medium')
  RETURNING id INTO v_project_id;

  RAISE NOTICE '  Setup project for update tests: %', v_project_id;

  -- TEST 4a: UPDATE: switch setting to 'clients', then try to add assigned_to → should FAIL
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 4a: UPDATE project (setting=clients) adding assigned_to → should RAISE EXCEPTION';
  UPDATE company_settings SET project_associable_to = 'clients' WHERE company_id = v_company_id;

  -- First, clear client_id and set assigned_to (this should fail since setting=clients and we're setting assigned_to)
  BEGIN
    UPDATE projects
    SET client_id = v_client_id, assigned_to = v_team_user_id
    WHERE id = v_project_id;

    RAISE WARNING 'TEST 4a FAILED: Update succeeded but should have raised an exception';
    v_fail := v_fail + 1;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    IF v_err_text LIKE '%solo permite asociar proyectos a clientes%' THEN
      RAISE NOTICE 'TEST 4a PASSED: Got expected error: %', v_err_text;
      v_pass := v_pass + 1;
    ELSE
      RAISE WARNING 'TEST 4a FAILED: Wrong error message: %', v_err_text;
      v_fail := v_fail + 1;
    END IF;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 4a FAILED: Unexpected exception: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- TEST 4b: UPDATE: clear assigned_to, set only client_id (setting=clients) → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 4b: UPDATE project (setting=clients) with client_id only → should SUCCEED';
  BEGIN
    UPDATE projects
    SET client_id = v_client_id, assigned_to = NULL
    WHERE id = v_project_id;

    RAISE NOTICE 'TEST 4b PASSED: Updated project to client-only';
    v_pass := v_pass + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 4b FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  -- Clean up the test project
  DELETE FROM projects WHERE id = v_project_id;

  -- ==========================================================================
  -- TEST SUITE 5: UPDATE name only (no association change) → should always SUCCEED
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== SUITE 5: UPDATE non-association fields ===';

  UPDATE company_settings SET project_associable_to = 'clients' WHERE company_id = v_company_id;

  -- Create a valid project under 'clients'
  INSERT INTO projects (company_id, client_id, stage_id, name, priority)
  VALUES (v_company_id, v_client_id, v_stage_id, 'Test Project Name', 'medium')
  RETURNING id INTO v_project_id;

  RAISE NOTICE '  Setup project for name-only update: %', v_project_id;

  -- TEST 5a: UPDATE name only (no association change) → should SUCCEED
  RAISE NOTICE '---';
  RAISE NOTICE 'TEST 5a: UPDATE project name only (no association change) → should SUCCEED';
  BEGIN
    UPDATE projects
    SET name = 'Test Project Renamed'
    WHERE id = v_project_id;

    RAISE NOTICE 'TEST 5a PASSED: Name updated';
    v_pass := v_pass + 1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err_text = MESSAGE_TEXT;
    RAISE WARNING 'TEST 5a FAILED: %', v_err_text;
    v_fail := v_fail + 1;
  END;

  DELETE FROM projects WHERE id = v_project_id;

  -- ==========================================================================
  -- RESTORE original setting and report
  -- ==========================================================================
  IF v_original_setting IS NOT NULL THEN
    UPDATE company_settings SET project_associable_to = v_original_setting WHERE company_id = v_company_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Restored original setting: %', v_original_setting;
  ELSE
    -- If there was no row before, remove our test row (though it'll be rolled back anyway)
    RAISE NOTICE '';
    RAISE NOTICE 'No original setting to restore (will rollback)';
  END IF;

  -- ==========================================================================
  -- SUMMARY
  -- ==========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESULTS: % passed, % failed', v_pass, v_fail;
  RAISE NOTICE '========================================';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'TESTS FAILED: % failures', v_fail;
  END IF;
END;
$$;

-- Always rollback so no test data is committed to the database
ROLLBACK;

\echo 'Done (rolled back, no data persisted).'
