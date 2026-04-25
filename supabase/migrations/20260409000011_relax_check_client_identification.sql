-- Relax check_client_identification constraint to permit active individual clients
-- who have phone or email (e.g. patients imported from Doctoralia who lack DNI/CIF).
-- Previous constraint required: active individual → must have dni OR cif_nif.
-- Updated constraint allows: active individual → must have dni, cif_nif, phone, OR email.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'client_type'
  ) THEN
    RAISE NOTICE 'relax_check_client_identification: skipped — column client_type does not exist';
    RETURN;
  END IF;

  ALTER TABLE clients DROP CONSTRAINT IF EXISTS check_client_identification;

  EXECUTE $q$
    ALTER TABLE clients
      ADD CONSTRAINT check_client_identification CHECK (
        (COALESCE(is_active, true) = false)
        OR (
          COALESCE(client_type, 'individual'::text) = 'business'::text
          AND cif_nif IS NOT NULL
        )
        OR (
          COALESCE(client_type, 'individual'::text) = 'individual'::text
          AND (
            dni IS NOT NULL
            OR cif_nif IS NOT NULL
            OR phone IS NOT NULL
            OR email IS NOT NULL
          )
        )
      ) NOT VALID
  $q$;
END $$;
