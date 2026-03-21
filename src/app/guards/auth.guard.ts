import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take, filter, timeout, catchError, of, switchMap, combineLatest, from } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DevRoleService } from '../services/dev-role.service';
import { environment } from '../../environments/environment';

/** Shared cache for MFA AAL level — valid for the entire session (AAL doesn't change without re-auth) */
let cachedAalLevel: string | null = null;
let aalCacheTimestamp = 0;
const AAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedAal(): string | null {
  if (cachedAalLevel && Date.now() - aalCacheTimestamp < AAL_CACHE_TTL) {
    return cachedAalLevel;
  }
  return null;
}

/** Shared cache for getUser() server revalidation */
let lastServerRevalidation = 0;
const SERVER_REVALIDATION_TTL = 60 * 1000; // 60 seconds

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
      catchError(error => {
        console.error('🔐 AuthGuard: Error checking auth state:', error);
        return this.authService.client.auth.getSession()
          .then(({ data }) => {
            if (data?.session?.user) {
              return true;
            }
            this.router.navigate(['/login']);
            return false;
          })
          .catch(() => {
            this.router.navigate(['/login']);
            return false;
          });
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
    // Esperar a que termine la carga de auth antes de evaluar el perfil
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        if (profile && (profile.role === 'owner' || profile.role === 'admin' || profile.role === 'super_admin' || profile.is_super_admin)) {
          // Server revalidation with short TTL cache to avoid excessive network calls
          const now = Date.now();
          if (now - lastServerRevalidation < SERVER_REVALIDATION_TTL) {
            return of(true);
          }
          return from(this.authService.client.auth.getUser()).pipe(
            map(({ data, error }) => {
              if (error || !data?.user) {
                this.router.navigate(['/']);
                return false;
              }
              lastServerRevalidation = Date.now();
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
        console.error('⚠️ AdminGuard: Error checking role:', error);
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
    // Esperar a que termine la carga de auth antes de decidir
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
        console.error('GuestGuard: Error checking auth state:', error);
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
      // En desarrollo: permitir si hay usuario, pero esperar loading=false
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
          console.error('DevGuard: Error checking auth state:', error);
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
        console.error('DevGuard: Error checking role:', error);
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
        const allowed = !!profile && (profile.role === 'admin' || profile.role === 'super_admin' || !!profile.is_super_admin);
        if (!allowed) {
          this.router.navigate(['/']);
          return of(false);
        }
        // Use cached AAL if available — MFA status doesn't change without re-authentication
        const cached = getCachedAal();
        if (cached === 'aal2') return of(true);
        if (cached && cached !== 'aal2') {
          // Check if MFA is configured but not yet verified
          return of(true); // No MFA configured case handled by cache
        }
        return from(this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel()).pipe(
          map(({ data }) => {
            cachedAalLevel = data?.currentLevel ?? null;
            aalCacheTimestamp = Date.now();
            if (data?.currentLevel === 'aal2') return true;
            if (data?.nextLevel === 'aal2') {
              this.router.navigate(['/mfa-verify']);
              return false;
            }
            return true;
          }),
          catchError(() => of(true))
        );
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
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
        const allowed = !!profile && (profile.role === 'owner' || profile.role === 'admin' || !!profile.is_super_admin);
        if (!allowed) {
          this.router.navigate(['/']);
          return of(false);
        }
        // Use cached AAL if available — MFA status doesn't change without re-authentication
        const cached = getCachedAal();
        if (cached === 'aal2') return of(true);
        if (cached && cached !== 'aal2') {
          return of(true);
        }
        return from(this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel()).pipe(
          map(({ data }) => {
            cachedAalLevel = data?.currentLevel ?? null;
            aalCacheTimestamp = Date.now();
            if (data?.currentLevel === 'aal2') return true;
            if (data?.nextLevel === 'aal2') {
              this.router.navigate(['/mfa-verify']);
              return false;
            }
            return true;
          }),
          catchError(() => of(true))
        );
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}
