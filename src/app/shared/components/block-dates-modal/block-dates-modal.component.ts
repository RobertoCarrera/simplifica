import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { BlockDatesModalService, BlockMode, BlockDateFormData } from '../../../services/block-dates-modal.service';
import { ProfessionalBlockedDatesService } from '../../../services/professional-blocked-dates.service';
import { ServiceBlockedDatesService } from '../../../services/service-blocked-dates.service';
import { SupabaseProfessionalsService, Professional } from '../../../services/supabase-professionals.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';

interface ServiceOption {
  id: string;
  name: string;
  category?: string;
  base_price?: number;
}

@Component({
  selector: 'app-block-dates-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (blockDatesService.showModal()) {
      <div class="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" (click)="blockDatesService.close()">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <i class="fas fa-calendar-times text-red-500"></i> {{ isServiceMode() ? 'Bloquear Servicio' : ('agenda.blockDatesTitle' | transloco) }}
            </h3>
            <button (click)="blockDatesService.close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <i class="fas fa-times text-lg"></i>
            </button>
          </div>

          <div class="p-6 space-y-4">
            <!-- Block mode toggle -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de bloqueo</label>
              <div class="flex rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600">
                <button type="button"
                  class="flex-1 py-2 text-sm font-medium transition-colors"
                  [ngClass]="!isServiceMode()
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  (click)="setMode('professional')">
                  <i class="fas fa-user mr-1"></i> Profesional
                </button>
                <button type="button"
                  class="flex-1 py-2 text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600"
                  [ngClass]="isServiceMode()
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  (click)="setMode('service')">
                  <i class="fas fa-concierge-bell mr-1"></i> Servicio
                </button>
              </div>
            </div>

            <!-- Professional selector (professional mode) -->
            @if (!isServiceMode() && !isProfessional()) {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profesional</label>
                <select
                  [ngModel]="blockDatesService.formData().professionalId"
                  (ngModelChange)="blockDatesService.updateField('professionalId', $event)"
                  class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">-- Selecciona un profesional --</option>
                  @for (prof of professionals(); track prof.id) {
                    <option [value]="prof.id">{{ prof.display_name }}</option>
                  }
                </select>
              </div>
            }

            <!-- Service selector (service mode) -->
            @if (isServiceMode()) {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Servicio</label>
                <select
                  [ngModel]="blockDatesService.formData().serviceId"
                  (ngModelChange)="blockDatesService.updateField('serviceId', $event)"
                  class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option value="">-- Selecciona un servicio --</option>
                  @for (svc of services(); track svc.id) {
                    <option [value]="svc.id">{{ svc.name }}{{ svc.category ? ' (' + svc.category + ')' : '' }}</option>
                  }
                </select>
                @if (isServiceMode()) {
                  <p class="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    <i class="fas fa-info-circle"></i> Todos los profesionales que realizan este servicio quedarán bloqueados.
                  </p>
                }
              </div>
            }

            <!-- Date range -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'agenda.from' | transloco }}</label>
                <input type="date"
                  [ngModel]="blockDatesService.formData().startDate"
                  (ngModelChange)="blockDatesService.updateField('startDate', $event)"
                  class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'agenda.to' | transloco }}</label>
                <input type="date"
                  [ngModel]="blockDatesService.formData().endDate"
                  (ngModelChange)="blockDatesService.updateField('endDate', $event)"
                  class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              </div>
            </div>

            <!-- All day switch -->
            <div class="flex items-center gap-3">
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" 
                  class="sr-only peer"
                  [ngModel]="blockDatesService.formData().allDay"
                  (ngModelChange)="blockDatesService.updateField('allDay', $event)" />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ 'agenda.allDay' | transloco }}</span>
            </div>

            <!-- Time range (hidden when allDay is ON) -->
            @if (!blockDatesService.formData().allDay) {
              <div class="grid grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'agenda.startTime' | transloco }}</label>
                  <input type="time"
                    [ngModel]="blockDatesService.formData().startTime"
                    (ngModelChange)="blockDatesService.updateField('startTime', $event)"
                    class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'agenda.endTime' | transloco }}</label>
                  <input type="time"
                    [ngModel]="blockDatesService.formData().endTime"
                    (ngModelChange)="blockDatesService.updateField('endTime', $event)"
                    class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
              </div>
            }

            <!-- Reason -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{{ 'agenda.reason' | transloco }}</label>
              <input type="text"
                [ngModel]="blockDatesService.formData().reason"
                (ngModelChange)="blockDatesService.updateField('reason', $event)"
                [placeholder]="'agenda.reasonPlaceholder' | transloco"
                class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            </div>

            <!-- Save button -->
            <button
              (click)="save()"
              [disabled]="saving() || !canSave()"
              class="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
              @if (saving()) {
                <i class="fas fa-spinner fa-spin"></i> {{ 'agenda.saving' | transloco }}
              } @else {
                <i class="fas fa-lock"></i> {{ blockDatesService.editingBlockId() ? ('agenda.updateBlock' | transloco) : ('agenda.blockDatesBtn' | transloco) }}
              }
            </button>
            @if (blockDatesService.editingBlockId()) {
              <button
                (click)="blockDatesService.resetForm()"
                class="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                {{ 'agenda.cancelEdit' | transloco }}
              </button>
            }
          </div>

          <!-- Existing blocked dates list -->
          @if (professionalBlocks().length > 0 || serviceBlocks().length > 0) {
            <div class="px-6 pb-6">
              <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <i class="fas fa-list"></i> {{ 'agenda.activeBlocks' | transloco }}
              </h4>
              <div class="space-y-2 max-h-48 overflow-y-auto">
                <!-- Professional blocks -->
                @for (block of professionalBlocks(); track 'p-' + block.id) {
                  <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        @if (block.reason) {
                          <div class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                            <i class="fas fa-user text-red-400 mr-1"></i>
                            {{ block.reason }}
                          </div>
                          <div class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                            {{ block.start_date }} → {{ block.end_date }}
                            @if (block.start_time) { · {{ block.start_time }} - {{ block.end_time }} }
                          </div>
                        } @else {
                          <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            <i class="fas fa-user text-red-400 mr-1"></i>
                            {{ getProfessionalName(block.professional_id) }}
                          </div>
                          <div class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                            {{ block.start_date }} → {{ block.end_date }}
                            @if (block.start_time) { · {{ block.start_time }} - {{ block.end_time }} }
                          </div>
                        }
                      </div>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <button (click)="editProfessionalBlock(block)" class="text-blue-500 hover:text-blue-700" [title]="'agenda.editBlock' | transloco">
                          <i class="fas fa-pen text-xs"></i>
                        </button>
                        <button (click)="removeProfessionalBlock(block.id)" class="text-red-500 hover:text-red-700" [title]="'agenda.deleteBlock' | transloco">
                          <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                }
                <!-- Service blocks -->
                @for (block of serviceBlocks(); track 's-' + block.id) {
                  <div class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        @if (block.reason) {
                          <div class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">
                            <i class="fas fa-concierge-bell text-orange-400 mr-1"></i>
                            {{ block.reason }}
                          </div>
                          <div class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                            {{ getServiceName(block.service_id) }} · {{ block.start_date }} → {{ block.end_date }}
                            @if (block.start_time) { · {{ block.start_time }} - {{ block.end_time }} }
                          </div>
                        } @else {
                          <div class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            <i class="fas fa-concierge-bell text-orange-400 mr-1"></i>
                            {{ getServiceName(block.service_id) }}
                            <span class="text-[10px] text-orange-500 font-normal ml-1">(servicio completo)</span>
                          </div>
                          <div class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                            {{ block.start_date }} → {{ block.end_date }}
                            @if (block.start_time) { · {{ block.start_time }} - {{ block.end_time }} }
                          </div>
                        }
                      </div>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <button (click)="editServiceBlock(block)" class="text-blue-500 hover:text-blue-700" [title]="'agenda.editBlock' | transloco">
                          <i class="fas fa-pen text-xs"></i>
                        </button>
                        <button (click)="removeServiceBlock(block.id)" class="text-orange-500 hover:text-orange-700" [title]="'agenda.deleteBlock' | transloco">
                          <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class BlockDatesModalComponent {
  blockDatesService = inject(BlockDatesModalService);
  private blockedDatesService = inject(ProfessionalBlockedDatesService);
  private serviceBlockedDatesService = inject(ServiceBlockedDatesService);
  private professionalsService = inject(SupabaseProfessionalsService);
  authService = inject(AuthService);
  private supabaseClient = inject(SupabaseClientService);

  professionals = signal<Professional[]>([]);
  services = signal<ServiceOption[]>([]);
  professionalBlocks = signal<any[]>([]);
  serviceBlocks = signal<any[]>([]);
  saving = signal(false);

  isProfessional = computed(() => this.authService.userRole() === 'professional');
  isServiceMode = computed(() => this.blockDatesService.formData().blockMode === 'service');
  canSave = computed(() => {
    const form = this.blockDatesService.formData();
    if (!form.startDate || !form.endDate) return false;
    if (this.isServiceMode()) {
      return !!form.serviceId;
    }
    return !!form.professionalId;
  });

  constructor() {
    this.loadProfessionals();
    this.loadServices();
    this.loadAllBlockedDates();
  }

  open(formData?: Partial<BlockDateFormData>) {
    this.blockDatesService.open(formData);
    if (this.isProfessional()) {
      const activeProfId = (this.authService as any).activeProfessionalId?.();
      if (activeProfId) {
        this.blockDatesService.updateField('professionalId', activeProfId);
      }
    }
  }

  setMode(mode: BlockMode) {
    this.blockDatesService.setBlockMode(mode);
  }

  private async loadProfessionals() {
    const cid = this.authService.currentCompanyId();
    if (!cid) return;
    const profs = await firstValueFrom(this.professionalsService.getProfessionals(cid));
    this.professionals.set(profs);
  }

  private async loadServices() {
    const cid = this.authService.currentCompanyId();
    if (!cid) return;
    // Fetch services from the company
    const { data, error } = await this.supabaseClient.instance
      .from('services')
      .select('id, name, category, base_price')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('name');
    if (!error && data) {
      this.services.set(data as ServiceOption[]);
    }
  }

  private loadAllBlockedDates() {
    this.blockedDatesService.getBlockedDates().subscribe({
      next: (dates) => this.professionalBlocks.set(dates),
      error: (err) => console.error('Error loading professional blocked dates:', err),
    });
    this.serviceBlockedDatesService.getBlockedDates().subscribe({
      next: (dates) => this.serviceBlocks.set(dates),
      error: (err) => console.error('Error loading service blocked dates:', err),
    });
  }

  getProfessionalName(professionalId: string): string {
    const prof = this.professionals().find(p => p.id === professionalId);
    return prof?.display_name ?? professionalId;
  }

  getServiceName(serviceId: string): string {
    const svc = this.services().find(s => s.id === serviceId);
    return svc?.name ?? serviceId;
  }

  async save() {
    const form = this.blockDatesService.formData();
    if (!this.canSave()) return;

    this.saving.set(true);
    try {
      if (this.isServiceMode()) {
        const payload = {
          service_id: form.serviceId,
          start_date: form.startDate,
          end_date: form.endDate,
          reason: form.reason || undefined,
          all_day: form.allDay,
          start_time: form.allDay ? undefined : (form.startTime || undefined),
          end_time: form.allDay ? undefined : (form.endTime || undefined),
        };
        if (form.editingId) {
          await this.serviceBlockedDatesService.updateBlockedDate(form.editingId, payload);
        } else {
          await this.serviceBlockedDatesService.createBlockedDate(payload);
        }
      } else {
        // Professional-level block (existing behavior)
        const payload = {
          professional_id: form.professionalId,
          start_date: form.startDate,
          end_date: form.endDate,
          reason: form.reason || undefined,
          all_day: form.allDay,
          start_time: form.allDay ? undefined : (form.startTime || undefined),
          end_time: form.allDay ? undefined : (form.endTime || undefined),
        };
        if (form.editingId) {
          await this.blockedDatesService.updateBlockedDate(form.editingId, payload);
        } else {
          await this.blockedDatesService.createBlockedDate(payload);
        }
      }
      this.blockDatesService.close();
      this.loadAllBlockedDates();
    } catch (e) {
      console.error('Error saving blocked date:', e);
    } finally {
      this.saving.set(false);
    }
  }

  editProfessionalBlock(block: any) {
    this.blockDatesService.open(
      {
        blockMode: 'professional',
        professionalId: block.professional_id,
        serviceId: '',
        startDate: block.start_date,
        endDate: block.end_date,
        startTime: block.start_time || '09:00',
        endTime: block.end_time || '18:00',
        reason: block.reason || '',
        allDay: !!block.all_day,
      },
      { id: block.id },
    );
  }

  editServiceBlock(block: any) {
    this.blockDatesService.open(
      {
        blockMode: 'service',
        serviceId: block.service_id,
        professionalId: '',
        startDate: block.start_date,
        endDate: block.end_date,
        startTime: block.start_time || '09:00',
        endTime: block.end_time || '18:00',
        reason: block.reason || '',
        allDay: !!block.all_day,
      },
      { id: block.id },
    );
  }

  async removeProfessionalBlock(id: string) {
    try {
      await this.blockedDatesService.deleteBlockedDate(id);
      this.loadAllBlockedDates();
    } catch (e) {
      console.error('Error removing professional blocked date:', e);
    }
  }

  async removeServiceBlock(id: string) {
    try {
      await this.serviceBlockedDatesService.deleteBlockedDate(id);
      this.loadAllBlockedDates();
    } catch (e) {
      console.error('Error removing service blocked date:', e);
    }
  }
}
