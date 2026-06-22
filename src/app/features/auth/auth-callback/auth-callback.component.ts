import { Component, OnInit } from "@angular/core";

import { ActivatedRoute, Router } from "@angular/router";
import { AuthService } from "../../../services/auth.service";
import { ToastService } from "../../../services/toast.service";

@Component({
  selector: "app-auth-callback",
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8">
        <div class="text-center">
          <div
            class="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100"
          >
            @if (loading) {
              <svg
                class="animate-spin h-6 w-6 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            } @else if (error) {
              <svg
                class="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            } @else {
              <svg
                class="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            }
          </div>

          <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
            @if (loading) {
              Procesando autenticación...
            } @else if (error) {
              Error de autenticación
            } @else {
              ¡Autenticación exitosa!
            }
          </h2>

          <p class="mt-2 text-center text-sm text-gray-600">
            @if (loading) {
              Por favor espera mientras procesamos tu solicitud
            } @else if (error) {
              {{ errorMessage }}
            } @else {
              Redirigiendo al dashboard...
            }
          </p>

          @if (error) {
            <div class="mt-4 space-y-2">
              <button
                (click)="redirectToLogin()"
                class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Volver al login
              </button>
              @if (showAccountConfirmedHint) {
                <div class="text-xs text-gray-500 text-center">
                  Tu cuenta puede estar ya confirmada. Prueba hacer login
                  directamente.
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class AuthCallbackComponent implements OnInit {
  loading = true;
  error = false;
  errorMessage = "";
  showAccountConfirmedHint = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private toastService: ToastService,
  ) {}

  async ngOnInit() {
    try {
      const {
        data: { session },
      } = await this.authService.client.auth.getSession();

      if (session && session.user) {
        console.log(
          "[AUTH-CALLBACK] User already authenticated, redirecting...",
        );
        this.loading = false;
        this.error = false;
        await this.redirectToMainApp();
        return;
      }

      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith("#") ? rawHash.substring(1) : rawHash;
      const params = new URLSearchParams(fragment);
      const searchParams = new URLSearchParams(window.location.search);

      let accessToken =
        params.get("access_token") || searchParams.get("access_token");
      let refreshToken =
        params.get("refresh_token") || searchParams.get("refresh_token");
      const rawType = params.get("type") || searchParams.get("type");
      const ALLOWED_CALLBACK_TYPES = [
        "invite",
        "recovery",
        "signup",
        "magiclink",
        "email",
      ];
      const type =
        rawType && ALLOWED_CALLBACK_TYPES.includes(rawType) ? rawType : null;

      if (!accessToken && fragment.includes("access_token=")) {
        const possible = fragment
          .split("&")
          .find((p) => p.startsWith("access_token="));
        if (possible) accessToken = possible.split("=")[1];
      }
      if (!refreshToken && fragment.includes("refresh_token=")) {
        const possible = fragment
          .split("&")
          .find((p) => p.startsWith("refresh_token="));
        if (possible) refreshToken = possible.split("=")[1];
      }

      const authError = params.get("error") || searchParams.get("error");
      const errorCode =
        params.get("error_code") || searchParams.get("error_code");
      const errorDescription =
        params.get("error_description") ||
        searchParams.get("error_description");

      if (authError) {
        console.error("[AUTH-CALLBACK] Supabase auth error:", {
          authError,
          errorCode,
        });
        this.handleAuthError(authError, errorCode, errorDescription);
        return;
      }

      if (!accessToken || !refreshToken) {
        console.log("[AUTH-CALLBACK] No valid auth tokens found");
        this.handleNoTokens();
        return;
      }

      // C-5: PKCE-style state validation BEFORE setSession().
      // Without this check, an attacker can craft a URL with their own
      // access/refresh tokens and trick a victim into visiting it
      // (phishing, XSS in another tab). The victim would end up "logged in
      // as the attacker" and any data they create would persist under the
      // attacker's company. We require a state param that matches a nonce
      // stored in sessionStorage by the originating auth flow (magic link /
      // signup confirmation / etc.).
      //
      // State is only validated for flows WE initiate from this app
      // (magiclink + signup/email). Invite and recovery flows use Supabase's
      // own redirect scheme and don't include our custom state — those have
      // separate guards/routes and are not the attack vector described in the
      // audit (C-5).
      const stateFromUrl =
        searchParams.get('state') || params.get('state');
      let stateResult: boolean | null = null;
      if (type === 'magiclink') {
        stateResult = this.authService.consumeAuthFlowState(
          stateFromUrl,
          'magic_link',
        );
      } else if (type === 'signup' || type === 'email') {
        stateResult = this.authService.consumeAuthFlowState(
          stateFromUrl,
          'email_confirm',
        );
      }
      if (stateResult === false) {
        // State mismatch / missing — possible session-fixation attack.
        // REJECT: do NOT call setSession(), redirect to login with warning.
        console.error(
          '[AUTH-CALLBACK] 🚨 State validation FAILED — rejecting auth callback to prevent session fixation.',
        );
        this.error = true;
        this.errorMessage =
          'Enlace de autenticación inválido o expirado. Por favor, solicita un nuevo enlace iniciando sesión de nuevo.';
        this.loading = false;
        // Clear any partial state Supabase might have set
        try {
          await this.authService.client.auth.signOut();
        } catch { /* ignore */ }
        setTimeout(() => {
          this.router.navigate(['/login'], {
            queryParams: { reason: 'invalid_state' },
          });
        }, 1500);
        return;
      }
      // stateResult === null means no state in URL or flow type that
      // doesn't use state (invite/recovery). Allow through (legacy compat)
      // but log so we can monitor in production.
      if (stateResult === null && (type === 'magiclink' || type === 'signup' || type === 'email')) {
        console.warn(
          '[AUTH-CALLBACK] No state param in URL for', type,
          '— proceeding in degraded mode (legacy flow).',
        );
      }

      const { error: sessionError } =
        await this.authService.client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

      if (sessionError) {
        throw sessionError;
      }

      // FIX: Explicitly ensure the profile is loaded before navigating.
      // setSession() updates the JWT in the client, but onAuthStateChange
      // may fire asynchronously (macrotask). If we navigate before it
      // completes, StaffGuard sees a null profile and redirects to
      // /complete-profile. This explicit wait guarantees the profile is
      // hydrated before we leave the callback.
      const { data: { session: currentSession } } = await this.authService.client.auth.getSession();
      if (currentSession) {
        const profileBefore = this.authService.userProfileSignal();
        console.log('[AUTH-CALLBACK] Profile before waitForProfile:', profileBefore?.role, profileBefore?.email, 'isSuperAdmin:', profileBefore?.is_super_admin);
        await this.authService.waitForProfile(6000);
        const profileAfter = this.authService.userProfileSignal();
        console.log('[AUTH-CALLBACK] Profile after waitForProfile:', profileAfter?.role, profileAfter?.email, 'isSuperAdmin:', profileAfter?.is_super_admin, 'active:', profileAfter?.active);
        // Also log the userProfileSubject value directly
        let profileFromSubject: any = null;
        this.authService.userProfile$.subscribe(p => { profileFromSubject = p; console.log('[AUTH-CALLBACK] userProfile$ emitted:', p?.role, p?.email); }).unsubscribe();
        console.log('[AUTH-CALLBACK] userProfile$ current value:', profileFromSubject?.role);

        // Rafter v0.31: MFA enforced for super_admin at login.
        // Previously super_admin had an EMERGENCY BYPASS here that sent them
        // straight to /inicio before the AAL check ran. Removed to fix the
        // privilege escalation window: a stolen session cookie would give full
        // super_admin access without proving MFA. The AAL check at the bottom
        // of ngOnInit (mfa.getAuthenticatorAssuranceLevel) now runs for
        // super_admin too — if TOTP enrolled but not verified this session,
        // they get bounced to /mfa-verify.
        //
        // (commit 8a24b457)

        // If profile is STILL null after 6s, go to /complete-profile (safe fallback)
        if (!profileAfter) {
          console.warn('[AUTH-CALLBACK] Profile null after 6s — redirecting to /complete-profile');
          this.router.navigate(['/complete-profile']);
          return;
        }
      }

      if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }

      this.loading = false;
      this.toastService.success("¡Éxito!", "Autenticación exitosa");

      if (type === "recovery") {
        console.log(
          "[AUTH-CALLBACK] Recovery detected, redirecting to password setup...",
        );
        this.router.navigate(["/reset-password"]);
      } else if (type === "invite") {
        console.log(
          "[AUTH-CALLBACK] Invite detected, navigating to invite acceptance page...",
        );
        const { data: { user: invitedUser } } = await this.authService.client.auth.getUser();
        const inviteToken = invitedUser?.user_metadata?.['company_invite_token'];
        if (inviteToken) {
          this.router.navigate(['/invite'], { queryParams: { token: inviteToken } });
        } else {
          console.warn("[AUTH-CALLBACK] Invite type but no company_invite_token in user metadata");
          this.router.navigate(['/inicio']);
        }
      } else {
        // Check if user has TOTP enrolled but not yet challenged (AAL step-up required)
        const { data: aalData } = await this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData?.nextLevel === "aal2" && aalData?.currentLevel !== "aal2") {
          const returnTo = sessionStorage.getItem('auth_return_to') || "/inicio";
          sessionStorage.removeItem('auth_return_to');
          console.log("[AUTH-CALLBACK] MFA step-up required, redirecting to mfa-verify");
          this.router.navigate(["/mfa-verify"], { state: { returnTo } });
        } else {
          const returnTo = sessionStorage.getItem('auth_return_to');
          if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
            sessionStorage.removeItem('auth_return_to');
            this.router.navigateByUrl(returnTo);
          } else {
            // FIX: Wait for profile to be loaded before navigating to /inicio.
            // This prevents StaffGuard from seeing a null profile and redirecting
            // the user to /complete-profile (race condition between setSession and
            // the async profile fetch in initializeUsingExistingSession).
            await this.authService.waitForProfile();
            this.router.navigate(["/inicio"]);
          }
        }
      }
    } catch (error: any) {
      console.error("[AUTH-CALLBACK] Error en auth callback:", error);
      this.loading = false;
      this.error = true;
      this.errorMessage =
        "Ocurrió un error durante la autenticación. Por favor, intenta nuevamente.";
    }
  }

  private async redirectToMainApp() {
    // Wait for the profile to be loaded before navigating.
    // On a fresh login the profile is cached, but if it was cleared or this is
    // a new device, wait up to 10s for the async profile fetch to complete.
    await this.authService.waitForProfile();
    // Rafter v0.31: MFA enforced for super_admin at login.
    // Previously this "already authenticated" branch (ngOnInit line 130-138)
    // called redirectToMainApp() with NO AAL check, so a super_admin with an
    // existing session resumed from cache would skip MFA entirely. Now we run
    // the same AAL step-up check the post-setSession branch does, so a
    // super_admin returning to the app on a fresh login must prove TOTP.
    //
    // (commit 8a24b457)
    const { data: aalData } =
      await this.authService.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.nextLevel === "aal2" && aalData?.currentLevel !== "aal2") {
      const returnTo = sessionStorage.getItem("auth_return_to") || "/inicio";
      sessionStorage.removeItem("auth_return_to");
      console.log(
        "[AUTH-CALLBACK] MFA step-up required (already-authenticated branch), redirecting to mfa-verify",
      );
      this.router.navigate(["/mfa-verify"], { state: { returnTo } });
      return;
    }
    this.router.navigate(["/inicio"]);
  }

  private handleAuthError(
    authError: string,
    errorCode: string | null,
    errorDescription: string | null,
  ) {
    if (authError === "server_error" && errorCode === "unexpected_failure") {
      this.loading = false;
      this.error = true;
      this.showAccountConfirmedHint = true;
      this.errorMessage =
        "Error interno del servidor de autenticación. Tu cuenta puede estar ya confirmada. Intenta hacer login directamente.";

      setTimeout(() => {
        this.router.navigate(["/login"], {
          queryParams: {
            message: "account_may_be_confirmed",
          },
        });
      }, 5000);
    } else {
      this.loading = false;
      this.error = true;
      this.errorMessage = `Error de autenticación: ${decodeURIComponent(errorDescription || authError)}`;
    }
  }

  private handleNoTokens() {
    this.loading = false;
    this.error = true;
    this.errorMessage =
      "No se pudieron obtener los tokens de autenticación. Por favor, intenta nuevamente.";
  }

  redirectToLogin() {
    this.router.navigate(["/login"]);
  }
}
