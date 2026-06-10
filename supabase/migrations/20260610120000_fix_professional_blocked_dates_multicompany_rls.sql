-- ============================================
-- Migration: fix professional_blocked_dates RLS for multi-company professionals
-- Hija del trabajo de bloqueos cross-company de junio 2026.
--
-- Síntoma: Un owner (gestio@caibs.es) crea un bloqueo en
-- `professional_blocked_dates` para el profesional "Roberto Carrera Santa Maria"
-- (company_id = CAIBS). El profesional (Roberto, supervisor de CAIBS) no ve
-- el bloqueo en su UI de "Mi perfil → Bloqueos", aunque es para él y debe
-- poder gestionarlo.
--
-- Causa: la policy `blocked_dates_select` (migration 20260413200001) hace
--   AND p.company_id = (SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
-- que para un usuario multi-company (Roberto es owner de Simplifica y
-- supervisor de CAIBS) compara con su company PRIMARIA (Simplifica), por lo
-- que los bloqueos de su fila de `professionals` en CAIBS se filtran.
--
-- Esto es el mismo "Multi-Company RLS Bug" documentado en la skill
-- `simplifica`: policies que usan `users.company_id` fallan silenciosamente
-- para usuarios con `company_members` en varias companies.
--
-- Fix:
--   - SELECT: un profesional ve los bloqueos de CUALQUIER fila `professionals`
--     que tenga su `user_id` (sin filtro de company). Así Roberto ve sus
--     bloqueos tanto si está en Simplifica como en CAIBS.
--     Los admins/owners/supervisors de la company del bloqueo siguen viendo
--     los bloqueos de su company a través del EXISTS en `company_members`.
--   - INSERT/UPDATE/DELETE: el patrón original es correcto (admin o dueño
--     del bloqueo), se mantiene.
--
-- Backfill: ninguno necesario — los datos ya están bien, solo se ajusta
-- la visibility.
-- ============================================

DROP POLICY IF EXISTS "blocked_dates_select" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_select" ON professional_blocked_dates
  FOR SELECT USING (
    -- Path A: el profesional dueño del registro de `professionals` (en cualquier company)
    EXISTS (
      SELECT 1 FROM professionals p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = professional_blocked_dates.professional_id
        AND u.auth_user_id = auth.uid()
        AND p.is_active = true
    )
    OR
    -- Path B: admin/owner/supervisor/super_admin de la company del bloqueo
    EXISTS (
      SELECT 1
      FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = professional_blocked_dates.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin', 'supervisor', 'super_admin')
    )
  );

-- INSERT/UPDATE/DELETE: mantener el patrón original (admin o dueño del
-- profesional — los profesionales solo pueden gestionar SUS bloqueos, no los
-- de otros profesionales aunque sean de la misma company).
-- (Estas policies ya están bien — se mantienen tal cual.)

-- También: hay que arreglar el helper que usaba `current_user_is_admin` para
-- que soporte multi-company (devuelva true si es admin de LA company del
-- bloqueo, no solo de la primary). Si ese helper solo mira users.company_id,
-- un admin de CAIBS logueado con currentCompanyId=Simplifica no podría
-- insertar bloqueos en CAIBS. Verificar y parchear si aplica.
