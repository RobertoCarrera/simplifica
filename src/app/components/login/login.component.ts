import { Component, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService, LoginCredentials } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="login-shell">
      <div class="brand-side d-none d-lg-flex flex-column text-white">
        <div class="brand-content">
          <div class="brand-top">
            <div class="logo-circle"><i class="bi bi-gear-fill"></i></div>
            <h1>Simplifica</h1>
            <p class="subtitle">Gestión moderna de clientes, tickets y servicios</p>
          </div>
          <ul class="feature-list">
            <li><i class="bi bi-check2-circle"></i> Multi‑empresa</li>
            <li><i class="bi bi-check2-circle"></i> Flujo de trabajo claro</li>
            <li><i class="bi bi-check2-circle"></i> Seguridad y RLS</li>
            <li><i class="bi bi-check2-circle"></i> Escalable desde el día 1</li>
          </ul>
          <div class="footer-note">© {{ currentYear }} Simplifica</div>
        </div>
      </div>

      <div class="form-side d-flex flex-column justify-content-center">
        <div class="form-wrapper mx-auto w-100">
          <div class="mobile-header text-center d-lg-none">
            <div class="logo-circle small"><i class="bi bi-gear-fill"></i></div>
            <h2>Simplifica</h2>
            <p class="subtitle">Inicia sesión en tu cuenta</p>
          </div>
          <h3 class="form-title">Accede a tu panel</h3>
          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" novalidate>
            <div class="mb-3">
              <label class="form-label">Email</label>
              <div class="input-wrapper" [class.invalid]="emailInvalid()">
                <i class="bi bi-at"></i>
                <input type="email" placeholder="tu@empresa.com" formControlName="email" (blur)="loginForm.get('email')?.markAsTouched()" />
              </div>
              @if (emailInvalid()) { <div class="field-error">Email válido requerido</div> }
            </div>
            <div class="mb-2">
              <label class="form-label d-flex justify-content-between align-items-center">
                <span>Contraseña</span>
                <a href="#" (click)="$event.preventDefault(); showForgotPassword = true" class="link-forgot">¿Olvidaste?</a>
              </label>
              <div class="input-wrapper" [class.invalid]="passwordInvalid()">
                <i class="bi bi-lock"></i>
                <input [type]="showPassword() ? 'text':'password'" placeholder="••••••••" formControlName="password" (blur)="loginForm.get('password')?.markAsTouched()" />
                <button type="button" class="toggle-pass" (click)="togglePassword()" [attr.aria-label]="showPassword() ? 'Ocultar contraseña':'Mostrar contraseña'">
                  <i class="bi" [class.bi-eye]="!showPassword()" [class.bi-eye-slash]="showPassword()"></i>
                </button>
              </div>
              @if (passwordInvalid()) { <div class="field-error">Contraseña requerida</div> }
            </div>
            @if (errorMessage()) {
              <div class="alert-error mb-3"><i class="bi bi-exclamation-triangle me-1"></i>{{ errorMessage() }}</div>
            }
            <button class="btn-primary w-100 mb-3" type="submit" [disabled]="loginForm.invalid || loading()">
              @if (loading()) { <span class="spinner-border spinner-border-sm me-2"></span> Entrando... } @else { Iniciar Sesión }
            </button>
            <div class="text-center small text-muted">¿No tienes cuenta? <a routerLink="/register">Crear una gratis</a></div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal de recuperación de contraseña -->
    @if (showForgotPassword) {
      <div class="modal d-block" style="background: rgba(0,0,0,0.5);" (click)="showForgotPassword = false">
        <div class="modal-dialog modal-dialog-centered" (click)="$event.stopPropagation()">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Recuperar Contraseña</h5>
              <button type="button" class="btn-close" (click)="showForgotPassword = false"></button>
            </div>
            
            <form [formGroup]="resetForm" (ngSubmit)="onResetPassword()">
              <div class="modal-body">
                <div class="mb-3">
                  <label class="form-label">Email</label>
                  <input
                    type="email"
                    class="form-control"
                    formControlName="email"
                    placeholder="tu@empresa.com"
                  />
                </div>
              </div>
              
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="showForgotPassword = false">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="resetForm.invalid || resetting()">
                  @if (resetting()) {
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    Enviando...
                  } @else {
                    Enviar
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: 100vh; width: 100vw; overflow: hidden; }
    .login-shell { height: 100vh; width: 100%; display: flex; background: #f1f5f9; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    
    /* Brand Panel */
    .brand-side { 
      flex: 1.2; 
      background: linear-gradient(145deg, #1e40af 0%, #1e3a8a 40%, #1e40af 100%); 
      position: relative; 
      overflow: hidden;
      padding: 3rem 2.5rem;
    }
    .brand-side::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -30%;
      width: 100%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%);
      pointer-events: none;
    }
    .brand-content { 
      height: 100%; 
      display: flex; 
      flex-direction: column; 
      justify-content: space-between; 
      position: relative; 
      z-index: 1; 
    }
    .brand-top { margin-bottom: 2rem; }
    .logo-circle { 
      width: 64px; 
      height: 64px; 
      border-radius: 16px; 
      background: rgba(255,255,255,0.15); 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-size: 1.75rem; 
      backdrop-filter: blur(8px); 
      margin-bottom: 1.5rem;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .logo-circle.small { 
      width: 48px; 
      height: 48px; 
      font-size: 1.4rem; 
      margin-bottom: 1rem;
      margin-left: auto;
      margin-right: auto;
    }
    .brand-side h1 { 
      font-size: 2.5rem; 
      font-weight: 700; 
      letter-spacing: -0.02em; 
      margin-bottom: 0.75rem; 
      color: white;
    }
    .subtitle { 
      font-size: 1.05rem; 
      opacity: 0.9; 
      line-height: 1.4; 
      color: rgba(255,255,255,0.9);
      margin: 0;
    }
    .feature-list { 
      list-style: none; 
      padding: 0; 
      margin: 0; 
      flex: 1; 
      display: flex; 
      flex-direction: column; 
      justify-content: center; 
      gap: 1rem;
    }
    .feature-list li { 
      display: flex; 
      align-items: center; 
      gap: 0.75rem; 
      font-size: 0.95rem; 
      opacity: 0.95; 
      color: white;
    }
    .feature-list i { color: #10b981; font-size: 1.1rem; }
    .footer-note { 
      font-size: 0.8rem; 
      opacity: 0.7; 
      text-align: center; 
      color: rgba(255,255,255,0.7);
      margin-top: 1rem;
    }
    
    /* Form Panel */
    .form-side { 
      flex: 1; 
      background: #ffffff; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      padding: 2rem 1.5rem;
      overflow-y: auto;
    }
    .form-wrapper { 
      width: 100%; 
      max-width: 400px; 
      padding: 2.5rem 2rem 2rem;
      background: white;
      border-radius: 24px;
      box-shadow: 0 10px 40px -12px rgba(0,0,0,0.15), 0 4px 16px -8px rgba(0,0,0,0.1);
      border: 1px solid rgba(0,0,0,0.05);
    }
    .mobile-header { margin-bottom: 2rem; }
    .mobile-header h2 { 
      font-size: 1.75rem; 
      font-weight: 700; 
      margin: 0.75rem 0 0.5rem; 
      color: #1e293b;
    }
    .mobile-header .subtitle { 
      color: #64748b; 
      font-size: 0.9rem; 
      margin: 0;
    }
    .form-title { 
      font-size: 1.5rem; 
      font-weight: 600; 
      color: #1e293b; 
      margin-bottom: 1.75rem;
    }
    
    /* Form Elements */
    .form-label { 
      font-weight: 600; 
      font-size: 0.8rem; 
      text-transform: uppercase; 
      letter-spacing: 0.5px; 
      color: #64748b; 
      margin-bottom: 0.5rem; 
      display: block;
    }
    .input-wrapper { 
      position: relative; 
      display: flex; 
      align-items: center; 
      background: #fff; 
      border: 2px solid #e2e8f0; 
      border-radius: 12px; 
      padding: 0.875rem 1rem; 
      gap: 0.75rem; 
      transition: all 0.2s ease;
      margin-bottom: 0.5rem;
    }
    .input-wrapper.invalid { border-color: #ef4444; background: #fef2f2; }
    .input-wrapper:focus-within { 
      border-color: #3b82f6; 
      background: #f8fafc;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); 
    }
    .input-wrapper i { font-size: 1.1rem; color: #94a3b8; flex-shrink: 0; }
    .input-wrapper input { 
      flex: 1; 
      border: none; 
      outline: none; 
      background: transparent; 
      font-size: 1rem; 
      font-weight: 500; 
      color: #1e293b;
    }
    .input-wrapper input::placeholder { color: #94a3b8; font-weight: 400; }
    .toggle-pass { 
      background: transparent; 
      border: none; 
      color: #94a3b8; 
      cursor: pointer; 
      padding: 0.25rem; 
      display: flex; 
      align-items: center; 
      border-radius: 6px;
      transition: color 0.2s ease;
    }
    .toggle-pass:hover { color: #3b82f6; }
    .field-error { 
      font-size: 0.75rem; 
      color: #ef4444; 
      margin-top: 0.25rem; 
      font-weight: 500; 
    }
    .alert-error { 
      background: #fef2f2; 
      color: #dc2626; 
      border: 1px solid #fecaca; 
      padding: 0.75rem; 
      border-radius: 12px; 
      font-size: 0.85rem; 
      display: flex; 
      align-items: center; 
      gap: 0.5rem;
    }
    .btn-primary { 
      width: 100%;
      border: none; 
      border-radius: 12px; 
      padding: 1rem; 
      font-weight: 600; 
      font-size: 1rem; 
      background: linear-gradient(145deg, #3b82f6, #2563eb); 
      color: white; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      gap: 0.5rem; 
      cursor: pointer; 
      transition: all 0.2s ease;
      margin-bottom: 1rem;
    }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-primary:not(:disabled):hover { 
      transform: translateY(-1px); 
      box-shadow: 0 8px 25px -8px rgba(59, 130, 246, 0.4); 
    }
    .link-forgot { 
      font-size: 0.75rem; 
      font-weight: 600; 
      color: #3b82f6; 
      text-decoration: none; 
    }
    .link-forgot:hover { text-decoration: underline; }
    .small { font-size: 0.85rem; color: #64748b; }
    .small a { color: #3b82f6; text-decoration: none; font-weight: 600; }
    .small a:hover { text-decoration: underline; }
    
    /* PWA & Mobile Optimizations */
    @media (max-width: 991px) { 
      .login-shell { flex-direction: column; }
      .brand-side { display: none !important; }
      .form-side { 
        flex: 1; 
        padding: 1.5rem 1rem; 
        background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
      }
      .form-wrapper { 
        padding: 2rem 1.5rem; 
        border-radius: 20px; 
        max-width: 360px;
        margin-top: 1rem;
        margin-bottom: 1rem;
      }
    }
    @media (max-width: 480px) {
      .form-side { padding: 1rem 0.75rem; }
      .form-wrapper { 
        padding: 1.75rem 1.25rem; 
        border-radius: 16px; 
        box-shadow: 0 4px 20px -8px rgba(0,0,0,0.15);
      }
      .form-title { font-size: 1.25rem; }
      .mobile-header h2 { font-size: 1.5rem; }
    }
    
    /* PWA Enhancements */
    @media (display-mode: standalone) {
      :host { padding-top: env(safe-area-inset-top); }
      .form-side { padding-top: calc(1.5rem + env(safe-area-inset-top)); }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { 
        animation-duration: 0.01ms !important; 
        transition-duration: 0.01ms !important; 
      }
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .form-side { background: #0f172a; }
      .form-wrapper { 
        background: #1e293b; 
        border-color: #334155;
        box-shadow: 0 10px 40px -12px rgba(0,0,0,0.4);
      }
      .form-title, .mobile-header h2 { color: #f1f5f9; }
      .form-label { color: #94a3b8; }
      .input-wrapper { 
        background: #334155; 
        border-color: #475569; 
      }
      .input-wrapper:focus-within { 
        background: #374151; 
        border-color: #60a5fa; 
      }
      .input-wrapper input { color: #f1f5f9; }
      .small { color: #94a3b8; }
      .alert-error { 
        background: #450a0a; 
        color: #fca5a5; 
        border-color: #7f1d1d; 
      }
    }
    
    /* Loading animation */
    .form-wrapper { 
      animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); 
    }
    @keyframes slideIn { 
      0% { 
        transform: translateY(20px) scale(0.98); 
        opacity: 0; 
      } 
      100% { 
        transform: translateY(0) scale(1); 
        opacity: 1; 
      } 
    }
  `]
})
export class LoginComponent implements OnDestroy, OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);

  // Signals
  loading = signal(false);
  resetting = signal(false);
  errorMessage = signal('');
  showForgotPassword = false;
  showPassword = signal(false);
  currentYear = new Date().getFullYear();

  constructor() {
    // Agregar clase al body para evitar scroll en login
    document.body.classList.add('auth-page');
  }

  ngOnInit() {
    // Manejar mensajes del callback de auth (cuenta confirmada, etc.)
    this.route.queryParams.subscribe(params => {
      if (params['message'] === 'account_may_be_confirmed') {
        this.toastService.info('Tu cuenta puede estar ya confirmada', 'Intenta hacer login');
        if (params['email']) {
          this.loginForm.patchValue({ email: params['email'] });
        }
      }
      
      // Mensaje de éxito al crear contraseña desde invitación
      if (params['message'] && params['message'].includes('Contraseña creada')) {
        this.toastService.success(params['message'], 'Bienvenido');
        if (params['email']) {
          this.loginForm.patchValue({ email: params['email'] });
        }
      }
    });
    // If the guard navigated here with navigation state, capture the intended return path
    // history.state is populated by Angular router when using `router.navigate(..., { state })`.
    const navState: any = history.state || {};
    if (navState && navState.returnTo) {
      // Store it on the component (non-reactive) for use after login
      (this as any)._returnTo = navState.returnTo;
    } else {
      // Backwards compatibility: if an older flow used ?returnUrl=... keep it until we've consumed it
      const qp = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
      if (qp) {
        (this as any)._returnTo = qp;
      }
    }
  }

  ngOnDestroy() {
    // Remover clase del body al salir
    document.body.classList.remove('auth-page');
  }

  // Forms
  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  resetForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  // Computed properties para validación
  emailInvalid = () => {
    const control = this.loginForm.get('email');
    return control?.invalid && control?.touched;
  };

  passwordInvalid = () => {
    const control = this.loginForm.get('password');
    return control?.invalid && control?.touched;
  };

  togglePassword() { this.showPassword.update(v => !v); }

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading.set(true);
    this.errorMessage.set('');

    const credentials: LoginCredentials = {
      email: this.loginForm.value.email!,
      password: this.loginForm.value.password!
    };

    console.log('🔐 Starting login process for:', credentials.email);

    try {
      const result = await this.authService.login(credentials);

      if (result.success) {
        console.log('✅ Login successful');
        // Navigate to the intended return path when present (clean, not via query param)
        const returnTo = (this as any)._returnTo as string | undefined;
        try {
          if (returnTo) {
            // Normalize simple relative paths and avoid double-encoding
            const normalized = decodeURIComponent(returnTo).startsWith('/') ? decodeURIComponent(returnTo) : `/${decodeURIComponent(returnTo)}`;
            // Replace the current history entry to clear any legacy query params from the URL
            // This keeps the URL clean (no ?returnUrl=... lingering)
            history.replaceState({}, '', normalized);
            this.router.navigateByUrl(normalized);
          } else {
            // Default behavior: go to Inicio
            this.router.navigate(['/inicio']);
          }
        } catch (navErr) {
          // Fallback to root route if navigation fails
          console.error('Navigation error, falling back to /', navErr);
          this.router.navigate(['/']);
        }

        this.toastService.success('¡Bienvenido!', 'Login exitoso');
      } else {
        console.error('❌ Login failed:', result.error);
        let errorMsg = result.error || 'Error al iniciar sesión';
        
        // Mensaje específico para problemas de RLS
        if (errorMsg.includes('infinite recursion') || errorMsg.includes('Internal Server Error')) {
          errorMsg = '🚨 Error de configuración de base de datos. Aplica la corrección desde Supabase Dashboard (ver FIX_RLS_URGENTE.md)';
        }
        
        this.errorMessage.set(errorMsg);
      }
    } catch (e: any) {
      console.error('❌ Unexpected error during login:', e);
      this.errorMessage.set('Error inesperado. Revisa la consola y aplica la corrección RLS.');
    }

    this.loading.set(false);
  }

  async onResetPassword() {
    if (this.resetForm.invalid) return;

    this.resetting.set(true);
    const email = this.resetForm.value.email!;

    const result = await this.authService.resetPassword(email);

    if (result.success) {
      this.toastService.success('Se ha enviado un email para recuperar tu contraseña', 'Email enviado');
      this.showForgotPassword = false;
      this.resetForm.reset();
    } else {
      this.toastService.error(result.error || 'Error al enviar email', 'Error');
    }

    this.resetting.set(false);
  }
}
