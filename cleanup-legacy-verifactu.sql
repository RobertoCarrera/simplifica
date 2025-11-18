-- OBSOLETE: Legacy columns (cert_pem, key_pem, key_passphrase) have been deleted from verifactu_settings table
-- This script is no longer needed.
-- Kept for historical reference only.

-- The columns were dropped with:
-- ALTER TABLE public.verifactu_settings
--   DROP COLUMN IF EXISTS cert_pem,
--   DROP COLUMN IF EXISTS key_pem,
--   DROP COLUMN IF EXISTS key_passphrase;

