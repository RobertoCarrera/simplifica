import { Component, OnInit, computed, input, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../../../services/supabase-client.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

interface TransferForm {
  targetProfessionalId: string | null;
  reason: string;
  isNewCase: boolean;
  removeSelf: boolean;
}

interface Professional {
  id: string; // professionals.id
  user_id: string | null;
  company_member_id: string | null; // company_members.id for RLS compatibility
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

          <!-- ─── ADMIN / OWNER MODE: full checkbox management ─── -->
          @if (!isProfessionalMode()) {
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
          }

          <!-- ─── PROFESSIONAL MODE: transfer / derivation UI ─── -->
          @if (isProfessionalMode()) {
            <div class="space-y-5">

              <!-- Current assigned team (read-only) -->
              @if (currentlyAssigned().length > 0) {
                <div class="space-y-2">
                  <h3 class="text-xs font-bold text-slate-400 uppercase px-1">
                    {{ 'clients.equipo.traspaso.asignadosActuales' | transloco }}
                  </h3>
                  @for (prof of currentlyAssigned(); track prof.id) {
                    <div
                      class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800"
                    >
                      <div
                        class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300"
                      >
                        {{ getInitials(prof) }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="font-medium text-slate-900 dark:text-slate-200 truncate">
                          {{ prof.display_name }}
                        </div>
                        <div class="text-xs text-slate-500">{{ prof.title || 'Profesional' }}</div>
                      </div>
                      @if (prof.user_id === currentUserId()) {
                        <span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                          Tú
                        </span>
                      }
                    </div>
                  }
                </div>
              }

              @if (!isCurrentUserAssigned()) {
                <!-- Current user is NOT assigned → show informational message only -->
                <div class="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <i class="fas fa-info-circle mt-0.5 flex-shrink-0"></i>
                  <span>{{ 'clients.equipo.traspaso.noAsignado' | transloco }}</span>
                </div>
              }

              @if (isCurrentUserAssigned()) {
                <!-- Transfer form -->
                <div class="space-y-4 border-t border-slate-100 dark:border-slate-700 pt-5">
                  <div>
                    <h3 class="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <i class="fas fa-share-alt text-blue-500"></i>
                      {{ 'clients.equipo.traspaso.titulo' | transloco }}
                    </h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {{ 'clients.equipo.traspaso.descripcion' | transloco }}
                    </p>
                  </div>

                  <!-- Target professional selector -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {{ 'clients.equipo.traspaso.selectProfesional' | transloco }}
                    </label>
                    <select
                      class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      [ngModel]="transferForm().targetProfessionalId"
                      (ngModelChange)="updateTransferField('targetProfessionalId', $event)"
                    >
                      <option [value]="null">— Seleccionar profesional —</option>
                      @for (prof of transferTargets(); track prof.id) {
                        <option [value]="prof.id">{{ prof.display_name }}</option>
                      }
                    </select>
                  </div>

                  <!-- Reason / motivo -->
                  <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {{ 'clients.equipo.traspaso.motivo' | transloco }}
                    </label>
                    <textarea
                      rows="3"
                      class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                      [placeholder]="'clients.equipo.traspaso.motivoPlaceholder' | transloco"
                      [ngModel]="transferForm().reason"
                      (ngModelChange)="updateTransferField('reason', $event)"
                    ></textarea>
                  </div>

                  <!-- Toggles row -->
                  <div class="flex flex-col sm:flex-row gap-3">
                    <!-- Is new case -->
                    <label class="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <div
                        class="relative w-10 h-5 rounded-full transition-colors"
                        [class.bg-blue-600]="transferForm().isNewCase"
                        [class.bg-slate-200]="!transferForm().isNewCase"
                        [class.dark:bg-slate-600]="!transferForm().isNewCase"
                        (click)="updateTransferField('isNewCase', !transferForm().isNewCase)"
                      >
                        <div
                          class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                          [class.translate-x-5]="transferForm().isNewCase"
                          [class.translate-x-0.5]="!transferForm().isNewCase"
                        ></div>
                      </div>
                      <span class="text-sm text-slate-700 dark:text-slate-300">
                        {{ 'clients.equipo.traspaso.esCasoNuevo' | transloco }}
                      </span>
                    </label>

                    <!-- Remove self -->
                    <label class="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <div
                        class="relative w-10 h-5 rounded-full transition-colors"
                        [class.bg-blue-600]="transferForm().removeSelf"
                        [class.bg-slate-200]="!transferForm().removeSelf"
                        [class.dark:bg-slate-600]="!transferForm().removeSelf"
                        (click)="updateTransferField('removeSelf', !transferForm().removeSelf)"
                      >
                        <div
                          class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                          [class.translate-x-5]="transferForm().removeSelf"
                          [class.translate-x-0.5]="!transferForm().removeSelf"
                        ></div>
                      </div>
                      <span class="text-sm text-slate-700 dark:text-slate-300">
                        {{ 'clients.equipo.traspaso.desasignarme' | transloco }}
                      </span>
                    </label>
                  </div>

                  <!-- Submit -->
                  <div class="flex justify-end pt-1">
                    <button
                      (click)="initiateTransfer()"
                      [disabled]="isTransferring() || !transferForm().targetProfessionalId"
                      class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i
                        class="fas"
                        [class.fa-spinner]="isTransferring()"
                        [class.fa-spin]="isTransferring()"
                        [class.fa-share-alt]="!isTransferring()"
                      ></i>
                      {{ isTransferring() ? 'Derivando...' : ('clients.equipo.traspaso.btnDerivar' | transloco) }}
                    </button>
                  </div>
                </div>
              }
            </div>
          }

        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientTeamAccessComponent implements OnInit {
  clientId = input.required<string>();
  companyId = input.required<string>();

  private supabase = inject(SupabaseClientService).instance;
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  professionals = signal<Professional[]>([]);
  isLoading = signal(true);
  isSaving = signal(false);
  isTransferring = signal(false);

  private originalAssignments = new Set<string>();

  // ── Mode detection ──────────────────────────────────────────────────────────
  isProfessionalMode = computed(() => {
    const role = this.auth.userRole();
    return !this.auth.isAdmin() && !['owner', 'admin', 'super_admin'].includes(role);
  });

  currentUserId = computed(() => this.auth.currentUser?.id ?? null);

  // ── Computed subsets ────────────────────────────────────────────────────────
  admins = computed(() => this.professionals().filter((p) => p.is_admin === true));

  assignableProfessionals = computed(() => this.professionals());

  currentlyAssigned = computed(() => this.professionals().filter((p) => p.is_assigned));

  isCurrentUserAssigned = computed(() => {
    const uid = this.currentUserId();
    if (!uid) return false;
    return this.professionals().some((p) => p.user_id === uid && p.is_assigned);
  });

  /** Possible transfer targets: active professionals excluding the current user */
  transferTargets = computed(() => {
    const uid = this.currentUserId();
    return this.professionals().filter((p) => p.user_id !== uid && p.is_active);
  });

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

  // ── Transfer form state ─────────────────────────────────────────────────────
  transferForm = signal<TransferForm>({
    targetProfessionalId: null,
    reason: '',
    isNewCase: false,
    removeSelf: true,
  });

  updateTransferField<K extends keyof TransferForm>(key: K, value: TransferForm[K]) {
    this.transferForm.update((f) => ({ ...f, [key]: value }));
  }

  ngOnInit() {
    this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const companyId = this.companyId();
      if (!companyId) throw new Error('No company context');

      const [
        { data: profsData, error: profsError },
        { data: adminsData },
        { data: assignmentsData, error: assignError },
      ] = await Promise.all([
        this.supabase
          .from('professionals')
          .select('id, user_id, display_name, email, title, is_active')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('display_name'),

        this.supabase
          .from('company_members')
          .select('id, user_id, role:app_roles!role_id(name, label)')
          .eq('company_id', companyId)
          .eq('status', 'active'),

        this.supabase
          .from('client_assignments')
          .select('professional_id')
          .eq('client_id', this.clientId()),
      ]);

      if (profsError) throw profsError;
      if (assignError) throw assignError;

      const adminUserIds = new Map<string, string>();
      const memberIds = new Map<string, string>();
      for (const m of adminsData || []) {
        memberIds.set(m.user_id, (m as any).id);
        const roleName = (m.role as any)?.name || '';
        if (['owner', 'admin', 'super_admin'].includes(roleName)) {
          adminUserIds.set(m.user_id, (m.role as any)?.label || 'Admin');
        }
      }

      const assignedIds = new Set(
        (assignmentsData || []).map((a: any) => a.professional_id).filter(Boolean),
      );
      this.originalAssignments = new Set(assignedIds);

      const mapped: Professional[] = (profsData || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        company_member_id: p.user_id ? (memberIds.get(p.user_id) ?? null) : null,
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
        const profMap = new Map(this.professionals().map((p) => [p.id, p]));
        const insertData = toAdd.map((pid) => ({
          client_id: this.clientId(),
          professional_id: pid,
          company_member_id: profMap.get(pid)?.company_member_id ?? null,
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

  async initiateTransfer() {
    const form = this.transferForm();
    if (!form.targetProfessionalId) {
      this.toast.warning('Atención', 'Debés seleccionar un profesional destino');
      return;
    }
    if (this.isTransferring()) return;
    this.isTransferring.set(true);

    try {
      const { data, error } = await this.supabase.rpc('transfer_client_assignment', {
        p_client_id:          this.clientId(),
        p_to_professional_id: form.targetProfessionalId,
        p_reason:             form.reason,
        p_is_new_case:        form.isNewCase,
        p_remove_self:        form.removeSelf,
      });

      if (error) throw error;
      if (data && data['success'] === false) throw new Error(data['error'] || 'Transfer failed');

      this.toast.success('Éxito', 'Cliente derivado correctamente');
      this.transferForm.set({ targetProfessionalId: null, reason: '', isNewCase: false, removeSelf: true });
      await this.loadData();
    } catch (error) {
      console.error('Error transferring client:', error);
      this.toast.error('Error', 'No se pudo derivar el cliente');
    } finally {
      this.isTransferring.set(false);
    }
  }

  getInitials(prof: Professional): string {
    const name = (prof.display_name || '').replace(/[^a-zA-ZÀ-ÿ ]/g, '');
    return name.substring(0, 2).toUpperCase();
  }
}
