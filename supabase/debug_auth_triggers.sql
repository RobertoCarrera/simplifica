-- =================================================================
-- DEBUG SCRIPT: INSPECT AUTH TRIGGERS
-- Run this in the Supabase Dashboard -> SQL Editor to identify
-- what triggers are running during login/user creation.
-- =================================================================

SELECT 
    event_object_schema as schema_name,
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    action_statement as definition
FROM information_schema.triggers
WHERE event_object_table IN ('users', 'profiles')
   OR event_object_schema = 'auth'
ORDER BY event_object_table, event_manipulation;

-- Check specifically for triggers on auth.users (which might be hidden in some views)
SELECT * FROM pg_trigger 
WHERE tgrelid = 'auth.users'::regclass;

-- Check for functions that might be failing
SELECT routine_name, routine_definition, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_definition ILIKE '%auth.users%' OR routine_definition ILIKE '%security definer%')
LIMIT 20;

-- Check if there are any improperly defined RLS policies that might cause recursion
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('users', 'profiles', 'clients', 'customers');
