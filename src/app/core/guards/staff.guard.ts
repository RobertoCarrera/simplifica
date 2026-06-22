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
  switchMap,
  from,
} from "rxjs";
import { AuthService, AppUser } from "../../services/auth.service";
import { getCachedAal, setCachedAal } from "../../guards/auth.guard";

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
      switchMap(([profile]) => {
        if (!profile) {
          console.warn(
            '🛡️ [StaffGuard] BLOCKED: User authenticated but "profile" is null/undefined. Redirecting to /complete-profile.',
          );
          return of(this.router.parseUrl("/complete-profile"));
        }

        const allowedRoles = [
          "super_admin",
          "owner",
          "admin",
          "supervisor",
          "member",
          "professional",
          "agent",
          "developer",
        ];

        // Rafter v0.31: MFA enforced for super_admin at login.
        // Previously super_admin had an early return here that skipped the
        // AAL2 block below entirely. Comment claimed "no separate bypass
        // needed" but `return of(true)` is exactly a bypass. Removed so the
        // AAL2 enforcement below (lines ~74-108, the `mfa.getAuthenticatorAssuranceLevel`
        // call) now runs for super_admin too. If TOTP is enrolled but not
        // verified this session, super_admin gets redirected to /mfa-verify
        // just like staff.
        //
        // (commit 8a24b457)

        if (!allowedRoles.includes(profile.role)) {
          if (profile.role === "none") {
            console.warn(
              'StaffGuard: User has role "none". Logging out to prevent redirect loop.',
            );
            this.auth.logout();
            return of(this.router.parseUrl("/login"));
          }

          if (profile.role === "client") {
            return of(this.router.parseUrl("/portal"));
          }

          console.warn(
            'StaffGuard: Unrecognised role "' + profile.role + '". Logging out.',
          );
          this.auth.logout();
          return of(this.router.parseUrl("/login"));
        }

        // ── AAL2 enforcement: if user has TOTP enrolled, require step-up ──
        const userId = profile.auth_user_id || profile.id;
        const cached = getCachedAal(userId);
        if (cached === "aal2") {
          return of(true as boolean | UrlTree);
        }

        return from(
          this.auth.client.auth.mfa.getAuthenticatorAssuranceLevel(),
        ).pipe(
          map(({ data }) => {
            if (data?.currentLevel === "aal2") {
              setCachedAal(userId, "aal2");
              return true as boolean | UrlTree;
            }
            if (data?.nextLevel === "aal2") {
              // User has TOTP enrolled but hasn't verified this session
              console.warn(
                "🛡️ [StaffGuard] AAL2 step-up required. Redirecting to /mfa-verify.",
              );
              return this.router.parseUrl("/mfa-verify");
            }
            // No TOTP enrolled — allow through (AAL1)
            return true as boolean | UrlTree;
          }),
          catchError(() => {
            // C-2: Fail closed on MFA check error (network/5xx/timeout).
            // Returning true here would let a DoS of the Supabase MFA endpoint
            // bypass AAL2 entirely. Redirect to /login so the user re-auths
            // and the next navigation re-evaluates MFA correctly.
            console.error('🛡️ [StaffGuard] MFA check failed — failing closed');
            this.router.navigate(['/login'], { queryParams: { reason: 'mfa_unavailable' } });
            return of(false as boolean | UrlTree);
          }),
        );
      }),
      catchError(() => of(this.router.parseUrl("/login"))),
    );
  }
}
