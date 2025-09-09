import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

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
            <div class="mt-4">
              <button
                (click)="redirectToLogin()"
                class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Volver al login
              </button>
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    try {
      // Obtener los fragments de la URL (access_token, refresh_token, etc.)
      const fragment = window.location.hash.substring(1);
      const params = new URLSearchParams(fragment);
      
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');
      
      console.log('Auth callback params:', { accessToken: !!accessToken, refreshToken: !!refreshToken, type });
      
      if (accessToken && refreshToken) {
        // Establecer la sesión con los tokens (usando el método de supabase directamente)
        const { error } = await this.authService['supabase'].auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        
        if (error) {
          throw error;
        }
        
        this.loading = false;
        this.toastService.success('¡Éxito!', 'Autenticación exitosa');
        
        // Redirigir al dashboard después de un breve delay
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1500);
        
      } else if (type === 'signup') {
        // Manejar confirmación de registro
        this.loading = false;
        this.toastService.success('¡Registro exitoso!', 'Ya puedes iniciar sesión');
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
        
      } else {
        // No hay tokens válidos
        console.error('No se encontraron tokens de autenticación válidos');
        this.loading = false;
        this.error = true;
        this.errorMessage = 'No se pudieron obtener los tokens de autenticación. Por favor, intenta nuevamente.';
      }
      
    } catch (error) {
      console.error('Error en auth callback:', error);
      this.loading = false;
      this.error = true;
      this.errorMessage = 'Ocurrió un error durante la autenticación. Por favor, intenta nuevamente.';
    }
  }

  redirectToLogin() {
    this.router.navigate(['/login']);
  }
}
