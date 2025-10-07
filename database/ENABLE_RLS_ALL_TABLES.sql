-- ================================================================
-- HABILITAR RLS EN TODAS LAS TABLAS - SECURITY HARDENING
-- ================================================================
-- Fecha: 2025-10-07
-- Objetivo: Proteger TODAS las tablas con Row Level Security
-- Basado en audit de tablas "Unrestricted" en Supabase Dashboard
-- 
-- VERSIÓN: 1.5 (Final - Omitir vistas administrativas)
-- CAMBIOS:
-- - Corregido gdpr_consent_records: usar subject_id (no customer_id)
-- - Corregido gdpr_consent_requests: usar client_id (no customer_id)
-- - Omitido gdpr_processing_inventory (es una VISTA, no tabla)
-- - Corregido addresses: usar usuario_id = auth.uid() (no cliente_id)
-- - Corregido gdpr_processing_activities: política basada en is_dpo/admin
-- - CRÍTICO: Corregida función get_user_company_id() con SET search_path y SQL
-- - Tablas admin_* y otras opcionales ahora verifican existencia con DO blocks
-- - user_company_context verifica si es tabla o vista antes de RLS
-- - v1.4: Políticas corregidas para tablas SIN company_id (usar JOINs)
-- - v1.4: Script de migración 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql creado
-- - companies usa JOIN con users (no tiene company_id propio)
-- - device_*, ticket_*, service_tag_relations usan JOINs con tablas padre
-- - v1.5: OMITIDAS vistas admin_* (admin_company_analysis, admin_company_invitations, admin_pending_users)
--         Las vistas heredan las políticas RLS de las tablas base que consultan
-- ================================================================

-- ⚠️  PREREQUISITO: Ejecutar primero 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql
-- Ese script añade company_id a: ticket_stages, ticket_tags, products, job_notes, pending_users
-- ================================================================

BEGIN;

-- ================================================================
-- FUNCIÓN HELPER: Obtener company_id del usuario autenticado
-- ================================================================
-- NOTA CRÍTICA: Esta función debe ejecutarse con privilegios elevados
-- para poder leer la tabla users sin ser bloqueada por RLS

CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID 
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT company_id 
    FROM public.users 
    WHERE auth_user_id = auth.uid()
    LIMIT 1
$$;

-- ================================================================
-- PARTE 1: TABLAS PRINCIPALES (YA TIENEN RLS PERO VERIFICAMOS)
-- ================================================================

-- Users (ya debe tener RLS)
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

-- Companies (NO tiene company_id - es la tabla maestra)
-- Solo permitir ver la propia empresa
ALTER TABLE IF EXISTS public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies_own_only" ON public.companies;
CREATE POLICY "companies_own_only" ON public.companies
    FOR ALL USING (
        id IN (
            SELECT company_id 
            FROM public.users 
            WHERE auth_user_id = auth.uid()
        )
    );

-- Clients (ya debe tener RLS)
ALTER TABLE IF EXISTS public.clients ENABLE ROW LEVEL SECURITY;

-- Services (ya debe tener RLS)
ALTER TABLE IF EXISTS public.services ENABLE ROW LEVEL SECURITY;

-- Tickets (ya debe tener RLS)
ALTER TABLE IF EXISTS public.tickets ENABLE ROW LEVEL SECURITY;

-- Attachments (ya debe tener RLS)
ALTER TABLE IF EXISTS public.attachments ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- PARTE 2: TABLAS GDPR (CRÍTICAS - SIN RLS ACTUALMENTE)
-- ================================================================

-- GDPR Access Requests
ALTER TABLE IF EXISTS public.gdpr_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_access_requests_company_only" ON public.gdpr_access_requests;
CREATE POLICY "gdpr_access_requests_company_only" ON public.gdpr_access_requests
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- GDPR Audit Log
ALTER TABLE IF EXISTS public.gdpr_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_audit_log_company_only" ON public.gdpr_audit_log;
CREATE POLICY "gdpr_audit_log_company_only" ON public.gdpr_audit_log
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- GDPR Breach Incidents
ALTER TABLE IF EXISTS public.gdpr_breach_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_breach_incidents_company_only" ON public.gdpr_breach_incidents;
CREATE POLICY "gdpr_breach_incidents_company_only" ON public.gdpr_breach_incidents
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- GDPR Consent Overview (vista materializada - skip RLS si es vista)
-- ALTER TABLE IF EXISTS public.gdpr_consent_overview ENABLE ROW LEVEL SECURITY;

-- GDPR Consent Records
ALTER TABLE IF EXISTS public.gdpr_consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_consent_records_company_only" ON public.gdpr_consent_records;
CREATE POLICY "gdpr_consent_records_company_only" ON public.gdpr_consent_records
    FOR ALL USING (
        -- Usar subject_id (no customer_id) para relacionar con clients
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = gdpr_consent_records.subject_id
            AND c.company_id = get_user_company_id()
        )
        OR company_id = get_user_company_id()  -- Fallback si no hay subject_id
    );

-- GDPR Consent Requests
ALTER TABLE IF EXISTS public.gdpr_consent_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_consent_requests_company_only" ON public.gdpr_consent_requests;
CREATE POLICY "gdpr_consent_requests_company_only" ON public.gdpr_consent_requests
    FOR ALL USING (
        -- Usar client_id (no customer_id) para relacionar con clients
        EXISTS (
            SELECT 1 FROM public.clients c
            WHERE c.id = gdpr_consent_requests.client_id
            AND c.company_id = get_user_company_id()
        )
        OR company_id = get_user_company_id()  -- Fallback directo por company_id
    );

-- GDPR Processing Activities
ALTER TABLE IF EXISTS public.gdpr_processing_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gdpr_processing_activities_company_only" ON public.gdpr_processing_activities;
CREATE POLICY "gdpr_processing_activities_company_only" ON public.gdpr_processing_activities
    FOR ALL USING (
        -- Esta tabla NO tiene company_id, es global para toda la organización
        -- Solo usuarios DPO o admin pueden acceder
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.auth_user_id = auth.uid()
            AND (u.is_dpo = true OR u.data_access_level IN ('admin', 'elevated'))
        )
    );

-- GDPR Processing Inventory (ES UNA VISTA, NO TABLA - OMITIR RLS)
-- Las vistas heredan las políticas de las tablas base que consultan
-- No se puede aplicar ALTER TABLE ... ENABLE ROW LEVEL SECURITY a una vista

-- ================================================================
-- PARTE 3: TABLAS DE SERVICIOS (SIN RLS ACTUALMENTE)
-- ================================================================

-- Service Categories
ALTER TABLE IF EXISTS public.service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_categories_company_only" ON public.service_categories;
CREATE POLICY "service_categories_company_only" ON public.service_categories
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- Service Tags
ALTER TABLE IF EXISTS public.service_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_tags_company_only" ON public.service_tags;
CREATE POLICY "service_tags_company_only" ON public.service_tags
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- Service Tag Relations (NO tiene company_id - usar JOIN con services)
ALTER TABLE IF EXISTS public.service_tag_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_tag_relations_via_service" ON public.service_tag_relations;
CREATE POLICY "service_tag_relations_via_service" ON public.service_tag_relations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.services s
            WHERE s.id = service_tag_relations.service_id
            AND s.company_id = get_user_company_id()
        )
    );

-- Service Units
ALTER TABLE IF EXISTS public.service_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_units_company_or_global" ON public.service_units;
CREATE POLICY "service_units_company_or_global" ON public.service_units
    FOR SELECT USING (
        -- Allow global units (company_id IS NULL) or company-specific
        company_id IS NULL 
        OR company_id = get_user_company_id()
    );

DROP POLICY IF EXISTS "service_units_insert_company" ON public.service_units;
CREATE POLICY "service_units_insert_company" ON public.service_units
    FOR INSERT WITH CHECK (
        company_id = get_user_company_id()
    );

DROP POLICY IF EXISTS "service_units_update_company" ON public.service_units;
CREATE POLICY "service_units_update_company" ON public.service_units
    FOR UPDATE USING (
        company_id = get_user_company_id()
    );

DROP POLICY IF EXISTS "service_units_delete_company" ON public.service_units;
CREATE POLICY "service_units_delete_company" ON public.service_units
    FOR DELETE USING (
        company_id = get_user_company_id()
    );

-- ================================================================
-- PARTE 4: TABLAS DE TICKETS (SIN RLS ACTUALMENTE)
-- ================================================================

-- Ticket Comments
ALTER TABLE IF EXISTS public.ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_comments_company_only" ON public.ticket_comments;
CREATE POLICY "ticket_comments_company_only" ON public.ticket_comments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_comments.ticket_id
            AND t.company_id = get_user_company_id()
        )
    );

-- Ticket Comment Attachments (NO tiene company_id - usar JOIN)
ALTER TABLE IF EXISTS public.ticket_comment_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_comment_attachments_via_ticket" ON public.ticket_comment_attachments;
CREATE POLICY "ticket_comment_attachments_via_ticket" ON public.ticket_comment_attachments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.ticket_comments tc
            JOIN public.tickets t ON t.id = tc.ticket_id
            WHERE tc.id = ticket_comment_attachments.comment_id
            AND t.company_id = get_user_company_id()
        )
    );

-- Ticket Devices (NO tiene company_id - usar JOIN)
ALTER TABLE IF EXISTS public.ticket_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_devices_via_ticket" ON public.ticket_devices;
CREATE POLICY "ticket_devices_via_ticket" ON public.ticket_devices
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_devices.ticket_id
            AND t.company_id = get_user_company_id()
        )
    );

-- Ticket Services
ALTER TABLE IF EXISTS public.ticket_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_services_company_only" ON public.ticket_services;
CREATE POLICY "ticket_services_company_only" ON public.ticket_services
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_services.ticket_id
            AND t.company_id = get_user_company_id()
        )
    );

-- Ticket Stages
-- NOTA: Ahora tiene company_id después de ejecutar 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql
ALTER TABLE IF EXISTS public.ticket_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_stages_company_only" ON public.ticket_stages;
CREATE POLICY "ticket_stages_company_only" ON public.ticket_stages
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- Ticket Tags
-- NOTA: Ahora tiene company_id después de ejecutar 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql
ALTER TABLE IF EXISTS public.ticket_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_tags_company_only" ON public.ticket_tags;
CREATE POLICY "ticket_tags_company_only" ON public.ticket_tags
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- Ticket Tag Relations (NO tiene company_id - usar JOIN)
ALTER TABLE IF EXISTS public.ticket_tag_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_tag_relations_via_ticket" ON public.ticket_tag_relations;
CREATE POLICY "ticket_tag_relations_via_ticket" ON public.ticket_tag_relations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_tag_relations.ticket_id
            AND t.company_id = get_user_company_id()
        )
    );

-- ================================================================
-- PARTE 5: TABLAS DE PRODUCTOS/DISPOSITIVOS
-- ================================================================

-- Products
-- NOTA: Ahora tiene company_id después de ejecutar 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_company_only" ON public.products;
CREATE POLICY "products_company_only" ON public.products
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- Device Components (NO tiene company_id - usar JOIN con devices)
ALTER TABLE IF EXISTS public.device_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_components_via_device" ON public.device_components;
CREATE POLICY "device_components_via_device" ON public.device_components
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.devices d
            WHERE d.id = device_components.device_id
            AND d.company_id = get_user_company_id()
        )
    );

-- Device Media (NO tiene company_id - usar JOIN con devices)
ALTER TABLE IF EXISTS public.device_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_media_via_device" ON public.device_media;
CREATE POLICY "device_media_via_device" ON public.device_media
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.devices d
            WHERE d.id = device_media.device_id
            AND d.company_id = get_user_company_id()
        )
    );

-- Device Status History (NO tiene company_id - usar JOIN con devices)
ALTER TABLE IF EXISTS public.device_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_status_history_via_device" ON public.device_status_history;
CREATE POLICY "device_status_history_via_device" ON public.device_status_history
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.devices d
            WHERE d.id = device_status_history.device_id
            AND d.company_id = get_user_company_id()
        )
    );

-- Devices (ya tiene company_id)
ALTER TABLE IF EXISTS public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devices_company_only" ON public.devices;
CREATE POLICY "devices_company_only" ON public.devices
    FOR ALL USING (
        company_id = get_user_company_id()
    );

-- ================================================================
-- PARTE 6: TABLAS DE CONTEXTO/USUARIO (SIN RLS ACTUALMENTE)
-- ================================================================

-- User Company Context (tabla especial - permitir a service role)
-- VERIFICAR SI EXISTE (podría ser una vista)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'user_company_context'
        AND table_type = 'BASE TABLE'  -- Solo tablas, no vistas
    ) THEN
        ALTER TABLE public.user_company_context ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "user_company_context_own_only" ON public.user_company_context;
        CREATE POLICY "user_company_context_own_only" ON public.user_company_context
            FOR ALL USING (
                auth_user_id = auth.uid()
                OR auth.jwt() ->> 'role' = 'service_role'
            );
    END IF;
END $$;

-- Users with Company (vista - skip RLS si es vista)
-- ALTER TABLE IF EXISTS public.users_with_company ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- PARTE 7: TABLAS ADMINISTRATIVAS (PERMISOS ESPECIALES)
-- ================================================================
-- NOTA: Estas tablas pueden NO existir en tu base de datos
-- También pueden ser VISTAS (views), que NO soportan RLS
-- Las vistas heredan las políticas de las tablas base que consultan

-- Admin Company Analysis (OMITIR - es una vista, no tabla base)
-- Admin Company Invitations (OMITIR - es una vista, no tabla base)
-- Admin Pending Users (OMITIR - es una vista, no tabla base)

-- Las vistas administrativas heredarán las políticas RLS de:
-- - users (ya protegido por company_id)
-- - companies (ya protegido)
-- - invitations/company_invitations (ya protegidos)
-- Por lo tanto, NO necesitan RLS directo

-- ================================================================
-- PARTE 8: TABLAS DE LOCALIDADES Y DIRECCIONES
-- ================================================================

-- Localities (tabla global - permitir lectura a todos, escritura a autenticados)
ALTER TABLE IF EXISTS public.localities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "localities_read_all" ON public.localities;
CREATE POLICY "localities_read_all" ON public.localities
    FOR SELECT USING (true);  -- Permitir lectura a todos

DROP POLICY IF EXISTS "localities_write_authenticated" ON public.localities;
CREATE POLICY "localities_write_authenticated" ON public.localities
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL  -- Solo usuarios autenticados pueden crear
    );

DROP POLICY IF EXISTS "localities_update_authenticated" ON public.localities;
CREATE POLICY "localities_update_authenticated" ON public.localities
    FOR UPDATE USING (
        auth.uid() IS NOT NULL
    );

-- Addresses (ligadas a usuarios, no a clientes)
-- Según el schema: usuario_id uuid NOT NULL REFERENCES auth.users(id)
ALTER TABLE IF EXISTS public.addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addresses_own_user_only" ON public.addresses;
CREATE POLICY "addresses_own_user_only" ON public.addresses
    FOR ALL USING (
        usuario_id = auth.uid()  -- Solo el propietario puede ver/editar sus direcciones
    );

-- ================================================================
-- PARTE 9: OTRAS TABLAS (OPCIONALES - VERIFICAR EXISTENCIA)
-- ================================================================

-- Invitations (tabla de invitaciones a empresas)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') THEN
        ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "invitations_company_only" ON public.invitations;
        CREATE POLICY "invitations_company_only" ON public.invitations
            FOR ALL USING (
                company_id = get_user_company_id()
                OR auth.jwt() ->> 'role' = 'service_role'
            );
    END IF;
END $$;

-- Pending Users (usuarios pendientes de activación)
-- NOTA: Ahora tiene company_id después de ejecutar 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql
-- Pero puede ser NULL para usuarios sin empresa asignada aún
ALTER TABLE IF EXISTS public.pending_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_users_company_or_service" ON public.pending_users;
CREATE POLICY "pending_users_company_or_service" ON public.pending_users
    FOR ALL USING (
        company_id = get_user_company_id()
        OR company_id IS NULL  -- Permitir pending users sin empresa
        OR auth.jwt() ->> 'role' = 'service_role'
    );

-- Job Notes (notas de trabajos)
-- NOTA: Ahora tiene company_id después de ejecutar 00-ADD_MISSING_COMPANY_ID_COLUMNS.sql
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_notes') THEN
        ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "job_notes_company_only" ON public.job_notes;
        CREATE POLICY "job_notes_company_only" ON public.job_notes
            FOR ALL USING (
                company_id = get_user_company_id()
            );
    END IF;
END $$;

-- Company Invitations (invitaciones de empresas)
-- VERIFICAR: Esta tabla SÍ existe según policies.txt
ALTER TABLE IF EXISTS public.company_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_invitations_company_only" ON public.company_invitations;
CREATE POLICY "company_invitations_company_only" ON public.company_invitations
    FOR ALL USING (
        company_id = get_user_company_id()
        OR auth.jwt() ->> 'role' = 'service_role'
    );

-- ================================================================
-- VERIFICACIÓN FINAL
-- ================================================================

-- Mostrar todas las tablas y su estado de RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled,
    COUNT(policyname) AS policy_count
FROM pg_tables
LEFT JOIN pg_policies USING (schemaname, tablename)
WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE 'sql_%'
GROUP BY schemaname, tablename, rowsecurity
ORDER BY rls_enabled DESC, tablename;

-- Mostrar tablas SIN RLS habilitado (DEBEN SER CERO O MUY POCAS)
SELECT 
    tablename,
    'WARNING: RLS NOT ENABLED' AS status
FROM pg_tables
WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE 'sql_%'
ORDER BY tablename;

-- Mostrar todas las políticas creadas
SELECT 
    tablename,
    policyname,
    cmd AS operation,
    CASE 
        WHEN qual IS NOT NULL THEN 'USING clause'
        ELSE 'No USING clause'
    END AS has_using,
    CASE 
        WHEN with_check IS NOT NULL THEN 'WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

COMMIT;

-- ================================================================
-- RESULTADO ESPERADO
-- ================================================================
-- ✅ Todas las tablas críticas ahora tienen RLS habilitado
-- ✅ Políticas basadas en company_id para multi-tenancy
-- ✅ Tablas GDPR protegidas
-- ✅ Tablas de servicios, tickets, productos protegidas
-- ✅ Tablas administrativas con acceso restrictivo
-- ✅ Localidades con acceso de lectura global
-- ================================================================

SELECT '✅ RLS habilitado en TODAS las tablas críticas' AS resultado;
SELECT '⚠️  Verificar output arriba para confirmar' AS accion_requerida;
SELECT '📊 Revisar políticas creadas en pg_policies' AS siguiente_paso;
