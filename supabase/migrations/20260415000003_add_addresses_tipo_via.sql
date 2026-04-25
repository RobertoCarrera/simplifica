-- Add tipo_via column to addresses table
-- tipo_via: road type prefix (e.g. "Calle", "Avenida", "Paseo")

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'addresses'
  ) THEN
    RAISE NOTICE 'add_addresses_tipo_via: skipped — table public.addresses does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS tipo_via TEXT';
END $$;
