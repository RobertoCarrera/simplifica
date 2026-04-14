-- =============================================================================
-- IO Performance Optimization: Missing indexes for hot query paths
-- =============================================================================
-- Targets identified via API log analysis:
-- 1. clients list query (select *, addresses, devices, tags WHERE deleted_at IS NULL)
-- 2. role_permissions lookup by company_id
-- 3. get_effective_modules RPC (user_modules, company_modules JOINs)
-- 4. devices nested join from clients query
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CLIENTS — Partial index for the most common query pattern
--    Query:  WHERE company_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
--    Current idx_clients_company_created covers (company_id, created_at DESC)
--    but does NOT filter on deleted_at → seq scan on soft-deleted rows
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_company_active_created
  ON public.clients (company_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. ROLE_PERMISSIONS — No index on company_id at all
--    Query:  WHERE company_id = ? ORDER BY role, permission
--    Without index → full table scan on every sidebar navigation
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_role_permissions_company_id
  ON public.role_permissions (company_id);

-- ---------------------------------------------------------------------------
-- 3. DEVICES — Partial index for client JOIN pattern
--    Query:  devices!devices_client_id_fkey(id, deleted_at) from clients query
--    Current idx_devices_client_id covers client_id but includes deleted devices
--    This partial index skips deleted devices (most common filter)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_devices_client_active
  ON public.devices (client_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. USER_MODULES — Index for get_effective_modules staff path
--    Query:  LEFT JOIN user_modules um ON m.key = um.module_key AND um.user_id = ?
--    Without index → seq scan on user_modules for every RPC call
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_modules_user_id
  ON public.user_modules (user_id);

-- ---------------------------------------------------------------------------
-- 5. CLIENTS_TAGS — Already has PK (client_id, tag_id) which covers
--    the nested join, but adding explicit index for the FK lookup
--    ensures the planner uses index-only scan on tag_id lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_tags_tag_id
  ON public.clients_tags (tag_id);

-- ---------------------------------------------------------------------------
-- 6. CLIENTS — auth_user_id + company_id for get_effective_modules client path
--    Query:  WHERE auth_user_id = ? AND company_id = ? AND is_active = true
--    Current idx_clients_auth_user_id only covers auth_user_id
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_auth_company_active
  ON public.clients (auth_user_id, company_id)
  WHERE auth_user_id IS NOT NULL AND is_active = true;

-- ---------------------------------------------------------------------------
-- 7. Update table statistics for the query planner
--    After adding indexes, Postgres needs fresh stats to use them optimally
-- ---------------------------------------------------------------------------
ANALYZE public.clients;
ANALYZE public.role_permissions;
ANALYZE public.devices;
ANALYZE public.clients_tags;
ANALYZE public.company_modules;
