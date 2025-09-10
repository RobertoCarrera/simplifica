-- Migration: add missing columns expected by frontend
-- Adds apellidos, dni, address (jsonb) and direccion_id if missing, and ensures activo default

BEGIN;

-- Add apellidos if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'apellidos'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN apellidos VARCHAR(200);
    RAISE NOTICE 'Added column apellidos to public.clients';
  ELSE
    RAISE NOTICE 'Column apellidos already exists in public.clients';
  END IF;
END$$;

-- Add dni if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'dni'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN dni VARCHAR(50);
    RAISE NOTICE 'Added column dni to public.clients';
  ELSE
    RAISE NOTICE 'Column dni already exists in public.clients';
  END IF;
END$$;

-- Add address jsonb if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'address'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN address jsonb DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added column address (jsonb) to public.clients';
  ELSE
    RAISE NOTICE 'Column address already exists in public.clients';
  END IF;
END$$;

-- Add direccion_id uuid if missing and addresses table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'addresses'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'direccion_id'
    ) THEN
      ALTER TABLE public.clients ADD COLUMN direccion_id UUID REFERENCES public.addresses(id);
      RAISE NOTICE 'Added column direccion_id to public.clients';
    ELSE
      RAISE NOTICE 'Column direccion_id already exists in public.clients';
    END IF;
  ELSE
    RAISE NOTICE 'Table public.addresses does not exist; skipping direccion_id';
  END IF;
END$$;

-- Ensure activo default true
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'activo'
  ) THEN
    BEGIN
      ALTER TABLE public.clients ALTER COLUMN activo SET DEFAULT true;
      RAISE NOTICE 'Set default true for activo on public.clients';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not set default for activo: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Column activo does not exist on public.clients; skipping';
  END IF;
END$$;

COMMIT;
