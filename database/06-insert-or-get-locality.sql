-- Migration: 06-insert-or-get-locality.sql
-- Adds unique constraint on postal_code and creates insert_or_get_locality RPC

-- 1) Add unique constraint on postal_code (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE c.conname = 'localities_postal_code_unique' AND t.relname = 'localities'
    ) THEN
        ALTER TABLE public.localities
        ADD CONSTRAINT localities_postal_code_unique UNIQUE (postal_code);
    END IF;
END$$;

-- 2) Create insert_or_get_locality function
CREATE OR REPLACE FUNCTION public.insert_or_get_locality(
  p_name text,
  p_province text,
  p_country text,
  p_postal_code text
)
RETURNS public.localities
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  _row public.localities;
BEGIN
  -- Normalize input inside DB if desired (caller should already normalize)
  SELECT * INTO _row FROM public.localities WHERE postal_code = p_postal_code LIMIT 1;
  IF FOUND THEN
    RETURN _row;
  END IF;

  INSERT INTO public.localities (name, province, country, postal_code)
  VALUES (p_name, p_province, p_country, p_postal_code)
  RETURNING * INTO _row;

  RETURN _row;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO _row FROM public.localities WHERE postal_code = p_postal_code LIMIT 1;
  RETURN _row;
END;
$function$;

-- 3) Grant execute to authenticated (optional; if you prefer Edge Function, skip this grant and call via server)
GRANT EXECUTE ON FUNCTION public.insert_or_get_locality(text,text,text,text) TO authenticated;
