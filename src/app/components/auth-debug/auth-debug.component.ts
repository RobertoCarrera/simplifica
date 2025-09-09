import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-auth-debug',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h4>🔍 Debug: Prueba de Login Directo</h4>
            </div>
            <div class="card-body">
              <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
                <div class="mb-3">
                  <label class="form-label">Email:</label>
                  <input 
                    type="email" 
                    class="form-control" 
                    formControlName="email"
                    placeholder="robertocarreratech@gmail.com">
                </div>
                <div class="mb-3">
                  <label class="form-label">Contraseña:</label>
                  <input 
                    type="password" 
                    class="form-control" 
                    formControlName="password"
                    placeholder="Tu contraseña">
                </div>
                <button 
                  type="submit" 
                  class="btn btn-primary"
                  [disabled]="loading() || loginForm.invalid">
                  @if (loading()) {
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    Intentando login...
                  } @else {
                    🔐 Probar Login Directo
                  }
                </button>
              </form>

              @if (result()) {
                <div class="mt-4">
                  <h5>Resultado:</h5>
                  <pre class="bg-light p-3 rounded">{{ result() | json }}</pre>
                </div>
              }

              <hr class="my-4">
              
              <div class="row">
                <div class="col-md-6">
                  <button 
                    class="btn btn-info w-100"
                    (click)="checkSession()"
                    [disabled]="loading()">
                    📋 Verificar Sesión Actual
                  </button>
                </div>
                <div class="col-md-6">
                  <button 
                    class="btn btn-warning w-100"
                    (click)="resetPassword()"
                    [disabled]="loading() || !loginForm.get('email')?.value">
                    📧 Reset Password
                  </button>
                </div>
              </div>

              @if (sessionInfo()) {
                <div class="mt-4">
                  <h5>Información de Sesión:</h5>
                  <pre class="bg-light p-3 rounded">{{ sessionInfo() | json }}</pre>
                </div>
              }

              @if (resetResult()) {
                <div class="mt-4">
                  <h5>Resultado Reset Password:</h5>
                  <pre class="bg-light p-3 rounded">{{ resetResult() | json }}</pre>
                </div>
              }

              <div class="mt-4">
                <small class="text-muted">
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
