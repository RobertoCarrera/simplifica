import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, combineLatest, of } from 'rxjs';
import { filter, take, timeout, map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class ClientRoleGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    return combineLatest([this.auth.userProfile$, this.auth.loading$]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(15000),
      map(([profile]) => {
        if (!profile) return this.router.parseUrl('/login');
        const role = (profile as any).role as string;
        if (role === 'client' && profile.active) return true;
        // Non-clients are not allowed on client-only routes
        return this.router.parseUrl('/');
      }),
      catchError(() => of(this.router.parseUrl('/login')))
    );
  }
}
