-- ============================================
-- Migration: normalize_name helper function
-- Strips accents, lowercases, titlecases, collapses spaces
-- Used by upsert_client and dedup queries
-- ============================================
CREATE OR REPLACE FUNCTION public.normalize_name(p_name text)
RETURNS text AS $$
DECLARE
  v text;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN NULL;
  END IF;
  -- Remove accents (convert á→a, é→e, etc.)
  v := translate(lower(trim(p_name)),
    'áéíóúàèìòùâêîôûãõñäöüç',
    'aeiouaeiouaeiouaonaou');
  -- Title case: uppercase first letter of each word
  v := initcap(v);
  -- Collapse multiple spaces
  v := regexp_replace(v, '\s+', ' ', 'g');
  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.normalize_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_name(text) TO service_role;
