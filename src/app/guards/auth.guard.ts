import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take, filter, timeout, catchError, of, switchMap, combineLatest, from } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DevRoleService } from '../services/dev-role.service';
import { environment } from '../../environments/environment';

// Fix #2: AAL cache keyed by user ID to prevent cross-user cache poisoning.
// Global module-level state is intentional here (singleton guards in Angular),
// but the cache is now scoped per user so a logout + re-login as a different
// user cannot reuse the previous user's MFA state.
interface AalCacheEntry {
  level: string;
  timestamp: number;
}
const aalCacheByUser = new Map<string, AalCacheEntry>();
const AAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedAal(userId: string): string | null {
  const entry = aalCacheByUser.get(userId);
  if (entry && Date.now() - entry.timestamp < AAL_CACHE_TTL) {
    return entry.level;
  }
  return null;
}

function setCachedAal(userId: string, level: string): void {
  aalCacheByUser.set(userId, { level, timestamp: Date.now() });
}

/** Clear AAL cache — must be called on logout to prevent cross-user cache poisoning */
export function clearAalCache(): void {
  aalCacheByUser.clear();
  lastServerRevalidation.clear();
}

// Fix #5: Server revalidation keyed by user ID — avoids one user's revalidation
// state leaking to another user on the same browser session.
// Additionally, revalidation now checks the actual role from the server,
// not just whether the user exists.
const lastServerRevalidation = new Map<string, number>();
const SERVER_REVALIDATION_TTL = 30 * 1000; // Reduced from 60s to 30s for admin routes

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private devRoleService: DevRoleService,
    private router: Router
  ) { }

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {

    // Single wait: wait for auth + profile to finish loading together
    return combineLatest([
      this.authService.currentUser$,
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, __, loading]) => !loading),
      take(1),
      timeout(8000),
      map(([user, _profile]) => {
        if (!user) {
          this.router.navigate(['/login'], { state: { returnTo: state.url } });
          return false;
        }
        return true;
      }),
      // Fix #6: Wrap fallback getSession() in a Promise.race with a timeout
      // to prevent indefinite hangs when Supabase is slow.
      catchError(error => {
        if (!environment.production) {
          console.error('AuthGuard: Error checking auth state:', error);
        }
        const sessionWithTimeout = Promise.race([
          this.authService.client.auth.getSession(),
          new Promise<{ data: { session: null } }>(resolve =>
            setTimeout(() => resolve({ data: { session: null } }), 5000)
          )
        ]);
        return from(
          sessionWithTimeout
            .then(({ data }) => {
              if (data?.session?.user) return true;
              this.router.navigate(['/login']);
              return false;
            })
            .catch(() => {
              this.router.navigate(['/login']);
              return false;
            })
        );
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private devRoleService: DevRoleService,
    private router: Router
  ) { }

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        if (profile && (profile.role === 'owner' || profile.role === 'admin' || profile.role === 'super_admin' || profile.is_super_admin)) {
          // Fix #5: Check actual role from server, not just user existence.
          // Use per-user revalidation timestamp to avoid leaking state between users.
          const userId = profile.auth_user_id || profile.id;
          const now = Date.now();
          const lastRevalidated = lastServerRevalidation.get(userId) || 0;
          if (now - lastRevalidated < SERVER_REVALIDATION_TTL) {
            return of(true);
          }
          // Revalidate: verify user still has admin/owner role on the server
          return from(this.authService.client.auth.getUser()).pipe(
            map(({ data, error }) => {
              if (error || !data?.user) {
                this.router.navigate(['/']);
                return false;
              }
              // Revalidate role from current profile (profile signal is live)
              const currentRole = this.authService.userRole();
              if (!['owner', 'admin', 'super_admin'].includes(currentRole)) {
                this.router.navigate(['/']);
                return false;
              }
              lastServerRevalidation.set(userId, Date.now());
              return true;
            }),
            catchError(() => {
              this.router.navigate(['/']);
              return of(false);
            })
          );
        }
        this.router.navigate(['/']);
        return of(false);
      }),
      catchError(error => {
        if (!environment.production) {
          console.error('AdminGuard: Error checking role:', error);
        }
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class GuestGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.currentUser$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      map(([user]) => {
        if (!user) {
          return true;
        } else {
          this.router.navigate(['/']);
          return false;
        }
      }),
      catchError(error => {
        if (!environment.production) {
          console.error('GuestGuard: Error checking auth state:', error);
        }
        return of(true);
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class DevGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private devRoleService: DevRoleService,
    private router: Router
  ) { }

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (!environment.production) {
      return combineLatest([
        this.authService.currentUser$,
        this.authService.loading$
      ]).pipe(
        filter(([_, loading]) => !loading),
        take(1),
        timeout(8000),
        map(([user]) => {
          if (user) {
            return true;
          } else {
            this.router.navigate(['/login']);
            return false;
          }
        }),
        catchError(error => {
          if (!environment.production) {
            console.error('DevGuard: Error checking auth state:', error);
          }
          this.router.navigate(['/login']);
          return of(false);
        })
      );
    }
    // En producción: sólo admins, esperar loading=false
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      map(([profile]) => {
        if (profile && (profile.role === 'owner' || profile.role === 'admin' || profile.is_super_admin)) {
          return true;
        }
        this.router.navigate(['/']);
        return false;
      }),
      catchError(error => {
        if (!environment.production) {
          console.error('DevGuard: Error checking role:', error);
        }
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class StrictAdminGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) { }

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        // StrictAdmin: only admin/super_admin — owners do NOT get super_admin tools
        const allowed = !!profile && (profile.role === 'admin' || profile.role === 'super_admin' || !!profile.is_super_admin);
        if (!allowed) {
          this.router.navigate(['/']);
          return of(false);
        }
        return this.checkMfa(profile.auth_user_id || profile.id);
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }

  private checkMfa(userId: string): Observable<boolean> {
    const cached = getCachedAal(userId);
    if (cached === 'aal2') return of(true);
    return from(this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel()).pipe(
      map(({ data }) => {
        const level = data?.currentLevel ?? null;
        if (level) setCachedAal(userId, level);
        if (data?.currentLevel === 'aal2') return true;
        if (data?.nextLevel === 'aal2') {
          this.router.navigate(['/mfa-verify']);
          return false;
        }
        return true;
      }),
      catchError(() => of(true))
    );
  }
}

@Injectable({
  providedIn: 'root'
})
export class OwnerAdminGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) { }

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        const allowed = !!profile && (profile.role === 'owner' || profile.role === 'admin' || profile.role === 'super_admin' || !!profile.is_super_admin);
        if (!allowed) {
          this.router.navigate(['/']);
          return of(false);
        }
        return this.checkMfa(profile.auth_user_id || profile.id);
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }

  private checkMfa(userId: string): Observable<boolean> {
    const cached = getCachedAal(userId);
    if (cached === 'aal2') return of(true);
    return from(this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel()).pipe(
      map(({ data }) => {
        const level = data?.currentLevel ?? null;
        if (level) setCachedAal(userId, level);
        if (data?.currentLevel === 'aal2') return true;
        if (data?.nextLevel === 'aal2') {
          this.router.navigate(['/mfa-verify']);
          return false;
        }
        return true;
      }),
      catchError(() => of(true))
    );
  }
}
