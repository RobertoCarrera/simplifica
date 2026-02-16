import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="reset-container transition-colors duration-300">
      <div class="reset-card transition-all duration-300">
        <!-- Header with icon -->
        <div class="reset-header">
          <div class="icon-circle">
            <i class="fa-solid fa-key-skeleton"></i>
          </div>
          <h2 class="reset-title">Establecer contraseña</h2>
          <p class="reset-subtitle">
            Ingresa tu nueva contraseña para acceder a tu cuenta
          </p>
        </div>

        <!-- Form -->
        <div *ngIf="stage() === 'setting'">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="reset-form">
            <div class="input-group">
              <label class="input-label">Nueva Contraseña</label>
              <div class="input-wrapper group">
                <i class="fa-solid fa-lock group-focus-within:text-blue-500 transition-colors"></i>
                <input type="password" formControlName="password" placeholder="Mínimo 6 caracteres" />
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">Confirmar Contraseña</label>
              <div class="input-wrapper group">
                <i class="fa-solid fa-lock-open group-focus-within:text-blue-500 transition-colors"></i>
                <input type="password" formControlName="confirm" placeholder="Repite tu contraseña" />
              </div>
            </div>

            <button type="submit" [disabled]="form.invalid || loading()" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
              @if (loading()) {
                <span class="spinner animate-spin"></span>
                <span>Actualizando...</span>
              } @else {
                <span>Actualizar Contraseña</span>
              }
            </button>
          </form>
        </div>

        <!-- Success -->
        <div *ngIf="stage() === 'done'" class="result-section">
          <div class="success-icon animate-bounce">
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <p class="result-message success-text">¡Contraseña actualizada con éxito!</p>
          <button (click)="router.navigate(['/login'])" class="w-full mt-4 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200">
            Volver al Inicio de Sesión
          </button>
        </div>

        <!-- Error -->
        <div *ngIf="stage() === 'error'" class="result-section">
          <div class="error-icon">
            <i class="fa-solid fa-circle-xmark"></i>
          </div>
          <p class="result-message error-text">{{errorMessage()}}</p>
          <button (click)="reload()" class="w-full mt-4 flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200">
            <i class="fa-solid fa-rotate-right mr-2"></i> Reintentar
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; width: 100%; }
    
    .reset-container {
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: #f8fafc;
      font-family: system-ui, -apple-system, sans-serif;
    }
    
    .reset-card {
      width: 100%;
      max-width: 440px;
      background: white;
      border-radius: 24px;
      padding: 2.5rem 2rem;
      box-shadow: 0 10px 40px -12px rgba(0,0,0,0.15), 0 4px 16px -8px rgba(0,0,0,0.1);
      border: 1px solid rgba(0,0,0,0.05);
    }
    
    .reset-header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    
    .icon-circle {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: rgba(99, 102, 241, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      font-size: 1.75rem;
      color: #6366f1;
      border: 1px solid rgba(99, 102, 241, 0.1);
    }
    
    .reset-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 0.75rem;
      letter-spacing: -0.01em;
    }
    
    .reset-subtitle {
      color: #64748b;
      font-size: 0.95rem;
      line-height: 1.5;
      max-width: 280px;
      margin: 0 auto;
    }
    
    .reset-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    
    .input-group { 
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .input-label {
      font-size: 0.875rem;
      font-weight: 600;
      color: #475569;
      padding-left: 0.25rem;
    }
    
    .input-wrapper {
      display: flex;
      align-items: center;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 0 1rem;
      gap: 0.75rem;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      height: 52px;
    }
    
    .input-wrapper:focus-within {
      border-color: #6366f1;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
      transform: translateY(-1px);
    }
    
    .input-wrapper i {
      font-size: 1.1rem;
      color: #94a3b8;
    }
    
    .input-wrapper input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 1rem;
      color: #1e293b;
      height: 100%;
    }
    
    .btn-primary {
      width: 100%;
      background: #6366f1;
      color: white;
      border: none;
      height: 52px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 0.5rem;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
    }
    
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
    
    .btn-primary:not(:disabled):hover {
      background: #4f46e5;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
    }
    
    .btn-secondary {
      width: 100%;
      background: transparent;
      color: #64748b;
      border: 1px solid #e2e8f0;
      height: 52px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-top: 1rem;
    }
    
    .btn-secondary:hover { 
      background: #f8fafc;
      color: #1e293b;
      border-color: #cbd5e1;
    }
    
    .spinner {
      width: 1.25rem;
      height: 1.25rem;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
    }
    
    @keyframes spin { to { transform: rotate(360deg); } }
    .animate-spin { animation: spin 0.8s linear infinite; }
    
    .result-section {
      text-align: center;
      padding: 1rem 0;
    }
    
    .success-icon {
      font-size: 3.5rem;
      color: #10b981;
      margin-bottom: 1.5rem;
    }
    
    .error-icon {
      font-size: 3.5rem;
      color: #ef4444;
      margin-bottom: 1.5rem;
    }
    
    .result-message {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 2rem;
    }
    
    .success-text { color: #065f46; }
    .error-text { color: #991b1b; }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .animate-bounce { animation: bounce 1s infinite; }
    
    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      .reset-container { background: #0f172a; }
      
      .reset-card {
        background: #1e293b;
        border-color: #334155;
        box-shadow: 0 10px 40px -12px rgba(0,0,0,0.4);
      }
      
      .icon-circle {
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
        border-color: rgba(99, 102, 241, 0.2);
      }
      
      .reset-title { color: #f1f5f9; }
      .reset-subtitle { color: #94a3b8; }
      .input-label { color: #94a3b8; }
      
      .input-wrapper {
        background: #0f172a;
        border-color: #334155;
      }
      
      .input-wrapper:focus-within {
        background: #0f172a;
        border-color: #818cf8;
        box-shadow: 0 0 0 4px rgba(129, 140, 248, 0.1);
      }
      
      .input-wrapper i { color: #475569; }
      .input-wrapper input { color: #f1f5f9; }
      .input-wrapper input::placeholder { color: #475569; }
      
      .btn-primary { 
        background: #6366f1; 
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      }
      .btn-primary:not(:disabled):hover { background: #4f46e5; }
      
      .btn-secondary {
        border-color: #334155;
        color: #94a3b8;
      }
      .btn-secondary:hover { background: #1e293b; color: #f1f5f9; border-color: #475569; }
      
      .success-text { color: #34d399; }
      .error-text { color: #f87171; }
      
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus {
        transition: background-color 5000s ease-in-out 0s;
        -webkit-text-fill-color: #f1f5f9 !important;
      }
    }
  `]
})
export class ResetPasswordComponent implements OnInit {
  form;

  loading = signal(false);
  stage = signal<'setting' | 'done' | 'error'>('setting');
  errorMessage = signal('');
  tokenPresent = signal(false);

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    public router: Router,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', [Validators.required]]
    });
  }

  async ngOnInit() {
    const fragment = window.location.hash.substring(1);
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');
    if (accessToken && refreshToken) {
      this.tokenPresent.set(true);
      try {
        const { error } = await this.auth.client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        if (error) throw error;
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e: any) {
        console.error('Error estableciendo sesión de recuperación', e);
        this.stage.set('error');
        this.errorMessage.set('No se pudo validar el enlace. Solicita otro email.');
      }
    } else if (type === 'recovery') {
      this.tokenPresent.set(true);
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;
    const { password, confirm } = this.form.value;
    if (password !== confirm) {
      this.toast.error('Las contraseñas no coinciden', 'Error');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.updatePassword(password!);
    this.loading.set(false);
    if (result.success) {
      this.toast.success('Contraseña actualizada', 'Éxito');
      this.stage.set('done');
    } else {
      this.toast.error(result.error || 'Error actualizando contraseña', 'Error');
    }
  }

  reload() { window.location.reload(); }
}
