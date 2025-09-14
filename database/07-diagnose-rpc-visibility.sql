-- Diagnostic: 07-diagnose-rpc-visibility.sql
-- Paste this into the Supabase SQL editor for the project your app is pointed to.

-- 1) List function existence and definition (if present)
SELECT n.nspname AS schema,
       p.proname AS name,
       pg_get_function_arguments(p.oid) AS args,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'insert_or_get_locality';

-- 2) Show privileges on the function
-- Use the `proacl` column; `pg_proc_acl` helper is not present on all Postgres versions.
SELECT n.nspname AS schema,
       p.proname AS name,
       p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) as owner,
       p.proacl AS proacl
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'insert_or_get_locality';

-- 3) Helper: show whether 'anon' and 'authenticated' can execute
-- Replace 'anon' with the exact role if your project uses a different one (e.g., 'anon' or 'public')
SELECT
  current_database() AS db,
  has_function_privilege('anon', 'public.insert_or_get_locality(text,text,text,text)', 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', 'public.insert_or_get_locality(text,text,text,text)', 'EXECUTE') AS authenticated_execute;

-- 4) Test-call the function (safe): run a SELECT calling the function inside LIMIT 1
-- If the function exists and your role can execute it, this will return a row (or error explaining why not)
SELECT public.insert_or_get_locality('Prueba','Provincia','España','28001') AS result;

-- 5) If the test-call fails due to permission, run the following (as a DB owner) to grant execute:
-- GRANT EXECUTE ON FUNCTION public.insert_or_get_locality(text,text,text,text) TO authenticated;
-- or to anon (if you intend anonymous web clients):
-- GRANT EXECUTE ON FUNCTION public.insert_or_get_locality(text,text,text,text) TO anon;

-- 6) If you prefer Edge Function (recommended if you don't want to grant execute to client roles):
-- Create an Edge Function that runs the RPC using the service_role key and call it from the client.

-- End of diagnostic
