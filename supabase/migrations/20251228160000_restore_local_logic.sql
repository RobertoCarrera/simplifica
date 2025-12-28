-- 1. Restore modules_catalog table
CREATE TABLE IF NOT EXISTS "public"."modules_catalog" (
    "key" text NOT NULL PRIMARY KEY,
    "label" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "public"."modules_catalog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for authenticated users" ON "public"."modules_catalog"
    FOR SELECT TO authenticated USING (true);

-- 2. Populate catalog with known modules
INSERT INTO "public"."modules_catalog" ("key", "label") VALUES
('moduloFacturas', 'Facturas'),
('moduloPresupuestos', 'Presupuestos'),
('moduloServicios', 'Servicios'),
('moduloMaterial', 'Material'),
('moduloClientes', 'Clientes'),
('moduloTickets', 'Tickets'),
('moduloVerifactu', 'VeriFactu (AEAT)'),
('moduloChat', 'Chat'),
('moduloProductos', 'Productos'),
('moduloSAT', 'SAT'),
('moduloAnaliticas', 'Analíticas'),
('ai', 'Inteligencia Artificial')
ON CONFLICT ("key") DO NOTHING;

-- 3. Restore get_effective_modules RPC
CREATE OR REPLACE FUNCTION public.get_effective_modules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    result jsonb;
    effective_user_id uuid;
BEGIN
    effective_user_id := auth.uid();

    SELECT jsonb_agg(
        jsonb_build_object(
            'key', mc.key,
            'name', mc.label,
            'enabled', (
                um.status IS NOT NULL AND 
                LOWER(um.status::text) IN ('activado', 'active', 'enabled')
            )
        ) ORDER BY mc.key
    ) INTO result
    FROM public.modules_catalog mc
    LEFT JOIN public.user_modules um 
        ON mc.key = um.module_key 
        AND um.user_id = effective_user_id;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;
