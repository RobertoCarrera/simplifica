import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { UserModulesService } from '../../../services/user-modules.service';
import { take } from 'rxjs/operators';


@Component({
  selector: 'app-company-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="space-y-6">
    <!-- Company Header Card -->
    <div class="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 sm:p-6 text-white shadow-lg">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 bg-white/20 backdrop-blur rounded-xl flex items-center justify-center">
          <i class="fas fa-building text-2xl"></i>
        </div>
        <div>
          <h2 class="text-2xl font-bold">{{ (auth.userProfile$ | async)?.company?.name || 'Mi Empresa' }}</h2>
          <div class="flex items-center gap-3 mt-1 text-emerald-100">
            <span class="flex items-center gap-1">
              <i class="fas fa-user-tag text-sm"></i>
              {{ getRoleLabel((auth.userProfile$ | async)?.role) }} 
              <span *ngIf="(auth.userProfile$ | async)?.is_super_admin" class="ml-1 text-xs bg-purple-500 text-white px-1.5 py-0.5 rounded-full">Super Admin</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <ng-container *ngIf="(auth.userProfile$ | async)?.role === 'owner' || (auth.userProfile$ | async)?.role === 'admin' || (auth.userProfile$ | async)?.is_super_admin; else noAccess">
      <!-- Sub-tabs Navigation -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 p-1">
        <nav class="flex gap-1">
          <button 
            (click)="tab='users'"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
            [class]="tab === 'users' 
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' 
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'">
            <i class="fas fa-users"></i>
            <span>Usuarios</span>
          </button>
          <button 
            (click)="tab='invites'"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
            [class]="tab === 'invites' 
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' 
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'">
            <i class="fas fa-envelope-open-text"></i>
            <span>Invitaciones</span>
            <span *ngIf="pendingInvitationsCount > 0" class="ml-1 px-2 py-0.5 text-xs bg-emerald-500 text-white rounded-full">
              {{ pendingInvitationsCount }}
            </span>
          </button>
        </nav>
      </div>

      <!-- Users Section -->
      <section *ngIf="tab==='users'" class="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div class="px-4 py-4 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <i class="fas fa-users text-emerald-500"></i>
            Usuarios de la Empresa
          </h3>
          <button 
            (click)="loadUsers()" 
            [disabled]="loadingUsers"
            class="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50">
            <i class="fas fa-sync-alt" [class.animate-spin]="loadingUsers"></i>
          </button>
        </div>
        
        <div class="p-4 sm:p-6">
          <!-- Loading State -->
          <div *ngIf="loadingUsers" class="flex items-center justify-center py-8">
            <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <i class="fas fa-spinner animate-spin text-xl"></i>
              <span>Cargando usuarios...</span>
            </div>
          </div>
          
          <!-- Empty State -->
          <div *ngIf="!loadingUsers && users.length===0" class="text-center py-8">
            <div class="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-user-slash text-2xl text-gray-400 dark:text-gray-500"></i>
            </div>
            <p class="text-gray-500 dark:text-gray-400">No hay usuarios en la empresa.</p>
          </div>
          
          <!-- Users List -->
          <div *ngIf="!loadingUsers && users.length > 0" class="space-y-3">
            <div *ngFor="let u of users" 
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all"
              [ngClass]="{
                'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800': isCurrentUser(u),
                'bg-gray-50 dark:bg-slate-700/50 border-gray-100 dark:border-slate-600': !isCurrentUser(u)
              }">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center"
                  [ngClass]="{
                    'bg-blue-100 dark:bg-blue-900/40': isCurrentUser(u),
                    'bg-emerald-100 dark:bg-emerald-900/40': !isCurrentUser(u)
                  }">
                  <i class="fas fa-user"
                    [ngClass]="{
                      'text-blue-600 dark:text-blue-400': isCurrentUser(u),
                      'text-emerald-600 dark:text-emerald-400': !isCurrentUser(u)
                    }"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium text-gray-900 dark:text-white">{{ u.name || 'Sin nombre' }}</p>
                    <span *ngIf="isCurrentUser(u)" class="px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded">
                      Tú
                    </span>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ u.email }}</p>
                </div>
              </div>
              
              <div class="flex items-center gap-3 ml-auto sm:ml-0">
                <!-- Role Select - with restrictions -->
                <select 
                  [(ngModel)]="u.role" 
                  (ngModelChange)="changeRole(u, $event)" 
                  [disabled]="busy || isCurrentUser(u) || !canChangeRole(u)"
                  class="px-3 py-1.5 text-sm bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  [title]="getRoleChangeTooltip(u)">
                  <option value="owner" [disabled]="!canAssignRole('owner')">Propietario</option>
                  <option value="admin" [disabled]="!canAssignRole('admin')">Administrador</option>
                  <option value="member">Miembro</option>
                  <option value="professional">Profesional</option>
                  <option value="agent">Agente</option>
                </select>
                
                <span 
                  class="px-2.5 py-1 text-xs font-medium rounded-full"
                  [class]="u.active 
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' 
                    : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-400'">
                  {{ u.active ? 'Activo' : 'Inactivo' }}
                </span>
                
                <!-- Toggle Active Button - disabled for self -->
                <button 
                  (click)="toggleActive(u)" 
                  [disabled]="busy || isCurrentUser(u) || !canToggleActive(u)"
                  class="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  [class]="u.active 
                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                    : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'"
                  [title]="getToggleActiveTooltip(u)">
                  <i class="fas" [class]="u.active ? 'fa-user-slash' : 'fa-user-check'"></i>
                </button>

                <!-- Manage Modules Button (New) -->
                <button 
                  (click)="openModuleModal(u)"
                  [disabled]="busy"
                  class="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                  title="Gestionar Módulos">
                  <i class="fas fa-cubes"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Invitations Section -->
      <section *ngIf="tab==='invites'" class="space-y-4">
        <!-- Invite Form Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 p-4 sm:p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <i class="fas fa-user-plus text-emerald-500"></i>
            Nueva Invitación
          </h3>
          
          <form class="flex flex-col md:flex-row gap-3" (ngSubmit)="sendInvite()">
            <div class="flex-1">
              <input 
                type="email"
                placeholder="email@ejemplo.com"
                [(ngModel)]="inviteForm.email" 
                name="email" 
                required
                class="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            </div>
            <select 
              [(ngModel)]="inviteForm.role" 
              name="role"
              class="px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed">
              <option value="member">Miembro</option>
              <option value="professional">Profesional</option>
              <option value="agent">Agente</option>
              <option value="admin">Administrador</option>
              <option value="owner">Propietario</option>
            </select>
            <input 
              type="text"
              placeholder="Mensaje (opcional)"
              [(ngModel)]="inviteForm.message" 
              name="message"
              class="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
            <button 
              type="submit" 
              [disabled]="busy || !inviteForm.email"
              class="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <i class="fas fa-paper-plane"></i>
              <span>Invitar</span>
            </button>
          </form>
          
            <!-- Help text about roles -->
            <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
              <i class="fas fa-info-circle mr-1"></i>
              <span *ngIf="currentUserRole === 'owner' || currentUserRole === 'admin'">Como {{ currentUserRole === 'owner' ? 'propietario' : 'administrador' }}, puedes invitar usuarios con rol Member u Owner.</span>
            </p>
          </div>
        
        <!-- Invitations List Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div class="px-4 py-4 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <i class="fas fa-envelope-open-text text-emerald-500"></i>
              Invitaciones
            </h3>
            <button 
              (click)="loadInvitations()" 
              [disabled]="loadingInvitations"
              class="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50">
              <i class="fas fa-sync-alt" [class.animate-spin]="loadingInvitations"></i>
            </button>
          </div>
          
          <div class="p-4 sm:p-6">
            <!-- Loading State -->
            <div *ngIf="loadingInvitations" class="flex items-center justify-center py-8">
              <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                <i class="fas fa-spinner animate-spin text-xl"></i>
                <span>Cargando invitaciones...</span>
              </div>
            </div>
            
            <!-- Empty State -->
            <div *ngIf="!loadingInvitations && invitations.length === 0" class="text-center py-8">
              <div class="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-inbox text-2xl text-gray-400 dark:text-gray-500"></i>
              </div>
              <p class="text-gray-500 dark:text-gray-400">No hay invitaciones.</p>
            </div>
            
            <!-- Invitations Table -->
            <div *ngIf="!loadingInvitations && invitations.length > 0" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-sm text-gray-600 dark:text-gray-400">
                    <thead class="bg-gray-50 dark:bg-slate-700/50 text-xs uppercase font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <tr>
                        <th class="px-4 py-3">Email</th>
                        <th class="px-4 py-3">Rol</th>
                        <th class="px-4 py-3">Estado</th>
                        <th class="px-4 py-3">Creada</th>
                        <th class="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                      <tr *ngFor="let inv of invitations" class="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          {{ inv.email }}
                        </td>
                        <td class="px-4 py-3">
                          <span class="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600">
                            {{ getRoleLabel(inv.role) }}
                          </span>
                        </td>
                        <td class="px-4 py-3">
                           <span class="px-2 py-0.5 rounded-full text-xs font-medium border"
                            [ngClass]="{
                              'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/50': getInvitationStatus(inv) === 'pending',
                              'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50': getInvitationStatus(inv) === 'accepted',
                              'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50': getInvitationStatus(inv) === 'rejected'
                            }">
                            {{ getStatusLabel(getInvitationStatus(inv)) }}
                          </span>
                        </td>
                        <td class="px-4 py-3">
                          {{ inv.created_at | date:'shortDate' }} <span class="text-xs text-gray-400">{{ inv.created_at | date:'shortTime' }}</span>
                        </td>
                        <td class="px-4 py-3 text-right space-x-2">
                          <ng-container *ngIf="getInvitationStatus(inv) === 'pending'">
                            <button 
                              (click)="resend(inv)" 
                              [disabled]="busy"
                              title="Reenviar invitación"
                              class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                              <i class="fas fa-redo"></i>
                            </button>
                            <button 
                              (click)="copyLink(inv)" 
                              [disabled]="busy"
                              title="Copiar enlace"
                              class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                              <i class="fas fa-link"></i>
                            </button>
                            <button 
                              (click)="cancelInvitation(inv.id)" 
                              [disabled]="busy"
                              title="Cancelar invitación"
                              class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              <i class="fas fa-trash-alt"></i>
                            </button>
                          </ng-container>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
            </div>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #noAccess>
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-6">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <i class="fas fa-lock text-amber-600 dark:text-amber-400 text-xl"></i>
          </div>
          <div>
            <h3 class="font-semibold text-amber-800 dark:text-amber-300">Acceso Restringido</h3>
            <p class="text-amber-700 dark:text-amber-400 text-sm mt-1">
              Solo el propietario o administrador de la empresa puede gestionar usuarios e invitaciones.
            </p>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- MODULES MODAL -->
    <div *ngIf="showModuleModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" (click)="closeModuleModal()"></div>
      <div class="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg p-6 animate-fade-in">
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <i class="fas fa-cubes text-purple-500"></i>
          Gestionar Módulos
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Asigna o revoca el acceso a módulos para <strong>{{ selectedUserForModules?.name }}</strong>.
        </p>

        <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
          <div *ngFor="let mod of availableModules" class="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <i class="fas fa-box"></i>
              </div>
              <span class="font-medium text-gray-700 dark:text-gray-300">{{ mod.name }}</span>
            </div>
            
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox"
                [checked]="isModuleEnabled(mod.key)"
                (change)="toggleModule(mod.key, $event)"
                class="sr-only peer">
              <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button (click)="closeModuleModal()" class="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>

  </div>
  `
})
export class CompanyAdminComponent implements OnInit {
  auth = inject(AuthService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  // Tabs
  tab: 'users' | 'invites' = 'users';

  // Users state
  users: any[] = [];
  loadingUsers = false;
  currentUserId: string | null = null;
  currentUserRole: 'owner' | 'admin' | 'member' | null = null;

  // Invitations state
  invitations: any[] = [];
  loadingInvitations = false;
  inviteForm = { email: '', role: 'member', message: '' };

  // Busy flag for actions
  busy = false;

  // Computed: pending invitations count
  get pendingInvitationsCount(): number {
    return this.invitations.filter(inv => this.getInvitationStatus(inv) === 'pending').length;
  }

  async ngOnInit() {
    // Get current user info
    const profile = await this.auth.userProfile$.pipe(take(1)).toPromise();
    this.currentUserId = profile?.id || null;
    this.currentUserRole = profile?.role as any || null;

    // Admin default role and message
    if (this.currentUserRole === 'admin') {
      this.inviteForm.role = 'owner';
      this.inviteForm.message = 'Hola! Te invito a registrar tu propia empresa en Simplifica. Haz clic en el enlace para crear tu cuenta de propietario.';
    }

    await Promise.all([this.loadUsers(), this.loadInvitations()]);
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  isCurrentUser(user: any): boolean {
    return user.id === this.currentUserId;
  }

  getInvitationStatus(inv: any): string {
    return inv.effective_status || inv.status || 'pending';
  }

  getRoleLabel(role: string | undefined): string {
    const labels: Record<string, string> = {
      'super_admin': 'Super Admin',
      'owner': 'Propietario',
      'admin': 'Administrador',
      'member': 'Miembro',
      'professional': 'Profesional',
      'agent': 'Agente'
    };
    return labels[role || ''] || role || 'Sin rol';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pendiente',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'expired': 'Expirada'
    };
    return labels[status] || status;
  }

  // ==========================================
  // PERMISSION CHECKS (UI hints - server validates)
  // ==========================================

  canAssignRole(role: string): boolean {
    // Both Owner and Admin can assign any role
    return true;
  }

  canChangeRole(user: any): boolean {
    if (this.isCurrentUser(user)) return false;
    // Admin cannot change owner's role
    if (this.currentUserRole === 'admin' && user.role === 'owner') return false;
    return true;
  }

  canToggleActive(user: any): boolean {
    if (this.isCurrentUser(user)) return false;
    // Admin cannot toggle owner's active status
    if (this.currentUserRole === 'admin' && user.role === 'owner') return false;
    return true;
  }

  getRoleChangeTooltip(user: any): string {
    if (this.isCurrentUser(user)) {
      return 'No puedes cambiar tu propio rol';
    }
    if (this.currentUserRole === 'admin' && user.role === 'owner') {
      return 'Un administrador no puede modificar el rol de un owner';
    }
    return '';
  }

  getToggleActiveTooltip(user: any): string {
    if (this.isCurrentUser(user)) {
      return 'No puedes desactivarte a ti mismo';
    }
    if (this.currentUserRole === 'admin' && user.role === 'owner') {
      return 'Un administrador no puede desactivar a un owner';
    }
    return user.active ? 'Desactivar usuario' : 'Activar usuario';
  }

  // ==========================================
  // DATA LOADING
  // ==========================================

  async loadUsers() {
    this.loadingUsers = true;
    try {
      const res = await this.auth.listCompanyUsers();
      if (res.success) this.users = res.users || [];
    } finally {
      this.loadingUsers = false;
    }
  }

  async loadInvitations() {
    this.loadingInvitations = true;
    try {
      const res = await this.auth.getCompanyInvitations();
      if (res.success) {
        this.invitations = res.invitations || [];
      } else {
        console.error('Error loading invitations:', res.error);
        // Only show error if it's not a "no company" expected error
        if (res.error !== 'Usuario sin empresa asignada') {
          this.toast.error('Error', 'Error cargando invitaciones: ' + res.error);
        }
      }
    } finally {
      this.loadingInvitations = false;
    }
  }

  // ==========================================
  // USER ACTIONS
  // ==========================================

  async changeRole(user: any, newRole: string) {
    // Store original role in case we need to revert
    const originalRole = user._originalRole || user.role;
    user._originalRole = originalRole;

    this.busy = true;
    try {
      const res = await this.auth.updateCompanyUser(user.id, { role: newRole as any });
      if (!res.success) {
        // Revert to original role
        user.role = originalRole;
        this.toast.error('Error', res.error || 'No se pudo actualizar el rol');
      } else {
        user._originalRole = newRole;
        this.toast.success('Éxito', 'Rol actualizado correctamente');
      }
    } catch (e: any) {
      user.role = originalRole;
      this.toast.error('Error', e.message || 'Error al actualizar rol');
    } finally {
      this.busy = false;
    }
  }

  async toggleActive(user: any) {
    this.busy = true;
    try {
      const res = await this.auth.updateCompanyUser(user.id, { active: !user.active });
      if (res.success) {
        user.active = !user.active;
        this.toast.success('Éxito', user.active ? 'Usuario activado' : 'Usuario desactivado');
      } else {
        this.toast.error('Error', res.error || 'No se pudo cambiar estado');
      }
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al cambiar estado');
    } finally {
      this.busy = false;
    }
  }

  // ==========================================
  // INVITATION ACTIONS
  // ==========================================

  async cancelInvitation(id: string) {
    if (!confirm('¿Estás seguro de que quieres cancelar esta invitación? El enlace dejará de funcionar.')) {
      return;
    }

    this.busy = true;
    try {
      const { error } = await this.auth.client
        .from('company_invitations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.toast.success('Éxito', 'Invitación cancelada correctamente');
      await this.loadInvitations();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al cancelar invitación');
    } finally {
      this.busy = false;
    }
  }

  async sendInvite() {
    if (!this.inviteForm.email) return;
    this.busy = true;
    try {
      const res = await this.auth.sendCompanyInvite({
        email: this.inviteForm.email,
        role: this.inviteForm.role,
        message: this.inviteForm.message || undefined,
      });
      if (!res.success) throw new Error(res.error || 'No se pudo enviar la invitación');
      this.toast.success('Éxito', 'Invitación enviada correctamente');
      this.inviteForm = { email: '', role: 'member', message: '' };
      await this.loadInvitations();
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al enviar invitación');
    } finally {
      this.busy = false;
    }
  }

  async resend(inv: any) {
    this.busy = true;
    try {
      const res = await this.auth.sendCompanyInvite({ email: inv.email, role: inv.role });
      if (!res.success) throw new Error(res.error || 'No se pudo reenviar');
      this.toast.success('Éxito', 'Invitación reenviada');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al reenviar invitación');
    } finally {
      this.busy = false;
    }
  }

  async copyLink(inv: any) {
    this.busy = true;
    try {
      const res = await this.auth.getInvitationLink(inv.id);
      if (!res.success || !res.url) throw new Error(res.error || 'No se pudo obtener enlace');
      await navigator.clipboard.writeText(res.url);
      this.toast.success('Éxito', 'Enlace copiado al portapapeles');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'Error al copiar enlace');
    } finally {
      this.busy = false;
    }
  }

  // ==========================================
  // MODULE MANAGEMENT
  // ==========================================
  showModuleModal = false;
  selectedUserModules: any[] = [];
  selectedUserForModules: any = null;

  // Catalogo de modulos (hardcoded for UI consistency)
  availableModules = [
    { key: 'moduloFacturas', name: 'Facturación' },
    { key: 'moduloPresupuestos', name: 'Presupuestos' },
    { key: 'moduloServicios', name: 'Servicios' },
    { key: 'moduloProductos', name: 'Productos y Material' },
    { key: 'moduloSAT', name: 'Tickets' },
    { key: 'moduloAnaliticas', name: 'Analíticas' },
    { key: 'moduloChat', name: 'Chat Interno' }
  ];

  userModulesService = inject(UserModulesService);

  async openModuleModal(user: any) {
    this.selectedUserForModules = user;
    this.showModuleModal = true;
    this.selectedUserModules = [];

    // Fetch directly from DB as we don't have listOtherUserModules yet
    try {
      const { data, error } = await this.auth.client
        .from('user_modules')
        .select('*')
        .eq('user_id', user.id);

      if (!error && data) {
        this.selectedUserModules = data;
      }
    } catch (e) {
      console.warn('Could not fetch user modules', e);
    }
  }

  closeModuleModal() {
    this.showModuleModal = false;
    this.selectedUserForModules = null;
  }

  isModuleEnabled(key: string): boolean {
    const mod = this.selectedUserModules.find(m => m.module_key === key);
    // If owner/admin, default to TRUE if strictly not disabled? 
    // Wait, the new logic says DEFAULT TRUE for Owners.
    // So if no record exists, it should be enabled?
    // Let's mirror the get_effective_modules logic approximately for UI display.
    if (!mod) {
      // If owner/admin and no record, default to true
      if (this.selectedUserForModules?.role === 'owner' || this.selectedUserForModules?.role === 'admin') return true;
      return false;
    }
    return (mod.status === 'activado' || mod.status === 'active' || mod.status === 'enabled');
  }

  async toggleModule(key: string, event: any) {
    if (!this.selectedUserForModules) return;

    const isChecked = event.target.checked;
    const status = isChecked ? 'activado' : 'desactivado';

    // Optimistic Update
    const idx = this.selectedUserModules.findIndex(m => m.module_key === key);
    if (idx >= 0) {
      this.selectedUserModules[idx].status = status;
    } else {
      this.selectedUserModules.push({ module_key: key, status });
    }

    try {
      await this.userModulesService.upsertForUser(this.selectedUserForModules.id, key, status);
    } catch (e) {
      this.toast.error('Error', 'No se pudo actualizar el permiso');
    }
  }
}
