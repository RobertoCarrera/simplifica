import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-portal-invite',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
    <div class="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
      <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Portal de Clientes</h1>
      
      <div *ngIf="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Procesando invitación...</p>
      </div>
      
      <div *ngIf="error && !showPasswordForm" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
        <p class="text-red-800 dark:text-red-200">{{ error }}</p>
      </div>
      
      <div *ngIf="success && !showPasswordForm" class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
        <p class="text-green-800 dark:text-green-200">¡Invitación aceptada! Redirigiendo...</p>
      </div>

      <!-- Password setup form -->
      <div *ngIf="showPasswordForm" class="space-y-6">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Crea tu contraseña para acceder al portal de clientes
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-500 mb-4">
            Email: <strong>{{ userEmail }}</strong>
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Contraseña
          </label>
          <input 
            type="password" 
            [(ngModel)]="password"
            (keyup.enter)="submitPassword()"
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            placeholder="Mínimo 6 caracteres"
            [disabled]="submitting"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Confirmar contraseña
          </label>
          <input 
            type="password" 
            [(ngModel)]="passwordConfirm"
            (keyup.enter)="submitPassword()"
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
            placeholder="Repite la contraseña"
            [disabled]="submitting"
          />
        </div>

        <div *ngIf="passwordError" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p class="text-sm text-red-800 dark:text-red-200">{{ passwordError }}</p>
        </div>

        <button 
          (click)="submitPassword()"
          [disabled]="submitting || !password || !passwordConfirm"
          class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
        >
          {{ submitting ? 'Creando cuenta...' : 'Crear cuenta y acceder' }}
        </button>
      </div>
    </div>
  </div>
  `
})
export class PortalInviteComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  loading = true;
  success = false;
  error: string | null = null;
  showPasswordForm = false;
  userEmail = '';
  password = '';
  passwordConfirm = '';
  passwordError = '';
  submitting = false;
  private invitationToken = '';
  private invitationData: any = null;

  constructor() {
    this.handle();
  }

  private async handle() {
    let token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      const fragment = (window.location.hash || '').replace(/^#/, '');
      const hashParams = new URLSearchParams(fragment);
      token = hashParams.get('token') || token;
    }
    
    if (!token) {
      this.loading = false;
      this.error = 'Falta el token de invitación';
      return;
    }

    this.invitationToken = token;

    // Obtener datos de la invitación SIN necesidad de estar autenticado
    const invData = await this.getInvitationData(token);
    if (!invData) {
      this.loading = false;
      this.error = 'Invitación no válida o expirada';
      return;
    }

    this.invitationData = invData;
    this.userEmail = invData.email;
    this.loading = false;
    this.showPasswordForm = true;
  }

  private async getInvitationData(token: string): Promise<any> {
    try {
      // Usar cliente anónimo para lectura pública
      const { data, error } = await this.auth.client
        .from('company_invitations')
        .select('id, email, company_id, role, status')
        .eq('token', token)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching invitation:', error);
        return null;
      }
      
      if (!data) {
        console.warn('No invitation found for token');
        return null;
      }
      
      return data;
    } catch (e) {
      console.error('Exception fetching invitation:', e);
      return null;
    }
  }

  async submitPassword() {
    this.passwordError = '';
    
    if (!this.password || this.password.length < 6) {
      this.passwordError = 'La contraseña debe tener al menos 6 caracteres';
      return;
    }
    
    if (this.password !== this.passwordConfirm) {
      this.passwordError = 'Las contraseñas no coinciden';
      return;
    }

    this.submitting = true;

    try {
      // 1. Crear cuenta en Supabase Auth
      const { data: signUpData, error: signUpError } = await this.auth.client.auth.signUp({
        email: this.userEmail,
        password: this.password,
        options: {
          emailRedirectTo: `${window.location.origin}/portal`,
        }
      });

      if (signUpError) {
        // Si el usuario ya existe, intentar login
        if (signUpError.message.includes('already registered') || signUpError.status === 422) {
          const { data: signInData, error: signInError } = await this.auth.client.auth.signInWithPassword({
            email: this.userEmail,
            password: this.password,
          });

          if (signInError) {
            this.passwordError = 'Credenciales incorrectas o error al iniciar sesión';
            this.submitting = false;
            return;
          }
        } else {
          this.passwordError = signUpError.message || 'Error al crear la cuenta';
          this.submitting = false;
          return;
        }
      }

      // 2. Esperar un momento para que la sesión se establezca
      await new Promise(r => setTimeout(r, 500));

      // 3. Aceptar la invitación
      const res = await this.auth.acceptInvitation(this.invitationToken);
      if (!res.success) {
        this.passwordError = res.error || 'No se pudo aceptar la invitación';
        this.submitting = false;
        return;
      }

      // 4. Éxito: redirigir al portal
      this.success = true;
      this.showPasswordForm = false;
      setTimeout(() => this.router.navigate(['/portal']), 800);
    } catch (e: any) {
      this.passwordError = e?.message || 'Error inesperado';
      this.submitting = false;
    }
  }
}
