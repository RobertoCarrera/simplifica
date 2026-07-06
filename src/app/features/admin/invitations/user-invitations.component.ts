import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { PlanService } from '../../../services/plan.service';

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
            (ngModelChange)="onRoleChange()"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="member">Miembro</option>
            <option value="professional">Profesional</option>
            <option value="agent">Agente</option>
            <option value="marketer">Marketing</option>
            <option value="client">Cliente</option>
            <option value="admin">Administrador</option>
            <option value="supervisor">Supervisor</option>
            <option value="owner">Propietario</option>
          </select>
        </div>

        <!-- Plan inicial (solo para invitaciones de owner) -->
        <div *ngIf="invitation.role === 'owner'">
          <label for="targetTier" class="block text-sm font-medium text-gray-700 mb-1">
            Plan inicial de la nueva empresa
          </label>
          <select
            id="targetTier"
            [(ngModel)]="invitation.target_tier"
            name="target_tier"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option *ngIf="!isSuperAdmin()" value="free">Free</option>
            <option *ngFor="let plan of plans()" [value]="plan.id">
              {{ plan.name }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">
            Solo super_admin puede elegir un plan distinto a Free. La nueva empresa se creará directamente en este plan.
          </p>
        </div>

        <div class="flex gap-3">
          <button
            type="submit"
            [disabled]="!inviteForm.valid || isLoading()"
            class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
          >
            <i class="fas fa-paper-plane mr-2"></i>
            {{ isLoading() ? 'Enviando...' : 'Enviar Invitación' }}
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
export class UserInvitationsComponent implements OnInit {
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private planService = inject(PlanService);

  // Read-only signal exposed by PlanService; repointed at the cached list
  // so the template can iterate it without re-subscribing.
  plans = this.planService.plansSignal;

  isSuperAdmin = signal(false);

  invitation = {
    email: '',
    name: '',
    role: 'member',
    target_tier: 'free'
  };

  invitations: Array<{
    email: string;
    success: boolean;
    message?: string;
    error?: string;
    timestamp: Date;
  }> = [];

  isLoading = signal(false);
  showDebug = false; // Cambiar a true para ver debug info
  lastResult: any = null;

  ngOnInit(): void {
    // Detect super_admin via the user profile signal so the plan selector
    // becomes available without an extra round-trip. Fallback to fetching
    // plans if the signal cache is empty (cold start).
    const profile = this.authService.userProfileSignal();
    const isSa = !!(profile?.is_super_admin);
    this.isSuperAdmin.set(isSa);

    if (!this.plans()) {
      this.planService.getPlans().subscribe({
        next: () => { /* signal updated by service */ },
        error: () => { /* non-fatal: selector will just not show tiered options */ },
      });
    }
  }

  onRoleChange(): void {
    // Reset target_tier to 'free' whenever the role moves away from owner
    // so a stale tier never leaks into a non-owner invite.
    if (this.invitation.role !== 'owner') {
      this.invitation.target_tier = 'free';
    } else if (!this.isSuperAdmin()) {
      this.invitation.target_tier = 'free';
    }
  }

  async inviteUser() {
    if (!this.invitation.email || !this.invitation.name) {
      this.toastService.error('Campo requerido', 'Por favor completa todos los campos');
      return;
    }

    this.isLoading.set(true);

    try {
      // Edge Function path (send-company-invite): supports target_tier for
      // owner invites from a super_admin. The service forwards target_tier
      // only when role === 'owner' (see AuthService.sendCompanyInvite).
      const result = await this.authService.sendCompanyInvite({
        email: this.invitation.email,
        role: this.invitation.role,
        target_tier: this.invitation.role === 'owner' ? this.invitation.target_tier : undefined,
      });

      this.lastResult = { data: result, error: null };

      if (!result.success) {
        throw new Error(result.error || 'Error al invitar usuario');
      }

      const successMessage = this.invitation.role === 'owner'
        ? `Invitación enviada. La nueva empresa empezará en el plan "${this.invitation.target_tier}".`
        : 'Invitación enviada';

      this.toastService.success('¡Éxito!', result.info || successMessage);

      this.invitations.unshift({
        email: this.invitation.email,
        success: true,
        message: successMessage,
        timestamp: new Date()
      });

      this.clearForm();

    } catch (error: any) {
      console.error('Error inviting user:', error);

      const errorMessage = error?.message || 'Error al invitar usuario';
      this.toastService.error('Error', errorMessage);

      this.invitations.unshift({
        email: this.invitation.email,
        success: false,
        error: errorMessage,
        timestamp: new Date()
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  clearForm() {
    this.invitation = {
      email: '',
      name: '',
      role: 'member',
      target_tier: 'free'
    };
  }
}
