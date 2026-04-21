/**
 * InviteTokenGuard - Validates that the /invite route has enough context to resolve
 * an invitation before rendering the component. We allow either an explicit invitation
 * token or a Supabase invite auth hash so the component can restore the session and
 * recover the token from auth metadata.
 */
import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class InviteTokenGuard implements CanActivate {
  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const token =
      route.queryParamMap.get('token') ||
      // Support tokens delivered via URL hash fragment (#token=...)
      this.extractHashParam('token');

    if (token || this.hasInviteAuthFragment()) {
      return true;
    }

    this.router.navigate(['/'], { replaceUrl: true });
    return false;
  }

  private extractHashParam(param: string): string | null {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    return params.get(param);
  }

  private hasInviteAuthFragment(): boolean {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    return params.has('access_token') && params.get('type') === 'invite';
  }
}
