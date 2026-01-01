import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, filter, map, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Injectable({
    providedIn: 'root'
})
export class StaffGuard implements CanActivate {
    private auth = inject(AuthService);
    private router = inject(Router);

    canActivate(): Observable<boolean | UrlTree> {
        return this.auth.userProfile$.pipe(
            filter(profile => !!profile || !this.auth.isLoading), // Wait for loading to finish
            take(1),
            map(profile => {
                if (!profile) {
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
