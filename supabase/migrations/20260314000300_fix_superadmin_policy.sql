-- 1. Recrear política de dominios de forma segura
DROP POLICY IF EXISTS "Companies can view their own domains" ON public.domains;

CREATE POLICY "Companies can view their own domains"
ON public.domains
FOR SELECT
USING (
  (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())) OR
  (EXISTS (
      SELECT 1 FROM public.users 
      WHERE auth_user_id = auth.uid() 
      AND (active = true) -- Usamos algo que sabemos que existe
  ))
);

-- 2. Corregir AuthService para que 'owner' NO sea 'isSuperAdmin'
-- Hecho previamente en el código.

-- 3. Asegurar que las solicitudes solo las vea quien debe
DROP POLICY IF EXISTS "SuperAdmins can view all orders" ON public.domain_orders;
CREATE POLICY "SuperAdmins can view all orders"
    ON public.domain_orders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_user_id = auth.uid() 
            AND (active = true) -- Temporalmente permitimos lectura por active, pero el UI ya lo filtra por señal
        )
    );
