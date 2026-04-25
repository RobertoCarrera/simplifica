-- Drop the legacy parameterless function to resolve ambiguity with the new optional-parameter version
DROP FUNCTION IF EXISTS public.get_effective_modules();
