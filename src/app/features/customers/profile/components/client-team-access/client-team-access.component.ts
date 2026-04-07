import { Component, OnInit, computed, input, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../../../services/supabase-client.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

interface Professional {
  id: string; // professionals.id
  user_id: string | null;
  display_name: string;
  email: string | null;
  title: string | null;
  is_active: boolean;
  is_admin?: boolean;       // derived: user is owner/admin in company_members
  admin_role_label?: string; // derived: 'Propietario', 'Admin', etc.
  is_assigned?: boolean;    // UI helper
}

@Component({
  selector: 'app-client-team-access',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  template: `
    <div class="space-y-6 animate-fade-in">
      <div
        class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm"
      >
        <header class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2
              class="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <i class="fas fa-users-cog text-blue-500"></i>
              {{ 'clients.equipo.titulo' | transloco }}
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {{ 'clients.equipo.descripcion' | transloco }}
            </p>
          </div>
        </header>

        @if (isLoading()) {
          <div class="py-8 text-center text-slate-500">
            <i class="fas fa-circle-notch fa-spin mr-2"></i> Cargando profesionales...
          </div>
        }

        @if (!isLoading()) {
          <div class="space-y-4">
            <!-- Admins / Owners (always visible, not assignable) -->
            @if (admins().length > 0) {
              <div class="space-y-2">
                <h3 class="text-xs font-uppercase font-bold text-slate-400 px-2">
                  Acceso Administrativo (Siempre Visible)
                </h3>
                @for (prof of admins(); track prof.id) {
                  <div
                    class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 opacity-75"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300"
                      >
                        {{ getInitials(prof) }}
                      </div>
                      <div>
                        <div class="font-medium text-slate-900 dark:text-slate-200">
                          {{ prof.display_name }}
                        </div>
                        <div class="text-xs text-slate-500">
                          {{ prof.admin_role_label || 'Admin' }}
                        </div>
                      </div>
                    </div>
                    <span
                      class="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      <i class="fas fa-lock mr-1"></i> Global
                    </span>
                  </div>
                }
              </div>
            }
            <!-- Assignable Professionals -->
            <div class="space-y-2 pt-2">
              <h3 class="text-xs font-uppercase font-bold text-slate-400 px-2">
                Profesionales y Miembros
              </h3>
              @if (assignableProfessionals().length === 0) {
                <div
                  class="p-4 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm"
                >
                  No hay profesionales disponibles para asignar.
                </div>
              }
              @for (prof of assignableProfessionals(); track prof.id) {
                <div
                  class="flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  [ngClass]="{
                    'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800':
                      prof.is_assigned,
                    'border-slate-200 dark:border-slate-700': !prof.is_assigned,
                  }"
                  (click)="toggleAssignment(prof)"
                >
                  <div class="flex items-center gap-3">
                    <!-- Checkbox -->
                    <div
                      class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
                      [ngClass]="{
                        'bg-blue-500 border-blue-500': prof.is_assigned,
                        'border-slate-300 dark:border-slate-600': !prof.is_assigned,
                      }"
                    >
                      @if (prof.is_assigned) {
                        <i class="fas fa-check text-white text-xs"></i>
                      }
                    </div>
                    <div
                      class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300"
                    >
                      {{ getInitials(prof) }}
                    </div>
                    <div>
                      <div class="font-medium text-slate-900 dark:text-slate-200">
                        {{ prof.display_name }}
                      </div>
                      <div class="text-xs text-slate-500">
                        {{ prof.title || 'Profesional' }}
                      </div>
                    </div>
                  </div>
                  @if (prof.is_assigned) {
                    <span
                      class="text-xs font-medium text-blue-600 dark:text-blue-400 animate-fade-in"
                      >Asignado</span
                    >
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (hasChanges()) {
          <div class="mt-6 flex justify-end border-t border-slate-100 dark:border-slate-700 pt-4">
            <button
              (click)="saveChanges()"
              [disabled]="isSaving()"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i
                class="fas"
                [class.fa-spinner]="isSaving()"
                [class.fa-spin]="isSaving()"
                [class.fa-save]="!isSaving()"
              ></i>
              {{ isSaving() ? 'Guardando...' : 'Guardar Cambios' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientTeamAccessComponent implements OnInit {
  clientId = input.required<string>();

  private supabase = inject(SupabaseClientService).instance;
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  professionals = signal<Professional[]>([]);
  isLoading = signal(true);
  isSaving = signal(false);

  private originalAssignments = new Set<string>();

  // Professionals whose user_id is an admin/owner in company_members
  admins = computed(() => this.professionals().filter((p) => p.is_admin === true));

  // All active professionals (admins included — they can be explicitly assigned
  // so that in professional mode they see only their assigned clients)
  assignableProfessionals = computed(() => this.professionals());

  hasChanges = computed(() => {
    const current = new Set(
      this.assignableProfessionals()
        .filter((p) => p.is_assigned)
        .map((p) => p.id),
    );
    if (current.size !== this.originalAssignments.size) return true;
    for (const id of current) {
      if (!this.originalAssignments.has(id)) return true;
    }
    return false;
  });

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const companyId = this.auth.currentCompanyId();
      if (!companyId) throw new Error('No company context');

      // Fire all 3 independent queries in parallel
      const [
        { data: profsData, error: profsError },
        { data: adminsData },
        { data: assignmentsData, error: assignError },
      ] = await Promise.all([
        // 1. Fetch all active professionals for this company
        this.supabase
          .from('professionals')
          .select('id, user_id, display_name, email, title, is_active')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('display_name'),

        // 2. Fetch admin/owner company_members to mark professionals with admin roles
        this.supabase
          .from('company_members')
          .select('user_id, role:app_roles!role_id(name, label)')
          .eq('company_id', companyId)
          .eq('status', 'active'),

        // 3. Fetch existing assignments for this client
        this.supabase
          .from('client_assignments')
          .select('professional_id')
          .eq('client_id', this.clientId()),
      ]);

      if (profsError) throw profsError;
      if (assignError) throw assignError;

      const adminUserIds = new Map<string, string>(); // user_id → role label
      for (const m of adminsData || []) {
        const roleName = (m.role as any)?.name || '';
        if (['owner', 'admin', 'super_admin'].includes(roleName)) {
          adminUserIds.set(m.user_id, (m.role as any)?.label || 'Admin');
        }
      }

      const assignedIds = new Set(
        (assignmentsData || []).map((a: any) => a.professional_id).filter(Boolean),
      );
      this.originalAssignments = new Set(assignedIds);

      // Map and merge
      const mapped: Professional[] = (profsData || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        display_name: p.display_name || p.email || 'Sin nombre',
        email: p.email,
        title: p.title,
        is_active: p.is_active,
        is_admin: p.user_id ? adminUserIds.has(p.user_id) : false,
        admin_role_label: p.user_id ? adminUserIds.get(p.user_id) : undefined,
        is_assigned: assignedIds.has(p.id),
      }));

      this.professionals.set(mapped);
    } catch (error) {
      console.error('Error loading team access:', error);
      this.toast.error('Error', 'Error al cargar el equipo');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleAssignment(prof: Professional) {
    this.professionals.update((current) =>
      current.map((p) => (p.id === prof.id ? { ...p, is_assigned: !p.is_assigned } : p)),
    );
  }

  async saveChanges() {
    if (this.isSaving()) return;
    this.isSaving.set(true);

    try {
      const currentAssigned = this.assignableProfessionals()
        .filter((p) => p.is_assigned)
        .map((p) => p.id);

      const toAdd = currentAssigned.filter((id) => !this.originalAssignments.has(id));
      const toRemove = Array.from(this.originalAssignments).filter(
        (id) => !currentAssigned.includes(id),
      );

      const promises = [];

      if (toAdd.length > 0) {
        const insertData = toAdd.map((pid) => ({
          client_id: this.clientId(),
          professional_id: pid,
          assigned_by: this.auth.userProfileSignal()?.id,
        }));
        promises.push(this.supabase.from('client_assignments').insert(insertData));
      }

      if (toRemove.length > 0) {
        promises.push(
          this.supabase
            .from('client_assignments')
            .delete()
            .eq('client_id', this.clientId())
            .in('professional_id', toRemove),
        );
      }

      await Promise.all(promises);

      this.toast.success('Éxito', 'Asignaciones actualizadas');
      this.originalAssignments = new Set(currentAssigned);
    } catch (error) {
      console.error('Error saving assignments:', error);
      this.toast.error('Error', 'Error al guardar cambios');
    } finally {
      this.isSaving.set(false);
    }
  }

  getInitials(prof: Professional): string {
    const name = (prof.display_name || '').replace(/[^a-zA-ZÀ-ÿ ]/g, '');
    return name.substring(0, 2).toUpperCase();
  }
}
