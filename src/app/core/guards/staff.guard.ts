import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, combineLatest, filter, map, take } from 'rxjs';
import { AuthService, AppUser } from '../../services/auth.service';

@Injectable({
    providedIn: 'root'
})
export class StaffGuard implements CanActivate {
    private auth = inject(AuthService);
    private router = inject(Router);

    canActivate(): Observable<boolean | UrlTree> {

        return combineLatest([
            this.auth.userProfile$,
            this.auth.loading$
        ]).pipe(
            filter(([_, loading]) => !loading), // Wait until loading is false
            take(1),
            map(([profile]) => {
                if (!profile) {
                    // Critical fix: If user is authenticated but has no profile (integrity issue),
                    // forcing logout breaks the infinite loop with GuestGuard (which redirects to / if authenticated).
                    if (this.auth.currentUser) {
                        console.warn('StaffGuard: User authenticated but no profile found. Forcing logout to prevent redirect loop.');
                        this.auth.logout(); // Async, but we redirect immediately
                    }
                    return this.router.parseUrl('/login');
                }

                // Check for specific staff roles
                // 'owner', 'admin', 'member' are staff.
                // 'client' and 'none' are NOT staff.
                const allowedRoles = ['owner', 'admin', 'member'];
                if (allowedRoles.includes(profile.role)) {
                    return true;
                }

                // If user is authenticated but not staff (e.g. client), redirect home
                // Typically clients have their own dashboard at root or specific paths
                return this.router.parseUrl('/portal');
            })
        );
    }
}
