-- Migration: ensure moduloProyectos stays active for company 'simplifica'
-- Date: 2026-06-10
-- Reason: User reported owners associated with 'simplifica' should see 'Proyectos'
--         by default. If the company_modules row is missing or status!=active,
--         the frontend's getEffectiveModules() will return enabled=false and
--         the sidebar filter will hide the link (per commit 2459b4b9).
--
-- This migration is IDEMPOTENT (safe to re-apply):
--   1. INSERTs moduloProyectos:active for 'simplifica' if missing
--   2. UPDATEs to status=active if row exists but is not active
--
-- Scope: only the company with slug='simplifica'. We do NOT touch other
-- companies (e.g. caibs, testing). The user explicitly wants 'simplifica' to
-- have Proyectos enabled.

DO $$
DECLARE
    v_simplifica_id uuid;
    v_existing_status text;
BEGIN
    -- Find company id for simplifica
    SELECT id INTO v_simplifica_id
    FROM companies
    WHERE slug = 'simplifica';

    IF v_simplifica_id IS NULL THEN
        RAISE NOTICE 'Company with slug=simplifica not found, nothing to do';
        RETURN;
    END IF;

    -- Check current state
    SELECT status INTO v_existing_status
    FROM company_modules
    WHERE company_id = v_simplifica_id
      AND module_key = 'moduloProyectos';

    IF v_existing_status IS NULL THEN
        -- Row missing, insert
        INSERT INTO company_modules (company_id, module_key, status, created_at, updated_at)
        VALUES (v_simplifica_id, 'moduloProyectos', 'active', now(), now());
        RAISE NOTICE 'Inserted moduloProyectos:active for company simplifica (%)', v_simplifica_id;
    ELSIF v_existing_status != 'active' THEN
        -- Row exists but inactive, update
        UPDATE company_modules
        SET status = 'active', updated_at = now()
        WHERE company_id = v_simplifica_id
          AND module_key = 'moduloProyectos';
        RAISE NOTICE 'Updated moduloProyectos from % to active for company simplifica (%)', v_existing_status, v_simplifica_id;
    ELSE
        RAISE NOTICE 'moduloProyectos already active for company simplifica (%), nothing to do', v_simplifica_id;
    END IF;
END $$;

-- Verification query (idempotent re-run safe)
DO $$
BEGIN
    PERFORM 1
    FROM company_modules cm
    JOIN companies c ON c.id = cm.company_id
    WHERE c.slug = 'simplifica'
      AND cm.module_key = 'moduloProyectos'
      AND cm.status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Post-condition failed: moduloProyectos:active not present for simplifica';
    END IF;
END $$;
