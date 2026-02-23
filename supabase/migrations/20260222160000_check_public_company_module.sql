-- 20260222160000_check_public_company_module.sql

-- MIGRACIÓN DE SEGURIDAD: FUNCIÓN PÚBLICA PARA VERIFICAR MÓDULOS DE EMPRESA
-- Objetivo: Permitir que los invitados anónimos puedan verificar si la empresa
-- a la que han sido invitados tiene un módulo específico activado (ej: moduloClinico).

CREATE OR REPLACE FUNCTION public.check_public_company_module(p_company_id uuid, p_module_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_modules
    WHERE company_id = p_company_id
      AND module_key = p_module_key
      AND status = 'active'
  );
$$;

-- Otorgar permisos a anon explicitamente por si acaso
GRANT EXECUTE ON FUNCTION public.check_public_company_module(uuid, text) TO anon, authenticated;
