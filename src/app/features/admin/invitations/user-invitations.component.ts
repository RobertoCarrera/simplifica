import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../../services/supabase.service';
import { ToastService } from '../../../services/toast.service';

interface InvitationResult {
  success: boolean;
  message?: string;
  error?: string;
  user_id?: string;
  debug?: any;
}

@Component({
  selector: 'app-user-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-2">
          <i class="fas fa-user-plus text-blue-600 mr-2"></i>
          Invitar Usuarios
        </h2>
        <p class="text-gray-600">
          Invita nuevos usuarios a tu empresa
        </p>
      </div>

      <!-- Formulario de Invitación -->
      <form (ngSubmit)="inviteUser()" #inviteForm="ngForm" class="space-y-4">
        <div>
          <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
            Email del Usuario
          </label>
          <input
            type="email"
            id="email"
            [(ngModel)]="invitation.email"
            name="email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="usuario@ejemplo.com"
          />
        </div>

        <div>
          <label for="name" class="block text-sm font-medium text-gray-700 mb-1">
            Nombre Completo
          </label>
          <input
            type="text"
            id="name"
            [(ngModel)]="invitation.name"
            name="name"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Juan Pérez"
          />
        </div>

        <div>
          <label for="role" class="block text-sm font-medium text-gray-700 mb-1">
            Rol del Usuario
          </label>
          <select
            id="role"
            [(ngModel)]="invitation.role"
            name="role"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="member">Miembro</option>
            <option value="admin">Administrador</option>
            <option value="owner">Propietario</option>
          </select>
        </div>

        <div class="flex gap-3">
          <button
            type="submit"
            [disabled]="!inviteForm.valid || isLoading"
            class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            <i class="fas fa-paper-plane mr-2"></i>
            {{ isLoading ? 'Enviando...' : 'Enviar Invitación' }}
          </button>
          
          <button
            type="button"
            (click)="clearForm()"
            class="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md transition-colors duration-200"
          >
            Limpiar
          </button>
        </div>
      </form>

      <!-- Lista de Invitaciones -->
      <div class="mt-8" *ngIf="invitations.length > 0">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          <i class="fas fa-list text-green-600 mr-2"></i>
          Invitaciones Enviadas
        </h3>
        
        <div class="space-y-3">
          <div
            *ngFor="let result of invitations"
            class="p-4 rounded-lg border"
            [ngClass]="{
              'border-green-200 bg-green-50': result.success,
              'border-red-200 bg-red-50': !result.success
            }"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <i
                    class="fas"
                    [ngClass]="{
                      'fa-check-circle text-green-600': result.success,
                      'fa-times-circle text-red-600': !result.success
                    }"
                  ></i>
                  <span class="font-medium">{{ result.email }}</span>
                  <span
                    class="px-2 py-1 text-xs rounded-full"
                    [ngClass]="{
                      'bg-green-100 text-green-800': result.success,
                      'bg-red-100 text-red-800': !result.success
                    }"
                  >
                    {{ result.success ? 'Enviada' : 'Error' }}
                  </span>
                </div>
                
                <p class="text-sm text-gray-600">
                  {{ result.success ? result.message : result.error }}
                </p>
                
                <div class="text-xs text-gray-500 mt-1">
                  {{ result.timestamp | date:'short' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Debug Info (solo en desarrollo) -->
      <div class="mt-6 p-4 bg-gray-100 rounded-lg" *ngIf="showDebug && lastResult">
        <h4 class="font-medium text-gray-900 mb-2">Debug Info:</h4>
        <pre class="text-xs text-gray-600 overflow-auto">{{ lastResult | json }}</pre>
      </div>
    </div>
  `,
  styles: [`
    .form-floating {
      position: relative;
    }
    
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  `]
})
export class UserInvitationsComponent {
  private supabaseService = inject(SupabaseService);
  private toastService = inject(ToastService);

  invitation = {
    email: '',
    name: '',
    role: 'member'
  };

  invitations: Array<{
    email: string;
    success: boolean;
    message?: string;
    error?: string;
    timestamp: Date;
  }> = [];

  isLoading = false;
  showDebug = false; // Cambiar a true para ver debug info
  lastResult: any = null;

  async inviteUser() {
    if (!this.invitation.email || !this.invitation.name) {
      this.toastService.error('Campo requerido', 'Por favor completa todos los campos');
      return;
    }

    this.isLoading = true;

    try {
      // Llamar a la función de Supabase
      const { data, error } = await this.supabaseService.executeFunction('invite_user_to_company', {
        user_email: this.invitation.email,
        user_name: this.invitation.name,
        user_role: this.invitation.role
      });

      this.lastResult = { data, error };

      if (error) {
        throw error;
      }

      // Si la función devuelve un JSON con success
      if (data && typeof data === 'object' && 'success' in data) {
        const result = data as any;
        if (result.success) {
          this.toastService.success('¡Éxito!', result.message || 'Usuario invitado correctamente');

          this.invitations.unshift({
            email: this.invitation.email,
            success: true,
            message: result.message,
            timestamp: new Date()
          });

          this.clearForm();
        } else {
          throw new Error(result.error || 'Error al invitar usuario');
        }
      } else {
        this.toastService.success('¡Éxito!', 'Usuario invitado correctamente');

        this.invitations.unshift({
          email: this.invitation.email,
          success: true,
          message: 'Invitación enviada',
          timestamp: new Date()
        });

        this.clearForm();
      }

    } catch (error: any) {
      console.error('Error inviting user:', error);

      const errorMessage = error.message || 'Error al invitar usuario';
      this.toastService.error('Error', errorMessage);

      this.invitations.unshift({
        email: this.invitation.email,
        success: false,
        error: errorMessage,
        timestamp: new Date()
      });
    } finally {
      this.isLoading = false;
    }
  }

  clearForm() {
    this.invitation = {
      email: '',
      name: '',
      role: 'member'
    };
  }
}
