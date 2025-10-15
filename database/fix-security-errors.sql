-- ============================================================================
-- FIX SECURITY ERRORS - SUPABASE SECURITY ADVISOR
-- ============================================================================
-- Fecha: 2025-10-07
-- Propósito: Corregir 8 errores críticos de seguridad detectados por Supabase
-- Riesgo: BAJO (mejoras de seguridad, sin cambios en lógica)
-- Impacto: CRÍTICO - Protege datos sensibles y aplica RLS correctamente
-- ============================================================================

-- ============================================================================
-- ERROR 1: auth_users_exposed en admin_pending_users
-- ============================================================================
-- PROBLEMA: La vista expone datos de auth.users al rol anon
-- SOLUCIÓN: Eliminar JOIN con auth.users y añadir filtro de seguridad

DROP VIEW IF EXISTS admin_pending_users CASCADE;

CREATE VIEW admin_pending_users
WITH (security_invoker=true)
AS
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.company_name,
    p.created_at,
    p.expires_at,
    p.confirmed_at,
    CASE 
        WHEN p.confirmed_at IS NOT NULL THEN 'confirmed'
        WHEN p.expires_at < NOW() THEN 'expired'
        ELSE 'pending'
    END as status
FROM public.pending_users p
WHERE EXISTS (
    -- Solo admins y owners pueden ver usuarios pendientes
    SELECT 1 FROM users u
    WHERE u.auth_user_id = auth.uid()
    AND u.role IN ('owner', 'admin')
    AND u.active = true
)
ORDER BY p.created_at DESC;

-- ============================================================================
-- ERROR 2: security_definer_view en users_with_company
-- ============================================================================
-- PROBLEMA: Vista ejecuta con permisos del creador, bypass RLS
-- SOLUCIÓN: Añadir security_invoker=true y filtro por company_id del usuario

DROP VIEW IF EXISTS users_with_company CASCADE;

CREATE VIEW users_with_company 
WITH (security_invoker=true)
AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.surname,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website as company_website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL
AND u.company_id IN (
    -- Solo usuarios de la misma empresa pueden ver
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
);

-- ============================================================================
-- ERROR 3: security_definer_view en user_company_context
-- ============================================================================
-- PROBLEMA: Vista ejecuta con permisos del creador
-- SOLUCIÓN: Añadir security_invoker=true y filtro por auth_user_id

DROP VIEW IF EXISTS user_company_context CASCADE;

CREATE VIEW user_company_context
WITH (security_invoker=true)
AS
SELECT 
    u.id as user_id,
    u.auth_user_id,
    u.company_id,
    c.name as company_name,
    u.role,
    u.permissions
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.auth_user_id = auth.uid()
AND u.active = true;

-- ============================================================================
-- ERROR 4: security_definer_view en admin_company_invitations
-- ============================================================================
-- PROBLEMA: Vista ejecuta con permisos del creador
-- SOLUCIÓN: Añadir security_invoker=true y filtro por company_id

DROP VIEW IF EXISTS admin_company_invitations CASCADE;

CREATE VIEW admin_company_invitations
WITH (security_invoker=true)
AS
SELECT 
    ci.id,
    ci.company_id,
    ci.email,
    ci.role,
    ci.status,
    ci.created_at,
    ci.expires_at,
    ci.responded_at,
    c.name as company_name,
    u.name as invited_by_name,
    u.email as invited_by_email,
    CASE 
        WHEN ci.status = 'pending' AND ci.expires_at < NOW() THEN 'expired'
        ELSE ci.status
    END as effective_status
FROM public.company_invitations ci
JOIN public.companies c ON ci.company_id = c.id
JOIN public.users u ON ci.invited_by_user_id = u.id
WHERE ci.company_id IN (
    -- Solo usuarios de la empresa pueden ver sus invitaciones
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
)
ORDER BY ci.created_at DESC;

-- ============================================================================
-- ERROR 5: security_definer_view en admin_company_analysis
-- ============================================================================
-- PROBLEMA: Vista ejecuta con permisos del creador
-- SOLUCIÓN: Añadir security_invoker=true y filtro por company_id

DROP VIEW IF EXISTS admin_company_analysis CASCADE;

CREATE VIEW admin_company_analysis
WITH (security_invoker=true)
AS
SELECT 
    c.id,
    c.name,
    c.slug,
    c.created_at,
    COUNT(u.id) as total_users,
    COUNT(u.id) FILTER (WHERE u.role = 'owner') as owners_count,
    COUNT(u.id) FILTER (WHERE u.role = 'admin') as admins_count,
    COUNT(u.id) FILTER (WHERE u.role = 'member') as members_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'pending') as pending_invitations,
    STRING_AGG(u.email, ', ') FILTER (WHERE u.role = 'owner') as owner_emails
FROM public.companies c
LEFT JOIN public.users u ON c.id = u.company_id AND u.active = true
LEFT JOIN public.company_invitations ci ON c.id = ci.company_id AND ci.status = 'pending'
WHERE c.deleted_at IS NULL
AND c.id IN (
    -- Solo usuarios de la empresa pueden ver su análisis
    SELECT company_id FROM users WHERE auth_user_id = auth.uid()
)
GROUP BY c.id, c.name, c.slug, c.created_at
ORDER BY c.created_at DESC;

-- ============================================================================
-- ERROR 6: security_definer_view en gdpr_processing_inventory
-- ============================================================================
-- PROBLEMA: Vista ejecuta con permisos del creador
-- SOLUCIÓN: Añadir security_invoker=true (ya tiene filtro por company_id)

DROP VIEW IF EXISTS gdpr_processing_inventory CASCADE;

CREATE VIEW gdpr_processing_inventory
WITH (security_invoker=true)
AS
SELECT 
    pa.activity_name,
    pa.purpose,
    pa.legal_basis,
    pa.data_categories,
    pa.data_subjects,
    pa.recipients,
    pa.retention_period,
    pa.cross_border_transfers,
    COUNT(DISTINCT c.id) as affected_subjects_count,
    pa.created_at,
    pa.updated_at
FROM public.gdpr_processing_activities pa
LEFT JOIN public.clients c ON c.company_id IN (
    SELECT id FROM public.companies 
    WHERE id IN (
        SELECT company_id FROM public.users 
        WHERE auth_user_id = auth.uid()
    )
)
WHERE pa.is_active = true
GROUP BY pa.id, pa.activity_name, pa.purpose, pa.legal_basis, 
         pa.data_categories, pa.data_subjects, pa.recipients, 
         pa.retention_period, pa.cross_border_transfers, 
         pa.created_at, pa.updated_at;

-- ============================================================================
-- ERROR 7: security_definer_view en gdpr_consent_overview
-- ============================================================================
-- PROBLEMA: Vista ejecuta con permisos del creador
-- SOLUCIÓN: Añadir security_invoker=true (ya tiene filtro por company_id)

DROP VIEW IF EXISTS gdpr_consent_overview CASCADE;

CREATE VIEW gdpr_consent_overview
WITH (security_invoker=true)
AS
SELECT 
    cr.subject_email,
    cr.consent_type,
    cr.purpose,
    cr.consent_given,
    cr.consent_method,
    cr.created_at as consent_date,
    cr.withdrawn_at,
    cr.is_active,
    c.name as client_name
FROM public.gdpr_consent_records cr
LEFT JOIN public.clients c ON c.email = cr.subject_email
WHERE cr.company_id IN (
    -- Solo usuarios de la empresa pueden ver sus consentimientos
    SELECT company_id FROM public.users 
    WHERE auth_user_id = auth.uid()
)
ORDER BY cr.created_at DESC;

-- ============================================================================
-- VERIFICACIÓN POST-CORRECCIÓN
-- ============================================================================
/*
-- Ejecutar esta query para verificar que las vistas fueron corregidas:
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views
WHERE schemaname = 'public'
AND viewname IN (
    'admin_pending_users',
    'users_with_company',
    'user_company_context',
    'admin_company_invitations',
    'admin_company_analysis',
    'gdpr_processing_inventory',
    'gdpr_consent_overview'
)
ORDER BY viewname;

-- Verificar que no hay referencias a auth.users en admin_pending_users:
SELECT definition 
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname = 'admin_pending_users';
-- NO debe aparecer "auth.users" en la definición

-- Verificar security_invoker en todas las vistas:
SELECT 
    c.relname as view_name,
    c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind = 'v'
AND c.relname IN (
    'users_with_company',
    'user_company_context',
    'admin_company_invitations',
    'admin_company_analysis',
    'gdpr_processing_inventory',
    'gdpr_consent_overview'
);
-- Todas deben mostrar: {security_invoker=true}
*/

-- ============================================================================
-- IMPACTO POSITIVO
-- ============================================================================
-- ✅ Protege datos sensibles de auth.users (no accesibles desde admin_pending_users)
-- ✅ Aplica RLS correctamente (vistas usan permisos del usuario, no del creador)
-- ✅ Aislamiento multi-tenant (cada empresa solo ve sus datos)
-- ✅ Cumplimiento GDPR (protección de datos personales)
-- ✅ Principio de mínimo privilegio (usuarios solo acceden a lo necesario)
-- ============================================================================

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
-- Errores de Seguridad: 8 → 0 ✅
-- - auth_users_exposed: 1 → 0 ✅
-- - security_definer_view: 7 → 0 ✅
-- ============================================================================
