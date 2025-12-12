import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

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
        <p class="text-green-800 dark:text-green-200">¡Contraseña creada! Redirigiendo al login...</p>
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
          {{ submitting ? 'Creando contraseña...' : 'Crear contraseña' }}
        </button>

        <p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          Después de crear tu contraseña, podrás iniciar sesión en el portal
        </p>
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
    // 1. Primero manejar magic link si existe (viene del email)
    try {
      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
      const hashParams = new URLSearchParams(fragment);

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Establecer sesión desde el magic link
        await this.auth.client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        // Limpiar hash para evitar reprocesamiento
        history.replaceState({}, document.title, window.location.pathname + window.location.search);

        // Esperar un momento para que la sesión se establezca
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      console.warn('Error processing magic link:', e);
    }

    // 2. Obtener el token de invitación
    let token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      const fragment = (window.location.hash || '').replace(/^#/, '');
      const hashParams = new URLSearchParams(fragment);
      token = hashParams.get('token') || token;
    }

    if (!token) {
      // Si no hay token, intentar obtener el email de la sesión actual
      const { data: { user } } = await this.auth.client.auth.getUser();
      if (user?.email) {
        // Buscar invitación pendiente por email
        const invData = await this.getInvitationByEmail(user.email);
        if (invData) {
          this.invitationToken = invData.token;
          this.invitationData = invData;
          this.userEmail = invData.email;
          this.loading = false;
          this.showPasswordForm = true;
          return;
        }
      }

      this.loading = false;
      this.error = 'Falta el token de invitación';
      return;
    }

    this.invitationToken = token;

    // 3. Obtener datos de la invitación
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

  private async getInvitationByEmail(email: string): Promise<any> {
    try {
      const { data, error } = await this.auth.client
        .from('company_invitations')
        .select('id, email, company_id, role, status, token')
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
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
      // Verificar si ya hay una sesión activa del magic link
      const { data: { user: existingUser } } = await this.auth.client.auth.getUser();

      if (existingUser) {
        // Usuario ya tiene sesión del magic link, solo necesita configurar contraseña
        const { error: updateError } = await this.auth.client.auth.updateUser({
          password: this.password
        });

        if (updateError) {
          this.passwordError = updateError.message || 'Error al configurar la contraseña';
          this.submitting = false;
          return;
        }
      } else {
        // No hay sesión - usar Edge Function para crear usuario con email confirmado
        const response = await fetch(`${environment.supabase.url}/functions/v1/create-invited-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${environment.supabase.anonKey}`,
            'apikey': environment.supabase.anonKey
          },
          body: JSON.stringify({
            email: this.userEmail,
            password: this.password,
            invitation_token: this.invitationToken
          })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          this.passwordError = result.error || 'Error al crear la cuenta';
          this.submitting = false;
          return;
        }
      }

      // Esperar un momento para que la sesión se establezca
      await new Promise(r => setTimeout(r, 500));

      // Aceptar la invitación
      const res = await this.auth.acceptInvitation(this.invitationToken);
      if (!res.success) {
        // Invitación ya aceptada o error menor, continuar de todas formas
        console.warn('Invitation acceptance warning:', res.error);
      }

      // Éxito: cerrar sesión y redirigir a login para que pruebe su contraseña
      await this.auth.client.auth.signOut();
      this.success = true;
      this.showPasswordForm = false;

      setTimeout(() => {
        this.router.navigate(['/login'], {
          queryParams: {
            email: this.userEmail,
            message: 'Contraseña creada correctamente. Inicia sesión con tus credenciales.'
          }
        });
      }, 800);
    } catch (e: any) {
      this.passwordError = e?.message || 'Error inesperado';
      this.submitting = false;
    }
  }
}
