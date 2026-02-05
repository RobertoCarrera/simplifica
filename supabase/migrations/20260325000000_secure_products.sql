-- 20260325000000_secure_products.sql

-- MIGRACIÓN DE SEGURIDAD: RLS para Tabla Products
-- Objetivo: Asegurar que los productos solo sean accesibles por miembros de la misma compañía.

-- 1. Habilitar RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas si existen (para evitar duplicados o conflictos)
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
DROP POLICY IF EXISTS "products_modify_policy" ON public.products;
DROP POLICY IF EXISTS "products_insert_policy" ON public.products;
DROP POLICY IF EXISTS "products_update_policy" ON public.products;
DROP POLICY IF EXISTS "products_delete_policy" ON public.products;

-- 3. Crear Políticas de Seguridad

-- POLICY: Select
-- Permitir lectura a miembros activos de la misma compañía
CREATE POLICY "products_select_policy" ON public.products
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = products.company_id
      AND cm.status = 'active'
  )
);

-- POLICY: Insert
-- Permitir creación a miembros activos de la compañía (se valida company_id del payload)
CREATE POLICY "products_insert_policy" ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = products.company_id
      AND cm.status = 'active'
  )
);

-- POLICY: Update
-- Permitir actualización a miembros activos de la misma compañía
CREATE POLICY "products_update_policy" ON public.products
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = products.company_id
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = products.company_id
      AND cm.status = 'active'
  )
);

-- POLICY: Delete
-- Permitir borrado a miembros activos (o restringir a admin si se prefiere, aquí dejamos miembros activos por consistencia)
CREATE POLICY "products_delete_policy" ON public.products
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = products.company_id
      AND cm.status = 'active'
  )
);
