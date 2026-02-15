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
                console.log('🛡️ [StaffGuard] Evaluating profile:', profile);

                if (!profile) {
                    // Critical fix: If user is authenticated but has no profile (integrity issue),
                    // redirect to complete-profile instead of forcing logout.
                    console.warn('🛡️ [StaffGuard] BLOCKED: User authenticated but "profile" is null/undefined. Redirecting to /complete-profile.');
                    return this.router.parseUrl('/complete-profile');
                }

                // Check for specific staff roles
                // 'super_admin', 'owner', 'admin', 'member', 'professional', 'agent', 'developer' are staff.
                // 'client' and 'none' are NOT staff.
                const allowedRoles = ['super_admin', 'owner', 'admin', 'member', 'professional', 'agent', 'developer'];
                console.log('🛡️ [StaffGuard] Profile role:', profile.role, 'Allowed:', allowedRoles.includes(profile.role));

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
