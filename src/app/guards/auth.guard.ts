import { Injectable } from "@angular/core";
import {
  CanActivate,
  Router,
  UrlTree,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from "@angular/router";
import {
  Observable,
  map,
  take,
  filter,
  timeout,
  catchError,
  of,
  switchMap,
  combineLatest,
  from,
} from "rxjs";
import { AuthService } from "../services/auth.service";
import { DevRoleService } from "../services/dev-role.service";
import { environment } from "../../environments/environment";

// Fix #2: AAL cache keyed by user ID to prevent cross-user cache poisoning.
interface AalCacheEntry {
  level: string;
  timestamp: number;
}
const aalCacheByUser = new Map<string, AalCacheEntry>();
const AAL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedAal(userId: string): string | null {
  const entry = aalCacheByUser.get(userId);
  if (entry && Date.now() - entry.timestamp < AAL_CACHE_TTL) {
    return entry.level;
  }
  return null;
}

function setCachedAal(userId: string, level: string): void {
  aalCacheByUser.set(userId, { level, timestamp: Date.now() });
}

export { getCachedAal, setCachedAal };

/** Clear AAL cache — must be called on logout to prevent cross-user cache poisoning */
export function clearAalCache(): void {
  aalCacheByUser.clear();
  lastServerRevalidation.clear();
}

const lastServerRevalidation = new Map<string, number>();
const SERVER_REVALIDATION_TTL = 30 * 1000;

@Injectable({
  providedIn: "root",
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private devRoleService: DevRoleService,
    private router: Router,
  ) {}

  // Auth flow routes that must NOT enforce AAL2 (would cause redirect loops)
  private static readonly MFA_EXEMPT_ROUTES = [
    "/mfa-verify",
    "/complete-profile",
    "/accept-dpa",
    "/switching-company",
    "/invite",
    "/auth/callback",
    "/auth/confirm",
  ];

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Observable<boolean | UrlTree> {
    const isMfaExempt = AuthGuard.MFA_EXEMPT_ROUTES.some((r) =>
      state.url.startsWith(r),
    );

    return combineLatest([
      this.authService.currentUser$,
      this.authService.userProfile$,
      this.authService.loading$,
    ]).pipe(
      filter(([_, __, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([user, _profile]) => {
        if (!user) {
          this.router.navigate(["/login"], { state: { returnTo: state.url } });
          return of(false as boolean | UrlTree);
        }

        // Auth flow screens: allow through without AAL2 check
        if (isMfaExempt) {
          return of(true as boolean | UrlTree);
        }

        // Enforce AAL2: if user has TOTP enrolled but hasn't verified, redirect
        const userId = user.id;
        const cached = getCachedAal(userId);
        if (cached === "aal2") {
          return of(true as boolean | UrlTree);
        }

        return from(
          this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel(),
        ).pipe(
          map(({ data }) => {
            if (data?.currentLevel === "aal2") {
              setCachedAal(userId, "aal2");
              return true as boolean | UrlTree;
            }
            if (data?.nextLevel === "aal2") {
              return this.router.parseUrl("/mfa-verify");
            }
            // No TOTP enrolled — allow through at AAL1
            return true as boolean | UrlTree;
          }),
          catchError(() => of(true as boolean | UrlTree)),
        );
      }),
      catchError((error) => {
        if (!environment.production) {
          console.error("AuthGuard: Error checking auth state:", error);
        }
        const sessionWithTimeout = Promise.race([
          this.authService.client.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 5000),
          ),
        ]);
        return from(
          sessionWithTimeout
            .then(({ data }) => {
              if (data?.session?.user) return true as boolean | UrlTree;
              this.router.navigate(["/login"]);
              return false as boolean | UrlTree;
            })
            .catch(() => {
              this.router.navigate(["/login"]);
              return false as boolean | UrlTree;
            }),
        );
      }),
    );
  }
}

@Injectable({
  providedIn: "root",
})
export class AdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private devRoleService: DevRoleService,
    private router: Router,
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$,
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        if (
          profile &&
          (profile.role === "owner" ||
            profile.role === "admin" ||
            profile.role === "super_admin" ||
            profile.is_super_admin)
        ) {
          const userId = profile.auth_user_id || profile.id;
          const now = Date.now();
          const lastRevalidated = lastServerRevalidation.get(userId) || 0;
          if (now - lastRevalidated < SERVER_REVALIDATION_TTL) {
            return of(true);
          }
          return from(this.authService.client.auth.getUser()).pipe(
            map(({ data, error }) => {
              if (error || !data?.user) {
                this.router.navigate(["/"]);
                return false;
              }
              const currentRole = this.authService.userRole();
              if (!["owner", "admin", "super_admin"].includes(currentRole)) {
                this.router.navigate(["/"]);
                return false;
              }
              lastServerRevalidation.set(userId, Date.now());
              return true;
            }),
            catchError(() => {
              this.router.navigate(["/"]);
              return of(false);
            }),
          );
        }
        this.router.navigate(["/"]);
        return of(false);
      }),
      catchError((error) => {
        if (!environment.production) {
          console.error("AdminGuard: Error checking role:", error);
        }
        this.router.navigate(["/"]);
        return of(false);
      }),
    );
  }
}

@Injectable({
  providedIn: "root",
})
export class GuestGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.currentUser$,
      this.authService.loading$,
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      map(([user]) => {
        if (!user) {
          return true;
        } else {
          this.router.navigate(["/"]);
          return false;
        }
      }),
      catchError((error) => {
        if (!environment.production) {
          console.error("GuestGuard: Error checking auth state:", error);
        }
        return of(true);
      }),
    );
  }
}

@Injectable({
  providedIn: "root",
})
export class StrictAdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$,
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        const allowed =
          !!profile &&
          (profile.role === "admin" ||
            profile.role === "super_admin" ||
            !!profile.is_super_admin);
        if (!allowed) {
          this.router.navigate(["/"]);
          return of(false);
        }
        return this.checkMfa(profile.auth_user_id || profile.id);
      }),
      catchError(() => {
        this.router.navigate(["/"]);
        return of(false);
      }),
    );
  }

  private checkMfa(userId: string): Observable<boolean> {
    const cached = getCachedAal(userId);
    if (cached === "aal2") return of(true);
    return from(
      this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ).pipe(
      map(({ data }) => {
        const level = data?.currentLevel ?? null;
        if (level) setCachedAal(userId, level);
        if (data?.currentLevel === "aal2") return true;
        if (data?.nextLevel === "aal2") {
          this.router.navigate(["/mfa-verify"]);
          return false;
        }
        // GDPR Fase 2.1: admin/super_admin MUST enroll MFA — redirect to security settings
        this.router.navigate(["/configuracion"], { fragment: "seguridad" });
        return false;
      }),
      catchError(() => of(true)),
    );
  }
}

@Injectable({
  providedIn: "root",
})
export class OwnerAdminGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(): Observable<boolean> | Promise<boolean> | boolean {
    return combineLatest([
      this.authService.userProfile$,
      this.authService.loading$,
    ]).pipe(
      filter(([_, loading]) => !loading),
      take(1),
      timeout(8000),
      switchMap(([profile]) => {
        const allowed =
          !!profile &&
          (profile.role === "owner" ||
            profile.role === "admin" ||
            profile.role === "member" ||
            profile.role === "super_admin" ||
            !!profile.is_super_admin);
        if (!allowed) {
          this.router.navigate(["/"]);
          return of(false);
        }
        const forceEnroll = profile.role !== 'member';
        return this.checkMfa(profile.auth_user_id || profile.id, forceEnroll);
      }),
      catchError(() => {
        this.router.navigate(["/"]);
        return of(false);
      }),
    );
  }

  private checkMfa(userId: string, forceEnrollment = false): Observable<boolean> {
    const cached = getCachedAal(userId);
    if (cached === "aal2") return of(true);
    return from(
      this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ).pipe(
      map(({ data }) => {
        const level = data?.currentLevel ?? null;
        if (level) setCachedAal(userId, level);
        if (data?.currentLevel === "aal2") return true;
        if (data?.nextLevel === "aal2") {
          this.router.navigate(["/mfa-verify"]);
          return false;
        }
        // GDPR Fase 2.1: owner/admin/super_admin MUST enroll MFA — redirect to security settings
        if (forceEnrollment) {
          this.router.navigate(["/configuracion"], { fragment: "seguridad" });
          return false;
        }
        return true;
      }),
      catchError(() => of(true)),
    );
  }
}
