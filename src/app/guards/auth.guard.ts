import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, map, take, filter, timeout, catchError, of } from 'rxjs';
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
    
    console.log('��� AuthGuard: Checking access to:', state.url);
    
    return this.authService.currentUser$.pipe(
      filter(user => user !== undefined),
      take(1),
      timeout(5000),
      map(user => {
        console.log('��� AuthGuard: User state:', user ? 'authenticated' : 'not authenticated');
        
        if (user) {
          return true;
        } else {
          console.log('��� AuthGuard: Redirecting to login');
          this.router.navigate(['/login'], { 
            queryParams: { returnUrl: state.url }
          });
          return false;
        }
      }),
      catchError(error => {
        console.error('��� AuthGuard: Error checking auth state:', error);
        this.router.navigate(['/login']);
        return of(false);
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
    
    return this.authService.userProfile$.pipe(
      filter(profile => profile !== undefined),
      take(1),
      timeout(5000),
      map(profile => {
        if (profile && (profile.role === 'admin' || profile.role === 'owner')) {
          return true;
        } else {
          this.router.navigate(['/']);
          return false;
        }
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
    return this.authService.currentUser$.pipe(
      filter(user => user !== undefined),
      take(1),
      timeout(5000),
      map(user => {
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
      return this.authService.currentUser$.pipe(
        filter(user => user !== undefined),
        take(1),
        timeout(5000),
        map(user => {
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
    
    return this.authService.userProfile$.pipe(
      filter(profile => profile !== undefined),
      take(1),
      timeout(5000),
      map(profile => {
        if (profile && (profile.role === 'admin' || profile.role === 'owner')) {
          return true;
        } else {
          this.router.navigate(['/']);
          return false;
        }
      }),
      catchError(error => {
        console.error('�� DevGuard: Error checking role:', error);
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}
