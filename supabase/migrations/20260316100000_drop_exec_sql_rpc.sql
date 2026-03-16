-- Security: Drop exec_sql RPC function if it exists
-- This function allows arbitrary SQL execution and is a critical security risk
-- No production code uses it (callers are unused dead code)
DROP FUNCTION IF EXISTS public.exec_sql(text);
DROP FUNCTION IF EXISTS public.exec_sql(sql text);
DROP FUNCTION IF EXISTS public.exec_sql(sql_query text);
