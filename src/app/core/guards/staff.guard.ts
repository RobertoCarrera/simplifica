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
                // Check for specific staff roles
                const allowedRoles = ['owner', 'admin', 'member', 'professional', 'developer'];
                if (allowedRoles.includes(profile.role)) {
                    return true;
                }

                // If user has 'none' role (orphan), force logout/login to avoid loop
                if (profile.role === 'none') {
                    console.warn('StaffGuard: User has role "none". Redirecting to login.');
                    return this.router.parseUrl('/login');
                }

                // If user is authenticated as client, allow portal access
                if (profile.role === 'client') {
                    return this.router.parseUrl('/portal');
                }

                // Default fallback
                return this.router.parseUrl('/login');
            })
        );
    }
}
