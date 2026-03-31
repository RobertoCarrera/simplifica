import { Injectable, inject } from "@angular/core";
import { CanActivate, Router, UrlTree } from "@angular/router";
import {
  Observable,
  combineLatest,
  filter,
  map,
  take,
  timeout,
  catchError,
  of,
} from "rxjs";
import { AuthService, AppUser } from "../../services/auth.service";

@Injectable({
  providedIn: "root",
})
export class StaffGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return combineLatest([this.auth.userProfile$, this.auth.loading$]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      map(([profile]) => {
        if (!profile) {
          // Critical fix: If user is authenticated but has no profile (integrity issue),
          // redirect to complete-profile instead of forcing logout.
          console.warn(
            '🛡️ [StaffGuard] BLOCKED: User authenticated but "profile" is null/undefined. Redirecting to /complete-profile.',
          );
          return this.router.parseUrl("/complete-profile");
        }

        // Check for specific staff roles
        // 'super_admin', 'owner', 'admin', 'member', 'professional', 'agent', 'developer' are staff.
        // 'client' and 'none' are NOT staff.
        const allowedRoles = [
          "super_admin",
          "owner",
          "admin",
          "member",
          "professional",
          "agent",
          "developer",
        ];

        if (allowedRoles.includes(profile.role)) {
          return true;
        }

        // If user has 'none' role (orphan), log out completely before
        // redirecting to /login. Simply redirecting causes an infinite
        // loop: GuestGuard sees currentUser$ populated → redirects to
        // /inicio → StaffGuard sees 'none' → /login → GuestGuard → …
        if (profile.role === "none") {
          console.warn(
            'StaffGuard: User has role "none". Logging out to prevent redirect loop.',
          );
          // logout() calls clearUserData() synchronously, so
          // currentUser$ becomes null before GuestGuard evaluates.
          this.auth.logout();
          return this.router.parseUrl("/login");
        }

        // If user is authenticated as client, allow portal access
        if (profile.role === "client") {
          return this.router.parseUrl("/portal");
        }

        // Default fallback — also log out to avoid the same loop for
        // any unknown/unrecognised role.
        console.warn(
          'StaffGuard: Unrecognised role "' + profile.role + '". Logging out.',
        );
        this.auth.logout();
        return this.router.parseUrl("/login");
      }),
      catchError(() => of(this.router.parseUrl("/login"))),
    );
  }
}
