-- Migration: Relax clients identification constraint to allow importing incomplete rows
-- Context: CSV importer inserts some clients without DNI/CIF. We'll mark them inactive and require completion later.
-- Safeguard: Active clients must still have some identification (DNI or CIF, depending on client_type).

BEGIN;

-- Drop current constraint if exists (name may differ across environments)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'clients'
      AND constraint_name = 'check_client_identification'
  ) THEN
    ALTER TABLE public.clients DROP CONSTRAINT check_client_identification;
  END IF;
END$$;

-- Ensure columns exist (idempotent guards)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='client_type'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN client_type text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='cif_nif'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN cif_nif varchar;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='business_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN business_name text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='trade_name'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN trade_name text;
  END IF;
END $$;

-- New constraint: allow missing identification only when is_active=false (imported/incomplete).
-- Otherwise require DNI or CIF (CIF when client_type='business').
ALTER TABLE public.clients
  ADD CONSTRAINT check_client_identification
  CHECK (
    COALESCE(is_active, true) = false
    OR (
      COALESCE(client_type, 'individual') = 'business' AND cif_nif IS NOT NULL
    )
    OR (
      COALESCE(client_type, 'individual') = 'individual' AND (dni IS NOT NULL OR cif_nif IS NOT NULL)
    )
  ) NOT VALID;

-- Optional: validate later once legacy data is cleaned
-- ALTER TABLE public.clients VALIDATE CONSTRAINT check_client_identification;

COMMIT;
