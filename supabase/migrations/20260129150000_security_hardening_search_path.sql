-- 20260129150000_security_hardening_search_path.sql

-- MIGRACIÓN DE SEGURIDAD CRÍTICA: HARDENING DE SEARCH_PATH (CORREGIDA)
-- Objetivo: Prevenir ataques de "Search Path Hijacking" en funciones y procedimientos privilegiados.
-- Acción: Fuerza un search_path seguro (public, extensions, temp) en funciones y procedimientos SECURITY DEFINER.
-- Corrección: Maneja correctamente la distinción entre FUNCTION y PROCEDURE (Error 42809).

DO $$
DECLARE
    r RECORD;
    func_signature text;
    object_type text;
    counter integer := 0;
BEGIN
    RAISE NOTICE 'Iniciando hardening de funciones y procedimientos SECURITY DEFINER...';

    FOR r IN
        SELECT n.nspname as schema_name,
               p.proname as func_name,
               pg_get_function_identity_arguments(p.oid) as args,
               p.prokind -- 'f' para función, 'p' para procedimiento
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' -- Solo esquema public
          AND p.prosecdef = true   -- Solo SECURITY DEFINER
          AND p.prokind IN ('f', 'p') -- Solo Funciones y Procedimientos
    LOOP
        -- Construir la firma
        func_signature := format('%I.%I(%s)', r.schema_name, r.func_name, r.args);
        
        -- Determinar el tipo para el comando ALTER
        IF r.prokind = 'p' THEN
            object_type := 'PROCEDURE';
        ELSE
            object_type := 'FUNCTION';
        END IF;

        -- Ejecutar el hardening
        BEGIN
            EXECUTE format('ALTER %s %s SET search_path = public, extensions, temp;', object_type, func_signature);
            RAISE NOTICE '✅ Protegido (%s): %', object_type, func_signature;
            counter := counter + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '⚠️ Falló al proteger %: %', func_signature, SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE 'Hardening completado. % objetos asegurados.', counter;
END $$;