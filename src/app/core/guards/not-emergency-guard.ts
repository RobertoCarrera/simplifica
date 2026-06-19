import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../../services/auth.service";

/**
 * Blocks super-admins from accessing /complete-profile.
 * Super-admins have a complete profile — the component
 * shows mandatory TOTP enrollment which is irrelevant for them
 * and causes a confusing UX. No one else is affected.
 *
 * SECURITY: super-admin status is determined by the DB-backed
 * app_role join (users.app_role_id -> app_roles.name = 'super_admin').
 * Previously this guard was hardcoded to block a specific email.
 */
export const NotEmergencySuperAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isEmergencySuperAdmin()) {
    console.warn('[NotEmergencySuperAdminGuard] Super-admin blocked from /complete-profile — redirecting to /inicio');
    return router.createUrlTree(['/inicio']);
  }

  return true;
};