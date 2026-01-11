-- DIAGNÓSTICO: Ver todas las policies de company_settings
SELECT 
  policyname as policy_name,
  tablename,
  cmd as operation,
  qual as using_expression,
  with_check
FROM pg_policies 
WHERE tablename = 'company_settings';

-- Y también ver la definición completa
SELECT pg_get_constraintdef(oid) FROM pg_catalog.pg_constraint WHERE conrelid = 'company_settings'::regclass;
