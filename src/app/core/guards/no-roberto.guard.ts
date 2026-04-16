import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../../services/auth.service";

/**
 * Blocks Roberto from accessing /complete-profile.
 * He is super_admin with a complete profile — the component
 * shows mandatory TOTP enrollment which is irrelevant for him
 * and causes a confusing UX. No one else is affected.
 */
export const noRobertoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const email = auth.currentUser?.email;
  if (email === 'roberto@simplificacrm.es') {
    console.warn('[NoRobertoGuard] Roberto blocked from /complete-profile — redirecting to /inicio');
    return router.createUrlTree(['/inicio']);
  }

  return true;
};