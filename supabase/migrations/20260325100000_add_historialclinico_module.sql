-- =============================================================================
-- Migration: Add 'historialClinico' module to the modules catalog
-- Purpose:   Register the Historial Clínico module as an available product
--            in modules_catalog. Optionally activate it for specific companies
--            via company_modules (see commented block below).
-- Idempotent: Uses ON CONFLICT (key) DO UPDATE — safe to run multiple times.
-- =============================================================================

-- Task 1.2: Insert historialClinico into modules_catalog
INSERT INTO public.modules_catalog (key, label, description, price, currency, is_active, category)
VALUES (
    'historialClinico',
    'Historial Clínico',
    'Registro y gestión del historial clínico de clientes. Requiere consentimiento GDPR para datos de salud.',
    0.00,
    'EUR',
    true,
    'health'
)
ON CONFLICT (key) DO UPDATE SET
    label       = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active   = EXCLUDED.is_active;

-- =============================================================================
-- Task 1.3: Optional — Activate module for specific companies
-- -----------------------------------------------------------------------------
-- Uncomment this block and replace '<COMPANY_UUID>' with the actual company_id
-- before running in an environment where activation is required.
-- IMPORTANT: This must be done per-environment by the ops team.
--            Do NOT uncomment for a general deployment.
-- =============================================================================

-- INSERT INTO public.company_modules (company_id, module_key, status)
-- VALUES ('<COMPANY_UUID>', 'historialClinico', 'active')
-- ON CONFLICT (company_id, module_key) DO UPDATE SET
--     status     = EXCLUDED.status,
--     updated_at = NOW();

-- =============================================================================
-- Task 1.4: Rollback SQL (run manually if needed)
-- -----------------------------------------------------------------------------
-- Two-step DELETE required because there is no CASCADE FK from
-- modules_catalog → company_modules (FK only exists on company_id).
-- Step 1 removes all company activations, step 2 removes the catalog entry.
--
-- Step 1 — remove company activations:
--   DELETE FROM public.company_modules WHERE module_key = 'historialClinico';
--
-- Step 2 — remove catalog entry:
--   DELETE FROM public.modules_catalog WHERE key = 'historialClinico';
-- =============================================================================
