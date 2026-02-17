import { Component, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService, LoginCredentials } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

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
            <li><i class="bi bi-check2-circle"></i> Facturación VeriFactu Automática</li>
            <li><i class="bi bi-check2-circle"></i> Gestión Integral y Automatizada</li>
            <li><i class="bi bi-check2-circle"></i> Tu negocio en piloto automático</li>
            <li><i class="bi bi-check2-circle"></i> Seguridad y RLS Empresarial</li>
          </ul>
          <div class="footer-note">© {{ currentYear }} Simplifica</div>
        </div>
      </div>

      <div class="form-side flex flex-col justify-center">
        <div class="form-wrapper mx-auto w-full">
          <div class="mobile-header text-center lg:hidden">
            <div class="logo-circle small"><i class="bi bi-gear-fill"></i></div>
            <h2>Simplifica</h2>
            <p class="subtitle">Inicia sesión en tu cuenta</p>
          </div>
          <h3 class="form-title">Accede a tu panel</h3>
          
          <div *ngIf="loginMode === 'email'" class="animate-fadeIn">
            <form [formGroup]="loginForm" (ngSubmit)="onEmailSubmit()" novalidate>
              <div class="mb-4">
                <label class="form-label">Email</label>
                <div class="input-wrapper" [class.invalid]="emailInvalid()">
                  <i class="bi bi-at"></i>
                  <input type="email" placeholder="tu@empresa.com" formControlName="email" (blur)="loginForm.get('email')?.markAsTouched()" />
                </div>
                @if (emailInvalid()) { <div class="field-error">Email válido requerido</div> }
              </div>

              <!-- Passkey Option (Temporarily Disabled)
              <button class="w-full flex justify-center items-center py-3 px-4 mb-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200" 
                      type="button" 
                      (click)="onPasskeyLogin()"
                      [disabled]="loginForm.get('email')?.invalid || loading()">
                <i class="bi bi-fingerprint mr-2 text-lg"></i>
                <span *ngIf="loading() && currentMethod() === 'passkey'" class="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full inline-block mr-2"></span>
                Usar Passkey / Biometría
              </button>
              -->

              <!-- Magic Link Option -->
              <button class="w-full flex justify-center items-center py-3 px-4 mb-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 disabled:opacity-50" 
                      type="submit" 
                      [disabled]="loginForm.get('email')?.invalid || loading()">
                <i class="bi bi-magic mr-2"></i>
                @if (loading() && currentMethod() === 'magic') { <span class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></span> Enviando... } @else { Enviar Magic Link }
              </button>
            </form>
          </div>

            @if (errorMessage()) {
              <div class="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800 flex items-center"><i class="bi bi-exclamation-triangle mr-2"></i>{{ errorMessage() }}</div>
            }

            @if (magicLinkSent()) {
               <div class="p-4 mb-4 text-sm text-green-700 bg-green-100 rounded-lg border border-green-200 text-center animate-slideDown">
                 <i class="bi bi-envelope-check text-2xl mb-2 block"></i>
                 <h4 class="font-bold mb-1">¡Enlace enviado!</h4>
                 <p>Revisa tu correo {{ loginForm.get('email')?.value }} para iniciar sesión.</p>
               </div>
            }
        </div>

      </div>
    </div>

    <!-- Modal de recuperación de contraseña -->
    @if (showForgotPassword) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" (click)="showForgotPassword = false">
        <div class="relative w-full max-w-md mx-4" (click)="$event.stopPropagation()">
          <div class="modal-content bg-white rounded-xl shadow-2xl overflow-hidden">
            <div class="modal-header flex items-center justify-between p-4 border-b border-gray-100">
              <h5 class="modal-title text-lg font-semibold text-gray-800">Recuperar Contraseña</h5>
              <button type="button" class="text-gray-400 hover:text-gray-600 transition-colors" (click)="showForgotPassword = false">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            
            <form [formGroup]="resetForm" (ngSubmit)="onResetPassword()">
              <div class="modal-body p-6">
                <div class="mb-4">
                  <label class="form-label">Email</label>
                  <div class="input-wrapper">
                    <i class="bi bi-envelope"></i>
                    <input
                      type="email"
                      formControlName="email"
                      placeholder="tu@empresa.com"
                    />
                  </div>
                </div>
              </div>
              
              <div class="modal-footer flex items-center justify-end gap-3 p-4 bg-gray-50 border-t border-gray-100">
                <button type="button" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all" (click)="showForgotPassword = false">
                  Cancelar
                </button>
                <button type="submit" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center" [disabled]="resetForm.invalid || resetting()">
                  @if (resetting()) {
                    <span class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block mr-2"></span>
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
    :host { display: block; height: 100vh; width: 100%; margin: 0; padding: 0; overflow: hidden; }
    .login-shell { height: 100vh; width: 100%; display: flex; background: #ffffff; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
    
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
      background: #2563eb; /* blue-600 */
      color: white;
      border: none;
      padding: 0.875rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      justify-content: center;
      align-items: center;
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
    
    /* Autofill fix */
    input:-webkit-autofill,
    input:-webkit-autofill:hover, 
    input:-webkit-autofill:focus, 
    input:-webkit-autofill:active {
      transition: background-color 5000s ease-in-out 0s;
      -webkit-text-fill-color: #1e293b !important;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .login-shell { background: #0f172a; }
      .form-side { background: #0f172a; }
      .form-wrapper { 
        background: #1e293b; 
        border-color: #334155;
        box-shadow: 0 10px 40px -12px rgba(0,0,0,0.4);
      }
      .form-title, .mobile-header h2 { color: #f1f5f9; }
      .mobile-header .subtitle { color: #94a3b8; }
      .form-label { color: #94a3b8; }
      .input-wrapper { 
        background: #0f172a !important; 
        border-color: #475569 !important; 
      }
      .input-wrapper:focus-within { 
        background: #1e293b !important; 
        border-color: #60a5fa !important; 
        box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
      }
      .input-wrapper i { color: #64748b; }
      .input-wrapper input { 
        color: #f1f5f9 !important; 
        background: transparent !important;
        border: none !important;
      }
      .input-wrapper input::placeholder { color: #64748b !important; }
      
      /* Dark mode autofill fix */
      input:-webkit-autofill,
      input:-webkit-autofill:hover, 
      input:-webkit-autofill:focus, 
      input:-webkit-autofill:active {
        transition: background-color 5000s ease-in-out 0s;
        -webkit-text-fill-color: #f1f5f9 !important;
      }

      .toggle-pass { color: #64748b; }
      .toggle-pass:hover { color: #60a5fa; }
      .small { color: #94a3b8; }
      .alert-error { 
        background: #450a0a; 
        color: #fca5a5; 
        border-color: #7f1d1d; 
      }
      .logo-circle { 
        background: rgba(59, 130, 246, 0.2); 
        border-color: rgba(59, 130, 246, 0.3);
        color: #60a5fa;
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
  currentYear = 2026;

  // New Auth States
  loginMode: 'email' = 'email';
  currentMethod = signal<'passkey' | 'magic' | null>(null);
  magicLinkSent = signal(false);

  constructor() {
    // Agregar clase al body para evitar scroll en login
    document.body.classList.add('auth-page');
  }

  ngOnInit() {
    // Start with password disabled validators for email-first flow, or handle in methods
    // We will handle validity checks manually in the specific submit methods
    
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
  });

  resetForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  // Computed properties para validación
  emailInvalid = () => {
    const control = this.loginForm.get('email');
    return control?.invalid && control?.touched;
  };

  // Password methods removed

  async onPasskeyLogin() {
    this.errorMessage.set('');
    
    const email = this.loginForm.get('email')?.value;
    if (!email || this.loginForm.get('email')?.invalid) {
         this.loginForm.get('email')?.markAsTouched();
         this.errorMessage.set('Ingresa un email válido para usar Passkey.');
         return;
    }

    this.currentMethod.set('passkey');
    this.loading.set(true);

    try {
      const result = await this.authService.signInWithPasskey(email);
      if (result.success) {
        this.toastService.success('¡Autenticación biométrica exitosa!', 'Bienvenido');
        await this.handleLoginSuccess();
      } else {
         // Mapeo amigable de errores de login
         let friendlyMsg = 'Error con la biometría.';
         if (result.error === 'CLIENT_UNSUPPORTED') {
             friendlyMsg = 'Tu navegador no soporta esta función.';
         } else if (result.error === 'CREDENTIAL_NOT_FOUND') {
             friendlyMsg = 'No se encontró ninguna credencial para este email en este dispositivo.';
         } else if (result.error) {
             friendlyMsg = result.error; // Fallback
         }
        this.errorMessage.set(friendlyMsg);
      }
    } catch (e: any) {
       console.warn('Passkey error:', e);
       this.errorMessage.set('No se pudo completar la autenticación biométrica.');
    } finally {
      this.loading.set(false);
      this.currentMethod.set(null);
    }
  }

  async onEmailSubmit() {
    if (this.loginForm.get('email')?.invalid) {
      this.loginForm.get('email')?.markAsTouched();
      return;
    }

    const email = this.loginForm.get('email')?.value;
    if (!email) return;

    this.currentMethod.set('magic');
    this.loading.set(true);
    this.errorMessage.set('');
    this.magicLinkSent.set(false);

    try {
      const result = await this.authService.signInWithMagicLink(email);
      if (result.success) {
        this.magicLinkSent.set(true);
        this.toastService.info('Revisa tu bandeja de entrada', 'Enlace enviado');
      } else {
        this.errorMessage.set(result.error || 'Error al enviar enlace mágico');
      }
    } catch (e) {
      this.errorMessage.set('Error inesperado al solicitar acceso.');
    } finally {
      this.loading.set(false);
    }
  }

  // NOTE: Password login removed for security compliance.
  // Only Passkeys and Magic Links are allowed.

  private async handleLoginSuccess() {
    const returnTo = (this as any)._returnTo as string | undefined;

    if (returnTo) {
      try {
        let normalized = decodeURIComponent(returnTo);
        if (!normalized.startsWith('/') || normalized.startsWith('//')) {
          normalized = '/inicio';
        }
        await this.router.navigateByUrl(normalized);
      } catch (navErr) {
        await this.router.navigate(['/inicio']);
      }
    } else {
      await this.router.navigate(['/inicio']);
    }
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
