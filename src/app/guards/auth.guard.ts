import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take, filter, timeout, catchError, of, switchMap, combineLatest } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DevRoleService } from '../services/dev-role.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private devRoleService: DevRoleService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    console.log('🔐 AuthGuard: Checking access to:', state.url);

    return combineLatest([
      this.authService.currentUser$,
      this.authService.loading$
    ]).pipe(
      // Wait until the auth service finished initializing/restoring session
      filter(([_, loading]) => !loading),
  take(1),
  timeout(15000),
      switchMap(([user]) => {
        console.log('🔐 AuthGuard: User state:', user ? 'authenticated' : 'not authenticated');
        if (!user) {
          console.log('🔐 AuthGuard: Redirecting to login');
          // Use navigation state to pass the original destination so the URL stays clean
          // (avoids ugly encoded `?returnUrl=...` query strings). The Login component
          // will read history.state.returnTo and fall back to the legacy query param.
          this.router.navigate(['/login'], { state: { returnTo: state.url } });
          return of(false);
        }

        // Esperar a que termine la carga del perfil antes de decidir
        return combineLatest([
          this.authService.userProfile$,
          this.authService.loading$
        ]).pipe(
          filter(([_, loading]) => !loading),
          take(1),
          timeout(15000),
          map(([profile]) => {
            if (profile && profile.active) {
              return true;
            }
            console.warn('🔐 AuthGuard: Authenticated but no active app profile. Redirecting to confirmation.');
            this.router.navigate(['/auth/confirm'], { queryParams: { pending: '1' } });
            return false;
          }),
          catchError(err => {
            console.error('🔐 AuthGuard: Error checking user profile:', err);
            this.router.navigate(['/auth/confirm'], { queryParams: { pending: '1' } });
            return of(false);
          })
        );
      }),
      catchError(error => {
        console.error('🔐 AuthGuard: Error checking auth state:', error);
        // Before redirecting, perform a last synchronous session check
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
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    // Esperar a que termine la carga de auth antes de evaluar el perfil
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(15000),
      map(([profile]) => {
        if (profile && profile.role === 'admin') {
          return true;
        }
        this.router.navigate(['/']);
        return false;
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
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    // Esperar a que termine la carga de auth antes de decidir
    return combineLatest([
      this.authService.currentUser$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(15000),
      map(([user]) => {
        if (!user) {
          return true;
        } else {
          this.router.navigate(['/']);
          return false;
        }
      }),
      catchError(error => {
        console.error('��� GuestGuard: Error checking auth state:', error);
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
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    if (!environment.production) {
      // En desarrollo: permitir si hay usuario, pero esperar loading=false
      return combineLatest([
        this.authService.currentUser$,
        this.authService.loading$
      ]).pipe(
        filter(([_, loading]) => !loading),
        take(1),
        timeout(15000),
        map(([user]) => {
          if (user) {
            return true;
          } else {
            this.router.navigate(['/login']);
            return false;
          }
        }),
        catchError(error => {
          console.error('��� DevGuard: Error checking auth state:', error);
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
      timeout(15000),
      map(([profile]) => {
        if (profile && profile.role === 'admin') {
          return true;
        }
        this.router.navigate(['/']);
        return false;
      }),
      catchError(error => {
        console.error('�� DevGuard: Error checking role:', error);
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
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(15000),
      map(([profile]) => {
        const allowed = !!profile && (profile.role === 'owner' || profile.role === 'admin');
        if (!allowed) {
          this.router.navigate(['/']);
        }
        return allowed;
      }),
      catchError(() => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}
