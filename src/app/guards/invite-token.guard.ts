/**
 * InviteTokenGuard - Validates that the /invite route has a `token` query param before
 * rendering the invite component. This avoids the component loading, making
 * RPC calls, and showing a confusing empty state when the URL is visited
 * without a valid invitation link.
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

    if (token) {
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
}
