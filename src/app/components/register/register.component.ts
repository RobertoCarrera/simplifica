import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, RegisterData } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="register-container">
      <div class="register-card">
        <!-- Header -->
        <div class="register-header">
          <h1>Crear Cuenta</h1>
          <p>Únete a Simplifica y gestiona tu empresa de manera eficiente</p>
        </div>

        <!-- Formulario -->
        <form [formGroup]="registerForm" (ngSubmit)="onSubmit()" class="register-form">
          <!-- Datos personales -->
          <div class="form-section">
            <h3>Datos Personales</h3>
            
            <div class="form-group">
              <label for="givenName">Nombre</label>
              <input
                type="text"
                id="givenName"
                formControlName="given_name"
                placeholder="Juan"
                [class.error]="givenNameInvalid()"
              />
              @if (givenNameInvalid()) {
                <span class="error-message">Nombre requerido</span>
              }
            </div>

            <div class="form-group">
              <label for="surname">Apellidos</label>
              <input
                type="text"
                id="surname"
                formControlName="surname"
                placeholder="Pérez"
                [class.error]="surnameInvalid()"
              />
              @if (surnameInvalid()) {
                <span class="error-message">Apellidos requeridos</span>
              }
            </div>

            <div class="form-group">
              <label for="email">Email</label>
              <input
                type="email"
                id="email"
                formControlName="email"
                placeholder="juan@empresa.com"
                [class.error]="emailInvalid()"
              />
              @if (emailInvalid()) {
                <span class="error-message">Email válido requerido</span>
              }
            </div>

            <div class="form-group">
              <label for="password">Contraseña</label>
              <input
                type="password"
                id="password"
                formControlName="password"
                placeholder="Mínimo 6 caracteres"
                [class.error]="passwordInvalid()"
              />
              @if (passwordInvalid()) {
                <span class="error-message">Mínimo 6 caracteres</span>
              }
            </div>

            <div class="form-group">
              <label for="confirmPassword">Confirmar Contraseña</label>
              <input
                type="password"
                id="confirmPassword"
                formControlName="confirmPassword"
                placeholder="Repetir contraseña"
                [class.error]="confirmPasswordInvalid()"
              />
              @if (confirmPasswordInvalid()) {
                <span class="error-message">Las contraseñas no coinciden</span>
              }
            </div>
          </div>

          <!-- Datos de la empresa (siempre crear nueva) -->
          <div class="form-section">
            <h3>Empresa</h3>
            <div class="form-group">
              <label for="companyName">Nombre de la Empresa</label>
              <input
                type="text"
                id="companyName"
                formControlName="companyName"
                placeholder="Mi Empresa S.L."
                [class.error]="companyNameInvalid()"
              />
              @if (companyNameInvalid()) {
                <span class="error-message">Nombre de empresa requerido</span>
              }
            </div>
          </div>

          <!-- Términos y condiciones -->
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" formControlName="acceptTerms" />
              <span class="checkbox-custom"></span>
              Acepto los <a href="#" class="link">términos y condiciones</a> y la 
              <a href="#" class="link">política de privacidad</a>
            </label>
            @if (termsInvalid()) {
              <span class="error-message">Debes aceptar los términos y condiciones</span>
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
            <div class="feature-icon">👥</div>
            <h3>Gestión de Equipos</h3>
            <p>Administra usuarios y permisos de manera granular</p>
          </div>
          
          <div class="feature">
            <div class="feature-icon">🎫</div>
            <h3>Sistema de Tickets</h3>
            <p>Seguimiento completo de trabajos y reparaciones</p>
          </div>
          
          <div class="feature">
            <div class="feature-icon">📊</div>
            <h3>Reportes y Analytics</h3>
            <p>Insights detallados sobre tu negocio</p>
          </div>
          
          <div class="feature">
            <div class="feature-icon">🔒</div>
            <h3>Seguridad Avanzada</h3>
            <p>Datos protegidos con encriptación de nivel empresarial</p>
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
      padding: 2rem 3rem;
      background: white;
      overflow-y: auto;
    }
    
    .register-header {
      text-align: center;
      margin-bottom: 2rem;
      
      h1 {
        font-size: 2.5rem;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 0.5rem;
      }
      
      p {
        color: #6b7280;
        font-size: 1.1rem;
      }
    }
    
    .register-form {
      max-width: 500px;
      margin: 0 auto;
    }
    
    .form-section {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      
      &:last-child {
        border-bottom: none;
      }
      
      h3 {
        font-size: 1.2rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 1rem;
      }
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
      width: 18px;
      height: 18px;
      border: 2px solid #d1d5db;
      border-radius: 4px;
      margin-right: 0.75rem;
      flex-shrink: 0;
      margin-top: 2px;
      position: relative;
      
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
    
    .register-footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e5e7eb;
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
    
    .feature-icon {
      font-size: 2rem;
      margin-bottom: 0.5rem;
    }
    
    .feature h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    
    .feature p {
      opacity: 0.9;
      line-height: 1.5;
    }
    
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
            '📧 Te hemos enviado un email de confirmación. Revisa tu bandeja de entrada.',
            'Confirma tu email'
          );
          // Navegar a la página de confirmación para mostrar instrucciones
          this.router.navigate(['/auth/confirm']);
        } else {
          this.toastService.success('Bienvenido 👋 Tu cuenta ha sido creada.', 'Registro exitoso');
          console.log('✅ Registration successful, redirecting to dashboard');
          // Redirigir directo al dashboard
          this.router.navigate(['/clientes']);
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
