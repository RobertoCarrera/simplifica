-- ============================================================
-- Migration: Reforzar visibilidad de presupuestos para PROFESIONALES
--
-- Caso de uso:
--   Un usuario con rol `professional` debe poder ver:
--     1) Los presupuestos que ÉL ha creado (quotes.created_by)
--     2) Los presupuestos de los clientes que le están asignados
--        (vía client_assignments.company_member_id o .professional_id)
--
-- NOTA: la columna `quotes.professional_id` NO existe en esta DB
-- (la migration 20260413160000 que la añade nunca se ejecutó en
-- este entorno). Por eso la policy de `quote_items` original estaba
-- rota: su branch de "profesional asignado" usaba esa columna que
-- no existe, así que siempre caía al branch permisivo de
-- "cualquier member activo".
--
-- Esta migration corrige el problema replicando la lógica de
-- `clients_select` y `quotes_select` ya validadas en migraciones
-- anteriores (20260605000002..005), aplicadas a:
--   - quotes
--   - quote_items (resuelve el branch roto)
--   - quote_generation_logs
-- ============================================================

-- ------------------------------------------------------------
-- 1) quotes: SELECT
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
CREATE POLICY "quotes_select_policy" ON public.quotes
  FOR SELECT TO authenticated
  USING (
    -- 1) Soy el creador del presupuesto
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = quotes.created_by
        AND u.auth_user_id = auth.uid()
    )
    OR
    -- 2) Mi membresía en la empresa cumple alguna condición:
    --    a) Rol alto (supervisor/owner/admin/super_admin)
    --    b) Tengo el cliente asignado (vía company_member_id)
    --    c) Soy professional y tengo el cliente asignado (vía professional_id)
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = quotes.company_id
        AND cm.status = 'active'
        AND (
          ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
          OR EXISTS (
            SELECT 1 FROM public.client_assignments ca
            WHERE ca.client_id = quotes.client_id
              AND ca.company_member_id = cm.id
          )
          OR EXISTS (
            SELECT 1
            FROM public.professionals p
            JOIN public.client_assignments ca2 ON ca2.professional_id = p.id
            WHERE p.user_id = auth.uid()
              AND ca2.client_id = quotes.client_id
          )
        )
    )
  );

-- ------------------------------------------------------------
-- 2) quote_items: SELECT (misma lógica via quote padre)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "quote_items_select_policy" ON public.quote_items;
CREATE POLICY "quote_items_select_policy" ON public.quote_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND (
          -- a) Creador del quote
          EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = q.created_by
              AND u.auth_user_id = auth.uid()
          )
          OR
          -- b) Member con rol alto o asignación al cliente
          EXISTS (
            SELECT 1
            FROM public.company_members cm
            JOIN public.app_roles ar ON ar.id = cm.role_id
            WHERE cm.user_id = auth.uid()
              AND cm.company_id = q.company_id
              AND cm.status = 'active'
              AND (
                ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
                OR EXISTS (
                  SELECT 1 FROM public.client_assignments ca
                  WHERE ca.client_id = q.client_id
                    AND ca.company_member_id = cm.id
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.professionals p
                  JOIN public.client_assignments ca2 ON ca2.professional_id = p.id
                  WHERE p.user_id = auth.uid()
                    AND ca2.client_id = q.client_id
                )
              )
          )
        )
    )
  );

-- ------------------------------------------------------------
-- 3) quote_generation_logs: omitido
--    La tabla no existe en esta DB (la migration 20260413160000
--    que la crea nunca corrió aquí). Cuando se cree, copiar la
--    misma lógica de los logs que la 20260413160000 ya define.
-- ------------------------------------------------------------
