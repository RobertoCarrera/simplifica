import { Component, OnInit, computed, input, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../../../services/supabase-client.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

/** Admin/owner team members — always visible, never assignable */
interface CompanyMember {
  id: string; // company_member_id
  user_id: string;
  role_id: string;
  status: string;
  user?: {
    id: string;
    email: string;
    full_name?: string;
    name?: string;
    surname?: string;
  };
  role?: {
    id: string;
    name: string;
    label: string;
  };
}

/** Assignable professional from the `professionals` booking table */
interface ProfessionalRow {
  professionalId: string;       // professionals.id
  companyMemberId: string | null; // company_members.id (null if no account)
  displayName: string;
  avatarUrl?: string;
  roleName?: string;            // from company_members join
  is_assigned: boolean;
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
            <i class="fas fa-circle-notch fa-spin mr-2"></i> {{ 'clients.equipo.cargando' | transloco }}
          </div>
        }

        @if (!isLoading()) {
          <div class="space-y-4">
            <!-- Admins / Owners (always visible, not toggleable) -->
            @if (admins().length > 0) {
              <div class="space-y-2">
                <h3 class="text-xs font-uppercase font-bold text-slate-400 px-2">
                  {{ 'clients.equipo.accesoAdmin' | transloco }}
                </h3>
                @for (member of admins(); track member.id) {
                  <div
                    class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 opacity-75"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300"
                      >
                        {{ getAdminInitials(member) }}
                      </div>
                      <div>
                        <div class="font-medium text-slate-900 dark:text-slate-200">
                          {{ getAdminDisplayName(member) }}
                        </div>
                        <div class="text-xs text-slate-500">
                          {{ ('roles.' + (member.role?.name ?? '')) | transloco }}
                        </div>
                      </div>
                    </div>
                    <span
                      class="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      <i class="fas fa-lock mr-1"></i> {{ 'clients.equipo.global' | transloco }}
                    </span>
                  </div>
                }
              </div>
            }

            <!-- Assignable Professionals (from the booking/professionals table) -->
            <div class="space-y-2 pt-2">
              <h3 class="text-xs font-uppercase font-bold text-slate-400 px-2">
                {{ 'clients.equipo.profesionales' | transloco }}
              </h3>
              @if (professionals().length === 0) {
                <div
                  class="p-4 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm"
                >
                  {{ 'clients.equipo.sinMiembros' | transloco }}
                </div>
              }
              @for (prof of professionals(); track prof.professionalId) {
                <div
                  class="flex items-center justify-between p-3 rounded-lg border transition-colors group"
                  [ngClass]="{
                    'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30':
                      prof.is_assigned && prof.companyMemberId,
                    'border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30':
                      !prof.is_assigned && prof.companyMemberId,
                    'border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed':
                      !prof.companyMemberId,
                  }"
                  (click)="toggleAssignment(prof)"
                >
                  <div class="flex items-center gap-3">
                    <!-- Checkbox -->
                    <div
                      class="w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0"
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
                      class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300"
                    >
                      {{ getProfInitials(prof) }}
                    </div>
                    <div>
                      <div class="font-medium text-slate-900 dark:text-slate-200">
                        {{ prof.displayName }}
                      </div>
                      @if (!prof.companyMemberId) {
                        <div class="text-xs text-amber-500">
                          {{ 'clients.equipo.sinCuenta' | transloco }}
                        </div>
                      }
                    </div>
                  </div>
                  @if (prof.is_assigned) {
                    <span
                      class="text-xs font-medium text-blue-600 dark:text-blue-400 animate-fade-in"
                      >{{ 'clients.equipo.asignado' | transloco }}</span
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
              {{ isSaving() ? ('clients.equipo.guardando' | transloco) : ('clients.equipo.guardarCambios' | transloco) }}
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

  /** Admin/owner company members — always shown, not assignable */
  admins = signal<CompanyMember[]>([]);
  /** Professionals from the booking table — assignable */
  professionals = signal<ProfessionalRow[]>([]);

  isLoading = signal(true);
  isSaving = signal(false);

  /** Track original state to detect changes (keyed by companyMemberId) */
  private originalAssignments = new Set<string>();

  hasChanges = computed(() => {
    const current = new Set(
      this.professionals()
        .filter((p) => p.is_assigned && p.companyMemberId)
        .map((p) => p.companyMemberId as string),
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

      // 1. Fetch all active company members (for admins section + user_id → member_id map)
      const { data: membersData, error: membersError } = await this.supabase
        .from('company_members')
        .select('id, user_id, role_id, status, user:user_id(id, email, name, surname), role:role_id(name, label)')
        .eq('company_id', companyId)
        .in('status', ['active', 'pending', 'invited']);

      if (membersError) throw membersError;

      // 2. Fetch professionals (the booking/scheduling entities — true source of truth)
      const { data: profsData, error: profsError } = await this.supabase
        .from('professionals')
        .select('id, user_id, display_name, avatar_url, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('display_name');

      if (profsError) throw profsError;

      // 3. Fetch existing assignments for this client
      const { data: assignmentsData, error: assignError } = await this.supabase
        .from('client_assignments')
        .select('company_member_id')
        .eq('client_id', this.clientId());

      if (assignError) throw assignError;

      const assignedIds = new Set((assignmentsData || []).map((a: any) => a.company_member_id));
      this.originalAssignments = new Set(assignedIds);

      // Build user_id → company_member_id map (only for members with company accounts)
      const userIdToMemberId = new Map<string, string>(
        (membersData || []).map((m: any) => [m.user_id, m.id] as [string, string])
      );

      // 4. Admins — company members with elevated roles
      const mappedAdmins: CompanyMember[] = (membersData || [])
        .filter((m: any) => ['owner', 'admin', 'super_admin'].includes(m.role?.name || ''))
        .map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          role_id: m.role_id,
          status: m.status,
          user: m.user
            ? {
                id: m.user.id,
                email: m.user.email,
                full_name: `${m.user.name || ''} ${m.user.surname || ''}`.trim(),
                name: m.user.name,
                surname: m.user.surname,
              }
            : undefined,
          role: m.role,
        }));

      // 5. Professionals — from the professionals booking table
      const mappedProfessionals: ProfessionalRow[] = (profsData || []).map((p: any) => {
        const companyMemberId = p.user_id ? (userIdToMemberId.get(p.user_id) ?? null) : null;
        return {
          professionalId: p.id,
          companyMemberId,
          displayName: p.display_name || 'Profesional',
          avatarUrl: p.avatar_url,
          is_assigned: companyMemberId ? assignedIds.has(companyMemberId) : false,
        };
      });

      this.admins.set(mappedAdmins);
      this.professionals.set(mappedProfessionals);
    } catch (error) {
      console.error('Error loading team access:', error);
      this.toast.error(this.toast.t('toast.error'), this.toast.t('toast.clientTeamAccess.errorCargarEquipo'));
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleAssignment(prof: ProfessionalRow) {
    if (!prof.companyMemberId) return; // Can't assign without a company account
    this.professionals.update((list) =>
      list.map((p) =>
        p.professionalId === prof.professionalId ? { ...p, is_assigned: !p.is_assigned } : p
      )
    );
  }

  async saveChanges() {
    if (this.isSaving()) return;
    this.isSaving.set(true);

    try {
      const currentAssigned = this.professionals()
        .filter((p) => p.is_assigned && p.companyMemberId)
        .map((p) => p.companyMemberId as string);

      const toAdd = currentAssigned.filter((id) => !this.originalAssignments.has(id));
      const toRemove = Array.from(this.originalAssignments).filter(
        (id) => !currentAssigned.includes(id),
      );

      const promises = [];

      if (toAdd.length > 0) {
        const insertData = toAdd.map((mid) => ({
          client_id: this.clientId(),
          company_member_id: mid,
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
            .in('company_member_id', toRemove),
        );
      }

      await Promise.all(promises);

      this.toast.success(this.toast.t('toast.exito'), this.toast.t('toast.clientTeamAccess.asignacionesActualizadas'));
      this.originalAssignments = new Set(currentAssigned);
    } catch (error) {
      console.error('Error saving assignments:', error);
      this.toast.error(this.toast.t('toast.error'), this.toast.t('toast.clientTeamAccess.errorGuardarCambios'));
    } finally {
      this.isSaving.set(false);
    }
  }

  // Helpers
  getAdminDisplayName(m: CompanyMember): string {
    if (m.user?.full_name) return m.user.full_name;
    if (m.user?.name) return `${m.user.name} ${m.user?.surname || ''}`.trim();
    return m.user?.email || 'Usuario';
  }

  getAdminInitials(m: CompanyMember): string {
    const name = this.getAdminDisplayName(m).replace(/[^a-zA-Z ]/g, '');
    return name.substring(0, 2).toUpperCase();
  }

  getProfInitials(p: ProfessionalRow): string {
    return p.displayName
      .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0])
      .join('')
      .toUpperCase();
  }
}
