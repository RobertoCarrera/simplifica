-- ============================================================================
-- Migration: Fix RLS policies broken by Rafter v0.4 anon RPC revoke
-- ============================================================================
-- Rafter v0.4 (commit 44c8a6a7) revoked EXECUTE ON FUNCTION public.is_super_admin
-- and public.is_super_admin(uuid) FROM anon, authenticated. Only service_role
-- retained EXECUTE.
--
-- But 13 RLS policies still call those functions in their predicates:
--
--   app_settings, companies, company_invitations (×4),
--   company_modules (×2), docs_article_roles, docs_articles (×2),
--   docs_categories, notifications
--
-- When PostgREST evaluates a query that triggers any of those policies, it
-- invokes the predicate; the call fails with `permission denied for function
-- is_super_admin` and the whole query 403s — bricking login/navigation for
-- every authenticated user.
--
-- Fix: replace the revoked calls with is_super_admin_real(), which has
-- equivalent semantics ("is the currently authenticated user a super_admin?")
-- and retains EXECUTE for the authenticated role.
--
-- Both revoked functions and is_super_admin_real() ultimately resolve to:
--   "users.auth_user_id = auth.uid() AND users.app_role_id → app_roles.name = 'super_admin'"
--
-- is_super_admin()       → SELECT current_user_role() = 'super_admin'
-- is_super_admin(uuid)   → EXISTS check on users.auth_user_id + app_roles.name
-- is_super_admin_real()  → EXISTS check on users.auth_user_id + app_roles.name (active = true)
--
-- The `active = true` clause in is_super_admin_real() is a safe tightening:
-- a deactivated super_admin loses the bypass. Defensive.
--
-- The REVOKE itself stays in place — that was a correct security measure.
-- Only the policy references are updated.
-- ============================================================================

-- app_settings
DROP POLICY IF EXISTS "Super admins can manage app_settings" ON public.app_settings;
CREATE POLICY "Super admins can manage app_settings"
  ON public.app_settings
  FOR ALL
  USING (public.is_super_admin_real())
  WITH CHECK (public.is_super_admin_real());

-- companies
DROP POLICY IF EXISTS "Superadmins can view all companies" ON public.companies;
CREATE POLICY "Superadmins can view all companies"
  ON public.companies
  FOR SELECT
  USING (public.is_super_admin_real());

-- company_invitations (4 policies)
DROP POLICY IF EXISTS "Authorized users can delete invitations" ON public.company_invitations;
CREATE POLICY "Authorized users can delete invitations"
  ON public.company_invitations
  FOR DELETE
  USING ((public.is_super_admin_real() OR (invited_by_user_id = auth.uid())));

DROP POLICY IF EXISTS "Authorized users can create invitations" ON public.company_invitations;
CREATE POLICY "Authorized users can create invitations"
  ON public.company_invitations
  FOR INSERT
  WITH CHECK (
    (public.is_super_admin_real() OR ((company_id IS NOT NULL) AND (EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = company_invitations.company_id
        AND cm.user_id = (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
        AND cm.role_id IN (SELECT app_roles.id FROM app_roles
                           WHERE app_roles.name = ANY (ARRAY['owner'::text, 'admin'::text]))
    ))))
  );

DROP POLICY IF EXISTS "Company members and superadmins can view invitations" ON public.company_invitations;
CREATE POLICY "Company members and superadmins can view invitations"
  ON public.company_invitations
  FOR SELECT
  USING (
    (public.is_super_admin_real()
     OR ((company_id IS NOT NULL) AND (EXISTS (
       SELECT 1 FROM company_members cm
       WHERE cm.company_id = company_invitations.company_id
         AND cm.user_id = (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
     )))
     OR (lower(email) = lower((auth.jwt() ->> 'email'::text)))
     OR (invited_by_user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Authorized users can update invitations" ON public.company_invitations;
CREATE POLICY "Authorized users can update invitations"
  ON public.company_invitations
  FOR UPDATE
  USING ((public.is_super_admin_real() OR (invited_by_user_id = auth.uid())))
  WITH CHECK (
    (public.is_super_admin_real()
     OR ((invited_by_user_id = auth.uid())
         AND (status = ANY (ARRAY['pending'::text, 'cancelled'::text]))
         AND ((EXISTS (SELECT 1 FROM company_invitations ci
                       WHERE ci.id = company_invitations.id AND ci.status = 'pending'::text))
              OR (status = 'cancelled'::text))))
  );

-- company_modules (2 policies)
DROP POLICY IF EXISTS "Super Admins can manage company_modules" ON public.company_modules;
CREATE POLICY "Super Admins can manage company_modules"
  ON public.company_modules
  FOR ALL
  USING (public.is_super_admin_real())
  WITH CHECK (public.is_super_admin_real());

DROP POLICY IF EXISTS "Users can view their own company modules" ON public.company_modules;
CREATE POLICY "Users can view their own company modules"
  ON public.company_modules
  FOR SELECT
  USING (
    ((company_id = (SELECT users.company_id FROM users WHERE users.id = auth.uid()))
     OR public.is_super_admin_real())
  );

-- docs_article_roles
DROP POLICY IF EXISTS "docs_article_roles_write" ON public.docs_article_roles;
CREATE POLICY "docs_article_roles_write"
  ON public.docs_article_roles
  FOR ALL
  USING (public.is_super_admin_real())
  WITH CHECK (public.is_super_admin_real());

-- docs_articles (2 policies)
DROP POLICY IF EXISTS "docs_articles_write" ON public.docs_articles;
CREATE POLICY "docs_articles_write"
  ON public.docs_articles
  FOR ALL
  USING (public.is_super_admin_real())
  WITH CHECK (public.is_super_admin_real());

DROP POLICY IF EXISTS "docs_articles_read" ON public.docs_articles;
CREATE POLICY "docs_articles_read"
  ON public.docs_articles
  FOR SELECT
  USING (
    (((status = 'published'::text) AND (EXISTS (
      SELECT 1 FROM docs_article_roles r
      WHERE r.article_id = docs_articles.id AND r.role = public.current_user_role()
    )))
     OR public.is_super_admin_real())
  );

-- docs_categories
DROP POLICY IF EXISTS "docs_categories_write" ON public.docs_categories;
CREATE POLICY "docs_categories_write"
  ON public.docs_categories
  FOR ALL
  USING (public.is_super_admin_real())
  WITH CHECK (public.is_super_admin_real());

-- notifications
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    (public.is_super_admin_real()
     OR (company_id IN (SELECT company_members.company_id
                        FROM company_members
                        WHERE company_members.user_id = (SELECT users.id FROM users WHERE users.auth_user_id = auth.uid())
                          AND company_members.status = 'active'::text)))
  );
