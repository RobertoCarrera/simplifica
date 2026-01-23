import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { Router } from '@angular/router';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-auth-debug',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-4xl mx-auto px-4 mt-12">
      <div class="flex justify-center">
        <div class="w-full md:w-2/3">
          <div class="bg-white rounded-lg shadow-lg overflow-hidden">
            <div class="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h4 class="text-lg font-medium text-gray-900 m-0">🔍 Debug: Prueba de Login Directo</h4>
            </div>
            <div class="p-6">
              <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Email:</label>
                  <input 
                    type="email" 
                    class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    formControlName="email"
                    placeholder="robertocarreratech@gmail.com">
                </div>
                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña:</label>
                  <input 
                    type="password" 
                    class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                    formControlName="password"
                    placeholder="Tu contraseña">
                </div>
                <button 
                  type="submit" 
                  class="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                  [disabled]="loading() || loginForm.invalid">
                  @if (loading()) {
                    <span class="animate-spin -ml-1 mr-2 h-4 w-4 text-white border-2 border-white border-t-transparent rounded-full"></span>
                    Intentando login...
                  } @else {
                    🔐 Probar Login Directo
                  }
                </button>
              </form>

              @if (result()) {
                <div class="mt-4">
                  <h5 class="text-sm font-medium text-gray-700 mb-2">Resultado:</h5>
                  <pre class="bg-gray-50 border border-gray-200 p-3 rounded-md text-xs overflow-auto">{{ result() | json }}</pre>
                </div>
              }

              <hr class="my-6 border-gray-200">
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="col-span-1">
                  <button 
                    class="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors text-white bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-500 w-full"
                    (click)="checkSession()"
                    [disabled]="loading()">
                    📋 Verificar Sesión Actual
                  </button>
                </div>
                <div class="col-span-1">
                  <button 
                    class="inline-flex justify-center items-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors text-white bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 w-full"
                    (click)="resetPassword()"
                    [disabled]="loading() || !loginForm.get('email')?.value">
                    📧 Reset Password
                  </button>
                </div>
              </div>

              @if (sessionInfo()) {
                <div class="mt-4">
                  <h5 class="text-sm font-medium text-gray-700 mb-2">Información de Sesión:</h5>
                  <pre class="bg-gray-50 border border-gray-200 p-3 rounded-md text-xs overflow-auto">{{ sessionInfo() | json }}</pre>
                </div>
              }

              @if (resetResult()) {
                <div class="mt-4">
                  <h5 class="text-sm font-medium text-gray-700 mb-2">Resultado Reset Password:</h5>
                  <pre class="bg-gray-50 border border-gray-200 p-3 rounded-md text-xs overflow-auto">{{ resetResult() | json }}</pre>
                </div>
              }

              <div class="mt-4">
                <small class="text-gray-500">
                  <strong>Instrucciones:</strong><br>
                  1. Usa las credenciales del registro fallido<br>
                  2. Si login falla, prueba reset password<br>
                  3. Si reset funciona, el enlace debería confirmarte y permitir cambiar contraseña<br>
                  4. Luego podrás hacer login normal
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AuthDebugComponent {
  loginForm;

  loading = signal(false);
  result = signal<any>(null);
  sessionInfo = signal<any>(null);
  resetResult = signal<any>(null);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private toast: ToastService
  ) {
    this.loginForm = this.fb.group({
      email: ['robertocarreratech@gmail.com', [Validators.required, Validators.email]],
      password: ['M3X9ClsZkxr4kAoHm_RGK_4ANq&A', [Validators.required]]
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading.set(true);
    this.result.set(null);

    const { email, password } = this.loginForm.value;

    try {
      console.log('[AUTH-DEBUG] Attempting direct login...', { email });
      const result = await this.auth.login({ email: email!, password: password! });

      this.result.set({
        timestamp: new Date().toISOString(),
        success: result.success,
        error: result.error,
        rawResult: result
      });

      if (result.success) {
        this.toast.success('¡Login exitoso!', 'Redirigiendo...');
        setTimeout(() => {
          window.location.href = '/clientes';
        }, 2000);
      } else {
        this.toast.error(result.error || 'Error en login', 'Error');
      }
    } catch (error: any) {
      console.error('[AUTH-DEBUG] Login error:', error);
      this.result.set({
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        rawError: error
      });
    } finally {
      this.loading.set(false);
    }
  }

  async checkSession() {
    this.loading.set(true);
    try {
      const { data: { session }, error } = await this.auth.client.auth.getSession();

      this.sessionInfo.set({
        timestamp: new Date().toISOString(),
        hasSession: !!session,
        user: session?.user ? {
          id: session.user.id,
          email: session.user.email,
          email_confirmed_at: session.user.email_confirmed_at,
          phone_confirmed_at: session.user.phone_confirmed_at,
          confirmed_at: session.user.confirmed_at,
          last_sign_in_at: session.user.last_sign_in_at,
          created_at: session.user.created_at
        } : null,
        error: error?.message
      });

      if (session) {
        this.toast.success('Sesión activa encontrada', 'Info');
      } else {
        this.toast.info('No hay sesión activa', 'Info');
      }
    } catch (error: any) {
      this.sessionInfo.set({
        timestamp: new Date().toISOString(),
        error: error.message
      });
    } finally {
      this.loading.set(false);
    }
  }

  async resetPassword() {
    const email = this.loginForm.get('email')?.value;
    if (!email) return;

    this.loading.set(true);
    this.resetResult.set(null);

    try {
      const result = await this.auth.resetPassword(email);

      this.resetResult.set({
        timestamp: new Date().toISOString(),
        success: result.success,
        error: result.error,
        email: email
      });

      if (result.success) {
        this.toast.success('Email de reset enviado', 'Revisa tu bandeja de entrada');
      } else {
        this.toast.error(result.error || 'Error enviando reset', 'Error');
      }
    } catch (error: any) {
      this.resetResult.set({
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });
    } finally {
      this.loading.set(false);
    }
  }
}
