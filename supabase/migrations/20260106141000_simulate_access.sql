-- Simular acceso como el usuario cliente 'puchu_114@hotmail.com'
-- ID: 0e4662bc-0696-4e4f-a489-d9ce811c9745

DO $$
BEGIN
    RAISE NOTICE '--- INICIO SIMULACION RLS ---';
    
    -- 2. Intentar leer mi propia ficha de cliente
    RAISE NOTICE 'Intentando leer tabla clients...';
    perform count(*) from public.clients where auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745';
    
    -- 3. Intentar leer la empresa asociada
    RAISE NOTICE 'Intentando leer tabla companies...';
END $$;
    
ROLLBACK;

-- Consulta real para ver resultados en la grilla (fuera del bloque anonimo para que retorne filas)
-- Nota: En Supabase Editor, SET LOCAL solo dura una transacción. 
-- Ejecutamos todo como un bloque único.

SELECT
    current_setting('request.jwt.claims', true) as claims,
    (SELECT count(*) FROM public.clients WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745') as my_client_rows,
    (SELECT email FROM public.clients WHERE auth_user_id = '0e4662bc-0696-4e4f-a489-d9ce811c9745') as my_client_email,
    (SELECT count(*) FROM public.companies) as visible_companies_count;
