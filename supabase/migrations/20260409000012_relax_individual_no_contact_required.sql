-- Relax constraint further: individual clients have no mandatory identification requirement.
-- A name alone is sufficient (e.g. Doctoralia patients without phone/email).
-- Business clients still require cif_nif.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'client_type'
  ) THEN
    RAISE NOTICE 'relax_individual_no_contact_required: skipped — column client_type does not exist';
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
        )
      ) NOT VALID
  $q$;
END $$;
