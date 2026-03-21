import { Component, OnInit } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8">
        <div class="text-center">
          <div class="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
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
                  Tu cuenta puede estar ya confirmada. Prueba hacer login directamente.
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
  errorMessage = '';
  showAccountConfirmedHint = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private toastService: ToastService,
  ) {}

  async ngOnInit() {
    try {
      // PRIMERO: Verificar si el usuario ya está autenticado (e.g. page reload,
      // or navigating here after already being signed in).
      const {
        data: { session },
      } = await this.authService.client.auth.getSession();

      if (session && session.user) {
        console.log('[AUTH-CALLBACK] User already authenticated, redirecting...');
        this.loading = false;
        this.error = false;
        await this.redirectToMainApp();
        return;
      }

      // SEGUNDO: Procesar tokens del hash/query (magic link, invite, etc.)
      // With detectSessionInUrl: false, GoTrueClient does NOT auto-process URL
      // tokens during _initialize(). We are the SOLE handler.
      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
      const params = new URLSearchParams(fragment);
      const searchParams = new URLSearchParams(window.location.search);

      let accessToken = params.get('access_token') || searchParams.get('access_token');
      let refreshToken = params.get('refresh_token') || searchParams.get('refresh_token');
      const rawType = params.get('type') || searchParams.get('type');
      // Allowlist valid callback types to prevent open-redirect via manipulated 'type' param
      const ALLOWED_CALLBACK_TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email'];
      const type = rawType && ALLOWED_CALLBACK_TYPES.includes(rawType) ? rawType : null;

      // Fallback para extraer tokens si están mal parseados
      if (!accessToken && fragment.includes('access_token=')) {
        const possible = fragment.split('&').find((p) => p.startsWith('access_token='));
        if (possible) accessToken = possible.split('=')[1];
      }
      if (!refreshToken && fragment.includes('refresh_token=')) {
        const possible = fragment.split('&').find((p) => p.startsWith('refresh_token='));
        if (possible) refreshToken = possible.split('=')[1];
      }

      // Manejar errores específicos de Supabase
      const authError = params.get('error') || searchParams.get('error');
      const errorCode = params.get('error_code') || searchParams.get('error_code');
      const errorDescription =
        params.get('error_description') || searchParams.get('error_description');

      if (authError) {
        console.error('[AUTH-CALLBACK] Supabase auth error:', {
          authError,
          errorCode,
        });
        this.handleAuthError(authError, errorCode, errorDescription);
        return;
      }

      // Si no hay tokens válidos, pero tampoco errores, puede ser una navegación directa
      if (!accessToken || !refreshToken) {
        console.log(
          '[AUTH-CALLBACK] No valid auth tokens found',
        );
        this.handleNoTokens();
        return;
      }

      // Establecer la sesión con los tokens.
      // setSession() internally calls _getUser(), saves the session, and fires
      // SIGNED_IN which triggers handleAuthStateChange → setCurrentUser().
      // Because _notifyAllSubscribers is awaited inside _setSession, by the time
      // setSession() resolves the user profile is already loaded — no need to call
      // refreshCurrentUser() again.
      const { error: sessionError } = await this.authService.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        throw sessionError;
      }

      // Clean the hash to prevent re-processing on page reload
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      this.loading = false;
      this.toastService.success('¡Éxito!', 'Autenticación exitosa');

      // Redirigir según el tipo de acción
      if (type === 'invite' || type === 'recovery') {
        console.log('[AUTH-CALLBACK] Invite/Recovery detected, redirecting to password setup...');
        this.router.navigate(['/reset-password']);
      } else {
        this.router.navigate(['/clientes']);
      }
    } catch (error: any) {
      console.error('[AUTH-CALLBACK] Error en auth callback:', error);
      this.loading = false;
      this.error = true;
      this.errorMessage =
        'Ocurrió un error durante la autenticación. Por favor, intenta nuevamente.';
    }
  }

  private async redirectToMainApp() {
    // Esperar un momento para que la UI se actualice
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.router.navigate(['/clientes']);
  }

  private handleAuthError(
    authError: string,
    errorCode: string | null,
    errorDescription: string | null,
  ) {
    if (authError === 'server_error' && errorCode === 'unexpected_failure') {
      // Error específico: usuario ya confirmado o problema interno
      this.loading = false;
      this.error = true;
      this.showAccountConfirmedHint = true;
      this.errorMessage =
        'Error interno del servidor de autenticación. Tu cuenta puede estar ya confirmada. Intenta hacer login directamente.';

      // Ofrecer redirección automática al login después de mostrar el error
      setTimeout(() => {
        this.router.navigate(['/login'], {
          queryParams: {
            message: 'account_may_be_confirmed',
          },
        });
      }, 5000);
    } else {
      // Otros errores de Supabase
      this.loading = false;
      this.error = true;
      this.errorMessage = `Error de autenticación: ${decodeURIComponent(errorDescription || authError)}`;
    }
  }

  private handleNoTokens() {
    this.loading = false;
    this.error = true;
    this.errorMessage =
      'No se pudieron obtener los tokens de autenticación. Por favor, intenta nuevamente.';
  }

  redirectToLogin() {
    this.router.navigate(['/login']);
  }
}
