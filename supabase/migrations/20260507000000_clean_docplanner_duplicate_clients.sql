-- Migration: Clean duplicate clients from Doctoralia sync bug
-- Date: 2026-05-07
-- Description: Removes duplicate clients created by the Doctoralia sync bug,
--              keeping only the oldest record in each name+surname+phone group.
--              Also adds a partial unique index to prevent future duplicates.

-- ============================================================================
-- STEP 1: Preview what will be deleted (run this first to review)
-- ============================================================================

-- Find duplicate groups (same name, surname, and phone)
-- Only consider records that:
--   - Have docplanner_patient_id set (they came from Doctoralia sync)
--   - Have NO email (the bug only created email-less clients)
--   - Are active (is_active IS NULL or true)
--   - Have the same name, surname, and phone (excluding nulls edge case)
WITH duplicate_groups AS (
  SELECT 
    id,
    company_id,
    name,
    surname,
    phone,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY 
        company_id, 
        UPPER(TRIM(name)), 
        UPPER(TRIM(COALESCE(surname, ''))), 
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '')
      ORDER BY created_at ASC
    ) as rn
  FROM clients
  WHERE docplanner_patient_id IS NOT NULL
    AND (email IS NULL OR email = '')
    AND (is_active IS NULL OR is_active = true)
    AND name IS NOT NULL
    AND UPPER(TRIM(name)) != ''
),
to_keep AS (
  SELECT id FROM duplicate_groups WHERE rn = 1
),
to_delete AS (
  SELECT id FROM duplicate_groups WHERE rn > 1
)
-- Show what will be deleted
SELECT 
  'Will delete' as action,
  COUNT(*) as count,
  MIN(created_at) as earliest_created,
  MAX(created_at) as latest_created
FROM to_delete;

-- Also show what will be kept (for reference)
-- SELECT 
--   'Will keep' as action,
--   COUNT(*) as count,
--   MIN(created_at) as earliest_created,
--   MAX(created_at) as latest_created
-- FROM to_keep;

-- Show sample of records to be deleted (first 20)
-- SELECT 
--   c.id,
--   c.company_id,
--   c.name,
--   c.surname,
--   c.phone,
--   c.email,
--   c.docplanner_patient_id,
--   c.created_at
-- FROM clients c
-- INNER JOIN to_delete td ON c.id = td.id
-- ORDER BY c.company_id, c.name, c.surname, c.created_at
-- LIMIT 20;

-- ============================================================================
-- STEP 2: Delete duplicates (commented out for safety - run SELECT first!)
-- ============================================================================

-- DELETE FROM clients WHERE id IN (SELECT id FROM to_delete);

-- ============================================================================
-- STEP 3: Add partial unique index to prevent future duplicates
-- ============================================================================

-- Add partial unique index to prevent future duplicates
-- This ensures we can't have two active clients with same name+surname+phone
-- from Doctoralia (docplanner_patient_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_name_surname_phone 
ON clients (
  company_id, 
  UPPER(TRIM(name)), 
  UPPER(TRIM(COALESCE(surname, ''))), 
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', ''), ')', '')
) 
WHERE docplanner_patient_id IS NOT NULL 
  AND (email IS NULL OR email = '')
  AND (is_active IS NULL OR is_active = true);
