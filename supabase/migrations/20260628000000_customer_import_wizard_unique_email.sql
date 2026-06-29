-- ─────────────────────────────────────────────────────────────
-- Customer Import Wizard: enforce unique email per company
-- ─────────────────────────────────────────────────────────────
-- The new "Configuración > Dades > Importar > Clientes (Asistente con
-- revisión)" wizard creates clients from a CSV. To make the import
-- idempotent on re-imports and to prevent accidental duplicates, we
-- need a UNIQUE constraint on (company_id, lower(trim(email))) — scoped
-- to active (non-soft-deleted) clients.
--
-- Discovery during planning:
--   - Two non-unique partial indexes already exist on the same columns:
--       idx_clients_company_email_func  — (company_id, lower(email))
--                                         WHERE deleted_at IS NULL
--                                           AND email IS NOT NULL
--       idx_clients_company_email      — (company_id, lower(email))
--                                         WHERE deleted_at IS NULL
--                                           AND email IS NOT NULL
--                                           AND email <> ''
--                                           AND email <> 'corre@tudominio.es'
--   - Both have very low usage (4 and 2 scans over the lifetime of the
--     project). They were probably added defensively when the duplicate-
--     detector feature shipped and never cleaned up.
--   - No actual duplicates exist for active clients (verified via a
--     pre-flight query), so converting the most-restrictive one to a
--     UNIQUE index is safe.
--
-- This migration:
--   1. Drops the two redundant non-unique partial indexes.
--   2. Creates a single UNIQUE partial index that enforces idempotency.
--
-- Soft-deleted clients (deleted_at IS NOT NULL) are intentionally
-- excluded from the index — a re-import must be able to create a new
-- client even if a previous incarnation was soft-deleted. This mirrors
-- the soft-delete semantics used elsewhere in the project.
-- ─────────────────────────────────────────────────────────────

-- Step 1: Drop the redundant non-unique partial indexes.
DROP INDEX IF EXISTS public.idx_clients_company_email;
DROP INDEX IF EXISTS public.idx_clients_company_email_func;

-- Step 2: Create the UNIQUE partial index for idempotency.
-- CONCURRENTLY avoids taking an ACCESS EXCLUSIVE lock on the clients
-- table (which would block reads/writes during index creation).
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction, so
-- the migration must be applied with --no-transaction or equivalent.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  uq_clients_company_lower_email
  ON public.clients (company_id, LOWER(TRIM(email)))
  WHERE deleted_at IS NULL
    AND email IS NOT NULL
    AND TRIM(email) <> '';

-- Step 3: Verify the index exists and is unique.
-- (Documentation-only comment; the verification query is run manually
-- by the operator after this migration completes.)
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'clients'
--   AND indexname = 'uq_clients_company_lower_email';
-- -- Expected: indexdef starts with 'CREATE UNIQUE INDEX' and includes
-- -- the WHERE clause above.
--
-- Test idempotency:
-- INSERT INTO public.clients (company_id, name, client_type, email)
-- VALUES ('<your-company-id>', 'Test 1', 'individual', 'foo@bar.com');
-- INSERT INTO public.clients (company_id, name, client_type, email)
-- VALUES ('<your-company-id>', 'Test 2', 'individual', 'FOO@bar.com');
-- -- The second insert should fail with 23505 (unique_violation).
-- DELETE both rows after the test.