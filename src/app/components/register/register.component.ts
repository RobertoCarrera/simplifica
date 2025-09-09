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
              <label for="fullName">Nombre Completo</label>
              <input
                type="text"
                id="fullName"
                formControlName="fullName"
                placeholder="Juan Pérez"
                [class.error]="fullNameInvalid()"
              />
              @if (fullNameInvalid()) {
                <span class="error-message">Nombre completo requerido</span>
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

          <!-- Datos de la empresa -->
          <div class="form-section">
            <h3>Empresa</h3>
            
            <div class="account-type">
              <label class="radio-option">
                <input 
                  type="radio" 
                  value="new" 
                  formControlName="accountType"
                  (change)="onAccountTypeChange('new')"
                />
                <span class="radio-custom"></span>
                <div class="option-content">
                  <strong>Crear nueva empresa</strong>
                  <p>Soy el administrador de una nueva empresa</p>
                </div>
              </label>

              <label class="radio-option">
                <input 
                  type="radio" 
                  value="existing" 
                  formControlName="accountType"
                  (change)="onAccountTypeChange('existing')"
                />
                <span class="radio-custom"></span>
                <div class="option-content">
                  <strong>Unirse a empresa existente</strong>
                  <p>Tengo una invitación para unirme a una empresa</p>
                </div>
              </label>
            </div>

            @if (showCompanyName()) {
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
            }

            @if (showInvitationCode()) {
              <div class="form-group">
                <label for="invitationCode">Código de Invitación</label>
                <input
                  type="text"
                  id="invitationCode"
                  formControlName="invitationCode"
                  placeholder="Código recibido por email"
                  [class.error]="invitationCodeInvalid()"
                />
                @if (invitationCodeInvalid()) {
                  <span class="error-message">Código de invitación requerido</span>
                }
              </div>
            }
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
    @import '../../styles/shared.scss';
    
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
  accountType = signal<'new' | 'existing'>('new');

  // Form
  registerForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    accountType: ['new', [Validators.required]],
    companyName: [''],
    invitationCode: [''],
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

    // Validadores condicionales
    this.registerForm.get('accountType')?.valueChanges.subscribe(type => {
      this.onAccountTypeChange(type as 'new' | 'existing');
    });
  }

  // Computed properties para validación
  fullNameInvalid = () => {
    const control = this.registerForm.get('fullName');
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
    return control?.invalid && control?.touched && this.showCompanyName();
  };

  invitationCodeInvalid = () => {
    const control = this.registerForm.get('invitationCode');
    return control?.invalid && control?.touched && this.showInvitationCode();
  };

  termsInvalid = () => {
    const control = this.registerForm.get('acceptTerms');
    return control?.invalid && control?.touched;
  };

  showCompanyName = () => this.accountType() === 'new';
  showInvitationCode = () => this.accountType() === 'existing';

  onAccountTypeChange(type: 'new' | 'existing') {
    this.accountType.set(type);
    
    const companyNameControl = this.registerForm.get('companyName');
    const invitationCodeControl = this.registerForm.get('invitationCode');

    if (type === 'new') {
      companyNameControl?.setValidators([Validators.required]);
      invitationCodeControl?.clearValidators();
    } else {
      companyNameControl?.clearValidators();
      invitationCodeControl?.setValidators([Validators.required]);
    }

    companyNameControl?.updateValueAndValidity();
    invitationCodeControl?.updateValueAndValidity();
  }

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
      full_name: formValue.fullName!,
      company_name: formValue.accountType === 'new' ? formValue.companyName || undefined : undefined
    };

    const result = await this.authService.register(registerData);

    if (result.success) {
      this.toastService.success(
        'Cuenta creada exitosamente. Revisa tu email para confirmar tu cuenta.',
        'Registro exitoso'
      );
      this.router.navigate(['/login']);
    } else {
      this.errorMessage.set(result.error || 'Error al crear la cuenta');
    }

    this.loading.set(false);
  }
}
