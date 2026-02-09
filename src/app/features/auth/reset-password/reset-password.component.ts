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
    <div class="reset-container">
      <div class="reset-card">
        <!-- Header with icon -->
        <div class="reset-header">
          <div class="icon-circle">
            <i class="bi bi-key-fill"></i>
          </div>
          <h2 class="reset-title">Recuperar contraseña</h2>
          <p class="reset-subtitle" *ngIf="!tokenPresent()">
            Ingresa tu nueva contraseña
          </p>
        </div>

        <!-- Form -->
        <div *ngIf="stage() === 'setting'">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="reset-form">
            <div class="input-group">
              <div class="input-wrapper">
                <i class="bi bi-lock"></i>
                <input type="password" formControlName="password" placeholder="Nueva contraseña" />
              </div>
            </div>
            <div class="input-group">
              <div class="input-wrapper">
                <i class="bi bi-lock-fill"></i>
                <input type="password" formControlName="confirm" placeholder="Confirmar contraseña" />
              </div>
            </div>

            <button type="submit" [disabled]="form.invalid || loading()" class="btn-primary">
              <span *ngIf="!loading(); else loadingTpl">Actualizar contraseña</span>
            </button>
            <ng-template #loadingTpl>
              <span class="spinner"></span> Actualizando...
            </ng-template>
          </form>
        </div>

        <!-- Success -->
        <div *ngIf="stage() === 'done'" class="result-section success">
          <p class="result-message success-text">Contraseña actualizada correctamente</p>
          <button (click)="router.navigate(['/login'])" class="btn-primary">Ir al login</button>
        </div>

        <!-- Error -->
        <div *ngIf="stage() === 'error'" class="result-section">
          <p class="result-message error-text">{{errorMessage()}}</p>
          <button (click)="reload()" class="btn-secondary">Reintentar</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    
    .reset-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
    }
    
    .reset-card {
      width: 100%;
      max-width: 400px;
      background: white;
      border-radius: 20px;
      padding: 2rem;
      box-shadow: 0 10px 40px -12px rgba(0,0,0,0.15);
      border: 1px solid rgba(0,0,0,0.05);
    }
    
    .reset-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .icon-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(99, 102, 241, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
      font-size: 1.5rem;
      color: #6366f1;
    }
    
    .reset-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 0.5rem;
    }
    
    .reset-subtitle {
      color: #64748b;
      font-size: 0.9rem;
      margin: 0;
    }
    
    .reset-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .input-group { margin-bottom: 0.5rem; }
    
    .input-wrapper {
      display: flex;
      align-items: center;
      background: #fff;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 0.875rem 1rem;
      gap: 0.75rem;
      transition: all 0.2s ease;
    }
    
    .input-wrapper:focus-within {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
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
    }
    
    .input-wrapper input::placeholder {
      color: #94a3b8;
    }
    
    .btn-primary {
      width: 100%;
      background: #6366f1;
      color: white;
      border: none;
      padding: 0.875rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .btn-primary:not(:disabled):hover {
      background: #4f46e5;
      transform: translateY(-1px);
    }
    
    .btn-secondary {
      width: 100%;
      background: #475569;
      color: white;
      border: none;
      padding: 0.875rem;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .btn-secondary:hover {
      background: #334155;
    }
    
    .spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .result-section {
      text-align: center;
    }
    
    .result-message {
      font-weight: 500;
      margin-bottom: 1.5rem;
    }
    
    .success-text { color: #059669; }
    .error-text { color: #dc2626; }
    
    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      .reset-container {
        background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
      }
      
      .reset-card {
        background: #1e293b;
        border-color: #334155;
        box-shadow: 0 10px 40px -12px rgba(0,0,0,0.4);
      }
      
      .icon-circle {
        background: rgba(99, 102, 241, 0.2);
        color: #818cf8;
      }
      
      .reset-title { color: #f1f5f9; }
      .reset-subtitle { color: #94a3b8; }
      
      .input-wrapper {
        background: #0f172a;
        border-color: #475569;
      }
      
      .input-wrapper:focus-within {
        background: #1e293b;
        border-color: #818cf8;
        box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.15);
      }
      
      .input-wrapper i { color: #64748b; }
      
      .input-wrapper input {
        color: #f1f5f9;
      }
      
      .input-wrapper input::placeholder {
        color: #64748b;
      }
      
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
