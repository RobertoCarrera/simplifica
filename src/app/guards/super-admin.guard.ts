import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, combineLatest, map, filter, take, timeout, catchError, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({
    providedIn: 'root'
})
export class SuperAdminGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) { }

    canActivate(): Observable<boolean> | Promise<boolean> | boolean {
        return combineLatest([
            this.authService.userProfile$,
            this.authService.loading$
        ]).pipe(
            filter(([_, loading]) => !loading),
            take(1),
            timeout(15000),
            map(([profile]) => {
                // Strict check: ONLY 'super_admin' or 'is_super_admin' flag
                if (profile && (profile.role === 'super_admin' || !!profile.is_super_admin)) {
                    return true;
                }
                this.router.navigate(['/']);
                return false;
            }),
            catchError(error => {
                console.error('⛔ SuperAdminGuard: Access denied or error:', error);
                this.router.navigate(['/']);
                return of(false);
            })
        );
    }
}
