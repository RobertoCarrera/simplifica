import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { Observable, from, of } from 'rxjs';
import { map, catchError, take, switchMap } from 'rxjs/operators';

/**
 * Guard that restricts access to company owners (and super_admins).
 * Uses the is_company_owner() DB RPC to verify ownership.
 * Redirects to /access-denied if the user is not an owner.
 */
export const ownerOnlyGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const sbClient = inject(SupabaseClientService);
  const router = inject(Router);

  const role = authService.userRole();

  // Super admins always pass
  if (role === 'super_admin') {
    return of(true);
  }

  // Must be owner to access
  if (role !== 'owner') {
    console.warn('[OwnerOnlyGuard] Blocked: user is not owner. Role:', role);
    return of(router.parseUrl('/access-denied'));
  }

  // For owner role, verify via RPC for extra safety
  const companyId = authService.currentCompanyId();
  if (!companyId) {
    console.warn('[OwnerOnlyGuard] Blocked: no company context');
    return of(router.parseUrl('/access-denied'));
  }

  // Use the is_company_owner() RPC for authoritative check
  return from(
    sbClient.instance.rpc('is_company_owner', { p_company_id: companyId } as Record<string, unknown>)
  ).pipe(
    take(1),
    map((result: any) => {
      if (result.data === true) {
        return true;
      }
      console.warn('[OwnerOnlyGuard] is_company_owner RPC returned false — redirecting');
      return router.parseUrl('/access-denied') as UrlTree;
    }),
    catchError((err) => {
      console.error('[OwnerOnlyGuard] RPC error:', err);
      // On error, fall back to role check (owner role was already verified above)
      return of(true);
    })
  );
};
