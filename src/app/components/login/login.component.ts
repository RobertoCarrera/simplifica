import { Component, inject, signal, OnDestroy } from '@angular/core';
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
    <div class="vh-100 d-flex">
      <!-- Panel izquierdo - Formulario -->
      <div class="col-md-6 d-flex align-items-center justify-content-center bg-white p-5">
        <div class="w-100" style="max-width: 400px;">
          <!-- Logo y título -->
          <div class="text-center mb-5">
            <div class="mb-3">
              <i class="bi bi-gear-fill text-primary" style="font-size: 3rem;"></i>
            </div>
            <h1 class="h2 fw-bold text-dark mb-2">Simplifica</h1>
            <p class="text-muted">Sistema de Gestión Empresarial</p>
          </div>

          <!-- Formulario de login -->
          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
            <div class="mb-4">
              <label class="form-label fw-medium">Email</label>
              <input
                type="email"
                class="form-control form-control-lg"
                formControlName="email"
                placeholder="tu@empresa.com"
                [class.is-invalid]="emailInvalid()"
              />
              @if (emailInvalid()) {
                <div class="invalid-feedback">Email requerido y válido</div>
              }
            </div>

            <div class="mb-4">
              <label class="form-label fw-medium">Contraseña</label>
              <input
                type="password"
                class="form-control form-control-lg"
                formControlName="password"
                placeholder="••••••••"
                [class.is-invalid]="passwordInvalid()"
              />
              @if (passwordInvalid()) {
                <div class="invalid-feedback">Contraseña requerida</div>
              }
            </div>

            <div class="d-grid mb-4">
              <button
                type="submit"
                class="btn btn-primary btn-lg"
                [disabled]="loginForm.invalid || loading()"
              >
                @if (loading()) {
                  <span class="spinner-border spinner-border-sm me-2"></span>
                  Iniciando sesión...
                } @else {
                  <i class="bi bi-box-arrow-in-right me-2"></i>
                  Iniciar Sesión
                }
              </button>
            </div>

            @if (errorMessage()) {
              <div class="alert alert-danger d-flex align-items-center">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                {{ errorMessage() }}
              </div>
            }
          </form>

          <!-- Enlaces adicionales -->
          <div class="text-center">
            <a href="#" (click)="showForgotPassword = true" class="text-decoration-none me-3">
              ¿Olvidaste tu contraseña?
            </a>
            <span class="text-muted">•</span>
            <a routerLink="/register" class="text-decoration-none ms-3">
              Crear cuenta nueva
            </a>
          </div>
        </div>
      </div>

      <!-- Panel derecho - Información -->
      <div class="col-md-6 bg-primary d-none d-md-flex align-items-center justify-content-center text-white">
        <div class="text-center px-5">
          <div class="mb-4">
            <i class="bi bi-diagram-3-fill" style="font-size: 4rem; opacity: 0.9;"></i>
          </div>
          <h2 class="h3 mb-4">¿Nuevo en Simplifica?</h2>
          <p class="lead mb-4">Gestiona clientes, tickets y servicios de manera eficiente</p>
          <div class="row text-start">
            <div class="col-6">
              <div class="d-flex align-items-center mb-3">
                <i class="bi bi-check-circle-fill me-2 text-success"></i>
                <span>Multi-empresa</span>
              </div>
              <div class="d-flex align-items-center mb-3">
                <i class="bi bi-check-circle-fill me-2 text-success"></i>
                <span>Gestión de equipos</span>
              </div>
            </div>
            <div class="col-6">
              <div class="d-flex align-items-center mb-3">
                <i class="bi bi-check-circle-fill me-2 text-success"></i>
                <span>Reportes en tiempo real</span>
              </div>
              <div class="d-flex align-items-center mb-3">
                <i class="bi bi-check-circle-fill me-2 text-success"></i>
                <span>Seguridad avanzada</span>
              </div>
            </div>
          </div>
          <a routerLink="/register" class="btn btn-outline-light btn-lg mt-4">
            <i class="bi bi-person-plus me-2"></i>
            Crear Cuenta Gratis
          </a>
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
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    
    .vh-100 {
      height: 100vh !important;
      overflow: hidden;
    }
    
    .form-control:focus {
      border-color: var(--bs-primary);
      box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.25);
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
      border: none;
      transition: all 0.3s ease;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 123, 255, 0.4);
    }
    
    .bg-primary {
      background: linear-gradient(135deg, #007bff 0%, #0056b3 100%) !important;
    }
    
    .modal {
      z-index: 1060;
    }
    
    /* Responsivo para móviles */
    @media (max-width: 768px) {
      .col-md-6:first-child {
        width: 100%;
        padding: 2rem 1rem;
      }
      
      .col-md-6:last-child {
        display: none !important;
      }
    }
  `]
})
export class LoginComponent implements OnDestroy {
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

  constructor() {
    // Agregar clase al body para evitar scroll en login
    document.body.classList.add('auth-page');
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

  async onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading.set(true);
    this.errorMessage.set('');

    const credentials: LoginCredentials = {
      email: this.loginForm.value.email!,
      password: this.loginForm.value.password!
    };

    const result = await this.authService.login(credentials);

    if (result.success) {
      // Redirigir a la página solicitada o dashboard
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/clientes';
      this.router.navigate([returnUrl]);
      this.toastService.success('¡Bienvenido!', 'Login exitoso');
    } else {
      this.errorMessage.set(result.error || 'Error al iniciar sesión');
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
