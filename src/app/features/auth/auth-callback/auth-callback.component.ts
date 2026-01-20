import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8">
        <div class="text-center">
          <div class="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
            @if (loading) {
              <svg class="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            } @else if (error) {
              <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            } @else {
              <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
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
  `
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
    private toastService: ToastService
  ) { }

  async ngOnInit() {
    try {
      // PRIMERO: Verificar si el usuario ya está autenticado
      const { data: { session } } = await this.authService.client.auth.getSession();

      if (session && session.user) {
        console.log('[AUTH-CALLBACK] User already authenticated, redirecting...');
        this.loading = false;
        this.error = false;
        await this.redirectToMainApp();
        return;
      }

      // SEGUNDO: Procesar tokens de confirmación de email
      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
      const params = new URLSearchParams(fragment);
      const searchParams = new URLSearchParams(window.location.search);

      let accessToken = params.get('access_token') || searchParams.get('access_token');
      let refreshToken = params.get('refresh_token') || searchParams.get('refresh_token');
      const type = params.get('type') || searchParams.get('type');

      console.log('[AUTH-CALLBACK] rawHash=', rawHash);
      console.log('[AUTH-CALLBACK] fragment parsed=', fragment);
      console.log('[AUTH-CALLBACK] location.search=', window.location.search);
      console.log('[AUTH-CALLBACK] tokens presence:', { accessToken: !!accessToken, refreshToken: !!refreshToken, type });

      // Fallback para extraer tokens si están mal parseados
      if (!accessToken && fragment.includes('access_token=')) {
        const possible = fragment.split('&').find(p => p.startsWith('access_token='));
        if (possible) accessToken = possible.split('=')[1];
      }
      if (!refreshToken && fragment.includes('refresh_token=')) {
        const possible = fragment.split('&').find(p => p.startsWith('refresh_token='));
        if (possible) refreshToken = possible.split('=')[1];
      }
      console.log('[AUTH-CALLBACK] after fallback extraction:', { accessToken: !!accessToken, refreshToken: !!refreshToken });

      // Manejar errores específicos de Supabase
      const authError = params.get('error') || searchParams.get('error');
      const errorCode = params.get('error_code') || searchParams.get('error_code');
      const errorDescription = params.get('error_description') || searchParams.get('error_description');

      if (authError) {
        console.error('[AUTH-CALLBACK] Supabase error:', { authError, errorCode, errorDescription });
        this.handleAuthError(authError, errorCode, errorDescription);
        return;
      }

      // Si no hay tokens válidos, pero tampoco errores, puede ser una navegación directa
      if (!accessToken || !refreshToken) {
        console.log('[AUTH-CALLBACK] No se encontraron tokens de autenticación válidos. URL actual:', window.location.href);
        this.handleNoTokens();
        return;
      }

      // Establecer la sesión con los tokens
      const { error: sessionError } = await this.authService.client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (sessionError) {
        throw sessionError;
      }

      this.loading = false;
      await this.authService.refreshCurrentUser();
      this.toastService.success('¡Éxito!', 'Autenticación exitosa');

      // Redirigir al dashboard después de un breve delay
      setTimeout(() => {
        this.router.navigate(['/clientes']);
      }, 1500);

    } catch (error: any) {
      console.error('[AUTH-CALLBACK] Error en auth callback:', error);
      this.loading = false;
      this.error = true;
      this.errorMessage = 'Ocurrió un error durante la autenticación. Por favor, intenta nuevamente.';
    }
  }

  private async redirectToMainApp() {
    // Esperar un momento para que la UI se actualice
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.router.navigate(['/clientes']);
  }

  private handleAuthError(authError: string, errorCode: string | null, errorDescription: string | null) {
    if (authError === 'server_error' && errorCode === 'unexpected_failure') {
      // Error específico: usuario ya confirmado o problema interno
      this.loading = false;
      this.error = true;
      this.showAccountConfirmedHint = true;
      this.errorMessage = 'Error interno del servidor de autenticación. Tu cuenta puede estar ya confirmada. Intenta hacer login directamente.';

      // Ofrecer redirección automática al login después de mostrar el error
      setTimeout(() => {
        this.router.navigate(['/login'], {
          queryParams: {
            message: 'account_may_be_confirmed'
          }
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
    this.errorMessage = 'No se pudieron obtener los tokens de autenticación. Por favor, intenta nuevamente.';
  }

  redirectToLogin() {
    this.router.navigate(['/login']);
  }
}
