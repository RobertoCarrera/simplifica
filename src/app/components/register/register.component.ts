import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService, RegisterData } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="register-container">
      <div class="register-card">
        <!-- Header -->
        <div class="register-header">
          <h1>Crear Cuenta</h1>
          <p>Registra tu cuenta para comenzar a gestionar tu empresa con seguridad y eficiencia.</p>
        </div>

        <!-- Formulario -->
        <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="register-form">
          <!-- Datos personales -->
          <div class="form-section">
            <h3>Datos Personales</h3>
            
            <div class="form-field">
              <label for="givenName" class="field-label">Nombre</label>
              <div class="input-wrapper" [class.invalid]="givenNameInvalid()">
                <i class="bi bi-person"></i>
                <input
                  type="text"
                  id="givenName"
                  formControlName="given_name"
                  placeholder="Juan"
                  (blur)="registerForm.get('given_name')?.markAsTouched()"
                />
              </div>
              @if (givenNameInvalid()) {
                <span class="field-error">Nombre requerido</span>
              }
            </div>

            <div class="form-field">
              <label for="surname" class="field-label">Apellidos</label>
              <div class="input-wrapper" [class.invalid]="surnameInvalid()">
                <i class="bi bi-person"></i>
                <input
                  type="text"
                  id="surname"
                  formControlName="surname"
                  placeholder="Pérez"
                  (blur)="registerForm.get('surname')?.markAsTouched()"
                />
              </div>
              @if (surnameInvalid()) {
                <span class="field-error">Apellidos requeridos</span>
              }
            </div>

            <div class="form-field">
              <label for="email" class="field-label">Email</label>
              <div class="input-wrapper" [class.invalid]="emailInvalid()">
                <i class="bi bi-envelope"></i>
                <input
                  type="email"
                  id="email"
                  formControlName="email"
                  placeholder="juan@empresa.com"
                  (blur)="registerForm.get('email')?.markAsTouched()"
                />
              </div>
              @if (emailInvalid()) {
                <span class="field-error">Email válido requerido</span>
              }
            </div>

            <div class="form-field">
              <label for="password" class="field-label">Contraseña</label>
              <div class="input-wrapper" [class.invalid]="passwordInvalid()">
                <i class="bi bi-lock"></i>
                <input
                  type="password"
                  id="password"
                  formControlName="password"
                  placeholder="Mínimo 6 caracteres"
                  (blur)="registerForm.get('password')?.markAsTouched()"
                />
              </div>
              @if (passwordInvalid()) {
                <span class="field-error">Mínimo 6 caracteres</span>
              }
            </div>

            <div class="form-field">
              <label for="confirmPassword" class="field-label">Confirmar Contraseña</label>
              <div class="input-wrapper" [class.invalid]="confirmPasswordInvalid()">
                <i class="bi bi-lock-fill"></i>
                <input
                  type="password"
                  id="confirmPassword"
                  formControlName="confirmPassword"
                  placeholder="Repetir contraseña"
                  (blur)="registerForm.get('confirmPassword')?.markAsTouched()"
                />
              </div>
              @if (confirmPasswordInvalid()) {
                <span class="field-error">Las contraseñas no coinciden</span>
              }
            </div>
          </div>

          <!-- Datos de la empresa (siempre crear nueva) -->
          <div class="form-section">
            <h3>Empresa</h3>
            <div class="form-field">
              <label for="companyName" class="field-label">Nombre de la Empresa</label>
              <div class="input-wrapper" [class.invalid]="companyNameInvalid()">
                <i class="bi bi-building"></i>
                <input
                  type="text"
                  id="companyName"
                  formControlName="companyName"
                  placeholder="Mi Empresa S.L."
                  (blur)="registerForm.get('companyName')?.markAsTouched()"
                />
              </div>
              @if (companyNameInvalid()) {
                <span class="field-error">Nombre de empresa requerido</span>
              }
            </div>
          </div>

          <!-- Términos y condiciones -->
          <div class="form-field terms-field">
            <label class="checkbox-label">
              <input type="checkbox" formControlName="acceptTerms" (blur)="registerForm.get('acceptTerms')?.markAsTouched()" />
              <span class="checkbox-custom"></span>
              <span class="terms-text">Acepto los <a href="#" class="link">términos y condiciones</a> y la <a href="#" class="link">política de privacidad</a></span>
            </label>
            @if (termsInvalid()) {
              <span class="field-error">Debes aceptar los términos y condiciones</span>
            }
          </div>

          <!-- Submit -->
          <div class="form-actions">
            <button
              type="submit"
              class="btn btn-primary btn-full"
              [disabled]="registerForm.invalid || loading()"
            >
              @if (loading()) {
                <span class="spinner"></span>
                Creando cuenta...
              } @else {
                Crear Cuenta
              }
            </button>
          </div>

          @if (errorMessage()) {
            <div class="error-alert">
              <i class="icon-alert"></i>
              {{ errorMessage() }}
            </div>
          }
        </form>

        <!-- Footer -->
        <div class="register-footer">
          <p>¿Ya tienes cuenta? <a routerLink="/login" class="link">Inicia sesión</a></p>
        </div>
      </div>

      <!-- Info lateral -->
      <div class="info-section">
        <div class="feature-list">
          <div class="feature">
            <h3><i class="fa-solid fa-people-group"></i> Gestión de equipos</h3>
            <p>Administra usuarios y permisos de manera granular.</p>
          </div>
          <div class="feature">
            <h3><i class="fa-solid fa-ticket"></i> Sistema de tickets</h3>
            <p>Seguimiento completo de trabajos y reparaciones.</p>
          </div>
          <div class="feature">
            <h3><i class="fa-solid fa-chart-bar"></i> Reportes y análisis</h3>
            <p>Información útil y tendencias de tu negocio.</p>
          </div>
          <div class="feature">
            <h3><i class="fa-solid fa-shield"></i> Seguridad avanzada</h3>
            <p>Protección y cumplimiento para tus datos.</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
  /* Migrated from @import to @use; define forward in shared.scss if needed */
  @use '../../styles/shared.scss' as *;
    
    .register-container {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1fr 1fr;
      
      @media (max-width: 968px) {
        grid-template-columns: 1fr;
      }
    }
    
    .register-card {
      padding: 2.5rem 3rem;
      background: white;
      overflow-y: auto;
    }
    
    .register-header {
      text-align: center;
      margin-bottom: 2.5rem;
      
      h1 {
        font-size: 2.25rem;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 0.75rem;
        letter-spacing: -0.5px;
      }
      
      p {
        color: #6b7280;
        font-size: 1rem;
        line-height: 1.5;
      }
    }
    
    .register-form {
      max-width: 480px;
      margin: 0 auto;
    }
    
    .form-section {
      margin-bottom: 2.25rem;
      padding-bottom: 1.75rem;
      border-bottom: 1px solid #e5e7eb;
      
      &:last-child {
        border-bottom: none;
      }
      
      h3 {
        font-size: 1.1rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 1.25rem;
      }
    }
    
    .form-field {
      margin-bottom: 1.25rem;
    }
    
    .field-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 0.5rem;
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
    }
    
    .input-wrapper.invalid {
      border-color: #ef4444;
      background: #fef2f2;
    }
    
    .input-wrapper:focus-within {
      border-color: #3b82f6;
      background: #f8fafc;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .input-wrapper i {
      font-size: 1.1rem;
      color: #94a3b8;
      flex-shrink: 0;
    }
    
    .input-wrapper input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 1rem;
      font-weight: 500;
      color: #1e293b;
    }
    
    .input-wrapper input::placeholder {
      color: #94a3b8;
      font-weight: 400;
    }
    
    .field-error {
      display: block;
      font-size: 0.7rem;
      color: #ef4444;
      margin-top: 0.35rem;
      font-weight: 500;
    }
    
    .account-type {
      margin-bottom: 1.5rem;
    }
    
    .radio-option {
      display: flex;
      align-items: flex-start;
      padding: 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      
      &:hover {
        border-color: #3b82f6;
        background: #f8fafc;
      }
      
      input[type="radio"] {
        display: none;
        
        &:checked + .radio-custom {
          background: #3b82f6;
          border-color: #3b82f6;
          
          &::after {
            opacity: 1;
          }
        }
        
        &:checked ~ .option-content {
          color: #1f2937;
        }
      }
    }
    
    .radio-custom {
      width: 20px;
      height: 20px;
      border: 2px solid #d1d5db;
      border-radius: 50%;
      margin-right: 1rem;
      position: relative;
      flex-shrink: 0;
      margin-top: 2px;
      
      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
    }
    
    .option-content {
      strong {
        display: block;
        font-weight: 600;
        color: #374151;
        margin-bottom: 0.25rem;
      }
      
      p {
        color: #6b7280;
        font-size: 0.9rem;
        margin: 0;
      }
    }
    
    .terms-field {
      margin-top: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .checkbox-label {
      display: flex;
      align-items: flex-start;
      cursor: pointer;
      
      input[type="checkbox"] {
        display: none;
        
        &:checked + .checkbox-custom {
          background: #3b82f6;
          border-color: #3b82f6;
          
          &::after {
            opacity: 1;
          }
        }
      }
    }
    
    .checkbox-custom {
      width: 20px;
      height: 20px;
      border: 2px solid #d1d5db;
      border-radius: 6px;
      margin-right: 0.75rem;
      flex-shrink: 0;
      margin-top: 2px;
      position: relative;
      transition: all 0.2s ease;
      
      &::after {
        content: '✓';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 12px;
        font-weight: bold;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
    }
    
    .terms-text {
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.5;
    }
    
    .form-actions {
      margin-top: 2rem;
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
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .btn-primary:not(:disabled):hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 25px -8px rgba(59, 130, 246, 0.4);
    }
    
    .error-alert {
      margin-top: 1rem;
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
      padding: 0.875rem 1rem;
      border-radius: 12px;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .register-footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 1.75rem;
      border-top: 1px solid #e5e7eb;
      
      p {
        font-size: 0.875rem;
        color: #64748b;
        margin: 0;
      }
      
      .link {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 600;
        
        &:hover {
          text-decoration: underline;
        }
      }
    }
    
    .info-section {
      background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
      color: white;
      padding: 3rem;
      display: flex;
      align-items: center;
      
      @media (max-width: 968px) {
        display: none;
      }
    }
    
    .feature-list {
      max-width: 400px;
      margin: 0 auto;
    }
    
    .feature {
      margin-bottom: 2rem;
      
      &:last-child {
        margin-bottom: 0;
      }
    }
    
    .feature h3 { font-size:1.05rem; font-weight:600; margin-bottom:.35rem; display:flex; align-items:center; gap:.5rem; }
    .feature h3 i { font-size:1.1rem; color:#93c5fd; }
    .feature p { opacity:.85; line-height:1.4; }
    
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #ffffff40;
      border-radius: 50%;
      border-top-color: #ffffff;
      animation: spin 1s ease-in-out infinite;
      margin-right: 0.5rem;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);

  // Signals
  loading = signal(false);
  errorMessage = signal('');

  // Form
  registerForm = this.fb.group({
  given_name: ['', [Validators.required, Validators.minLength(2)]],
  surname: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    companyName: ['', [Validators.required]],
    acceptTerms: [false, [Validators.requiredTrue]]
  });

  constructor() {
    // Validador personalizado para confirmar contraseña
    this.registerForm.get('confirmPassword')?.addValidators(
      (control) => {
        const password = this.registerForm?.get('password')?.value;
        return control.value === password ? null : { mismatch: true };
      }
    );

  }

  ngOnInit() {
    const qp = this.route.snapshot.queryParams['returnUrl'] as string | undefined;
    if (qp) {
      (this as any)._returnTo = qp;
    }
  }

  // Computed properties para validación
  fullNameInvalid = () => {
    const control = this.registerForm.get('given_name');
    return control?.invalid && control?.touched;
  };

  givenNameInvalid = () => {
    const control = this.registerForm.get('given_name');
    return control?.invalid && control?.touched;
  };

  surnameInvalid = () => {
    const control = this.registerForm.get('surname');
    return control?.invalid && control?.touched;
  };

  emailInvalid = () => {
    const control = this.registerForm.get('email');
    return control?.invalid && control?.touched;
  };

  passwordInvalid = () => {
    const control = this.registerForm.get('password');
    return control?.invalid && control?.touched;
  };

  confirmPasswordInvalid = () => {
    const control = this.registerForm.get('confirmPassword');
    return control?.invalid && control?.touched;
  };

  companyNameInvalid = () => {
    const control = this.registerForm.get('companyName');
    return control?.invalid && control?.touched;
  };

  termsInvalid = () => {
    const control = this.registerForm.get('acceptTerms');
    return control?.invalid && control?.touched;
  };

  // Eliminado soporte de invitaciones / unirse a empresa existente: siempre crea nueva empresa

  async onSubmit() {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const formValue = this.registerForm.value;

    const registerData: RegisterData = {
      email: formValue.email!,
      password: formValue.password!,
      given_name: formValue.given_name!,
      surname: formValue.surname!,
      full_name: `${formValue.given_name} ${formValue.surname}`,
      company_name: formValue.companyName || undefined
    };

    console.log('🚀 Starting registration process...', registerData);

    try {
      const result = await this.authService.register({...registerData, autoLogin: true});

      if (result.success) {
        if (result.pendingConfirmation) {
          this.toastService.success(
            'Te hemos enviado un email de confirmación. Revisa tu bandeja de entrada.',
            'Confirma tu email'
          );
          // Navegar a la página de confirmación para mostrar instrucciones
          this.router.navigate(['/auth/confirm']);
        } else {
          this.toastService.success('Bienvenido. Tu cuenta ha sido creada.', 'Registro exitoso');
          console.log('✅ Registration successful, redirecting');
          const returnTo = (this as any)._returnTo as string | undefined;
          if (returnTo) {
            const normalized = decodeURIComponent(returnTo).startsWith('/') ? decodeURIComponent(returnTo) : `/${decodeURIComponent(returnTo)}`;
            history.replaceState({}, '', normalized);
            this.router.navigateByUrl(normalized);
          } else {
            this.router.navigate(['/inicio']);
          }
        }
      } else {
        console.error('❌ Registration failed:', result.error);
        let errorMsg = result.error || 'Error al crear la cuenta';
        
        // Mensaje específico para problemas de RLS
        if (errorMsg.includes('infinite recursion') || errorMsg.includes('Internal Server Error')) {
          errorMsg = '🚨 Error de configuración de base de datos. Por favor, aplica la corrección RLS desde el Dashboard de Supabase. Ver archivo FIX_RLS_URGENTE.md';
        }
        
        this.errorMessage.set(errorMsg);
      }
    } catch (e: any) {
      console.error('❌ Unexpected error during registration:', e);
      this.errorMessage.set('Error inesperado. Revisa la consola y el archivo FIX_RLS_URGENTE.md');
    }

    this.loading.set(false);
  }
}
