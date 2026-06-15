import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SimpleSupabaseService } from '../../../../../services/simple-supabase.service';
import { ToastService } from '../../../../../services/toast.service';
import { SupabaseModulesService } from '../../../../../services/supabase-modules.service';

export interface ContractedService {
  id: string;
  client_id: string;
  company_id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  start_date: string;
  status: 'active' | 'paused' | 'cancelled';
  recurrence_type?: 'monthly' | 'weekly' | 'yearly' | null;
  recurrence_day?: number | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface AvailableService {
  id: string;
  name: string;
  description?: string | null;
  base_price?: number | null;
  category?: string | null;
  is_active?: boolean;
  is_public?: boolean;
  is_bookable?: boolean;
  allow_direct_contracting?: boolean;
  has_variants?: boolean;
  display_price?: number | null;
  display_price_label?: string | null;
}

@Component({
  selector: 'app-client-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">Servicios contratados</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Asigna servicios al cliente. El cliente los verá en su portal.
          </p>
        </div>
        <button
          (click)="openAssignModal()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Asignar servicio
        </button>
      </div>

      <!-- Active list -->
      @if (loading()) {
        <div class="text-center text-sm text-gray-500 py-6">Cargando servicios contratados…</div>
      } @else if (contracted().length === 0) {
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-700 p-8 text-center">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Este cliente no tiene servicios contratados todavía.
          </p>
        </div>
      } @else {
        <div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
            <thead class="bg-gray-50 dark:bg-slate-900/50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Servicio</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Inicio</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recurrencia</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Precio</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-slate-700">
              @for (c of contracted(); track c.id) {
                <tr>
                  <td class="px-4 py-3 text-sm">
                    <div class="font-medium text-gray-900 dark:text-white">{{ c.name }}</div>
                    @if (c.description) {
                      <div class="text-xs text-gray-500 line-clamp-1">{{ c.description }}</div>
                    }
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {{ c.start_date | date: 'mediumDate' }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    @if (c.recurrence_type) {
                      <div class="flex flex-col text-xs">
                        <span class="font-medium">{{ recurrenceLabel(c.recurrence_type) }}</span>
                        @if (c.recurrence_day) {
                          <span class="text-gray-500">día {{ c.recurrence_day }}</span>
                        }
                      </div>
                    } @else {
                      <span class="text-gray-400">Puntual</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-sm">
                    <span [class]="statusClass(c.status)">
                      {{ statusLabel(c.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                    {{ formatPrice(c.price) }} {{ c.currency }}
                  </td>
                  <td class="px-4 py-3 text-sm text-right">
                    <div class="flex items-center justify-end gap-2">
                      @if (c.status === 'active') {
                        <button
                          (click)="updateStatus(c, 'paused')"
                          class="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
                          title="Pausar"
                        >
                          Pausar
                        </button>
                      } @else if (c.status === 'paused') {
                        <button
                          (click)="updateStatus(c, 'active')"
                          class="text-xs text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
                          title="Reanudar"
                        >
                          Reanudar
                        </button>
                      }
                      <button
                        (click)="cancelContract(c)"
                        class="text-xs text-red-500 hover:text-red-700"
                        title="Cancelar"
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ASSIGN MODAL -->
      @if (assignModalOpen()) {
        <div
          class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          (click)="closeAssignModal()"
        >
          <div
            class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            (click)="$event.stopPropagation()"
          >
            <header class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">Asignar servicio</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Selecciona uno de los servicios visibles y contratables de tu catálogo.
                </p>
              </div>
              <button
                (click)="closeAssignModal()"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title="Cerrar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <!-- Search -->
            <input
              type="text"
              [(ngModel)]="modalSearch"
              (ngModelChange)="modalSearch = $event"
              placeholder="Buscar servicio por nombre…"
              class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
            />

            @if (loadingAvailable()) {
              <div class="text-center text-sm text-gray-500 py-6">Cargando catálogo…</div>
            } @else if (filteredAvailable().length === 0) {
              <div class="text-center text-sm text-gray-500 py-6">
                No hay servicios disponibles que coincidan.
              </div>
            } @else {
              <ul class="space-y-2 max-h-96 overflow-y-auto pr-1">
                @for (s of filteredAvailable(); track s.id) {
                  <li class="flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-sm text-gray-900 dark:text-white">{{ s.name }}</div>
                      @if (s.description && !isLikelyUuid(s.description)) {
                        <div class="text-xs text-gray-500 line-clamp-1">{{ s.description }}</div>
                      }
                      <div class="text-xs text-gray-400 mt-1">
                        @if (s.category) {
                          <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">{{ s.category }}</span>
                        }
                        @if (s.base_price != null) {
                          <span class="ml-2 font-medium">{{ formatPrice(s.base_price) }} EUR</span>
                        }
                      </div>
                    </div>
                    <button
                      (click)="assignService(s)"
                      [disabled]="assigning() === s.id"
                      class="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      @if (assigning() === s.id) {
                        <span class="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                      }
                      Asignar
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }

      <!-- DETAIL MODAL (asignación con campos editables) -->
      @if (detailModalOpen() && detailService(); as svc) {
        <div
          class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          (click)="closeDetailModal()"
        >
          <div
            class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4"
            (click)="$event.stopPropagation()"
          >
            <header class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">Asignar servicio al cliente</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Personaliza los datos antes de asignar. El cliente los verá en su portal.
                </p>
              </div>
              <button
                (click)="closeDetailModal()"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
                title="Cerrar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Nombre (visible para el cliente)
                </label>
                <input
                  type="text"
                  [ngModel]="detailName()"
                  (ngModelChange)="detailName.set($event)"
                  name="detailName"
                  placeholder="Nombre del servicio"
                  class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Descripción (visible para el cliente)
                </label>
                <textarea
                  [ngModel]="detailDescription()"
                  (ngModelChange)="detailDescription.set($event)"
                  name="detailDescription"
                  rows="3"
                  placeholder="Notas internas y/o descripción que verá el cliente…"
                  class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200 resize-none"
                ></textarea>
                <p class="text-[10px] text-gray-400 mt-1">
                  Usa este campo para indicar el motivo o contexto de la asignación.
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Precio
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    [ngModel]="detailPrice()"
                    (ngModelChange)="detailPrice.set(+$event || 0)"
                    name="detailPrice"
                    class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
                  />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Moneda
                  </label>
                  <input
                    type="text"
                    maxlength="3"
                    [ngModel]="detailCurrency()"
                    (ngModelChange)="detailCurrency.set(($event || 'EUR').toUpperCase())"
                    name="detailCurrency"
                    class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  [ngModel]="detailStartDate()"
                  (ngModelChange)="detailStartDate.set($event)"
                  name="detailStartDate"
                  class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Recurrencia
                </label>
                <div class="grid grid-cols-2 gap-2">
                  @for (opt of detailRecurrenceOptions; track opt.value) {
                    <label
                      class="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors"
                      [class.border-blue-500]="detailRecurrence() === opt.value"
                      [class.bg-blue-50]="detailRecurrence() === opt.value"
                      [class.dark:bg-blue-900/20]="detailRecurrence() === opt.value"
                      [class.border-gray-200]="detailRecurrence() !== opt.value"
                      [class.dark:border-slate-700]="detailRecurrence() !== opt.value"
                    >
                      <input
                        type="radio"
                        [value]="opt.value"
                        [checked]="detailRecurrence() === opt.value"
                        (change)="detailRecurrence.set($any(opt.value))"
                        class="text-blue-600 focus:ring-blue-500"
                      />
                      <span class="text-sm text-gray-700 dark:text-gray-200">{{ opt.label }}</span>
                    </label>
                  }
                </div>
              </div>

              @if (detailRecurrence() !== 'none') {
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Día
                    </label>
                    <input
                      type="number"
                      min="1"
                      [ngModel]="detailRecurrenceDay()"
                      (ngModelChange)="detailRecurrenceDay.set($event ? +$event : null)"
                      name="detailRecurrenceDay"
                      class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Fin (opcional)
                    </label>
                    <input
                      type="date"
                      [ngModel]="detailRecurrenceEnd()"
                      (ngModelChange)="detailRecurrenceEnd.set($event || null)"
                      name="detailRecurrenceEnd"
                      class="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 dark:text-gray-200"
                    />
                  </div>
                </div>
              }
            </div>

            <footer class="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-700">
              <button
                (click)="closeDetailModal()"
                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Cancelar
              </button>
              <button
                (click)="confirmAssign()"
                [disabled]="assigning() === svc.id"
                class="px-5 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                @if (assigning() === svc.id) {
                  <span class="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                }
                Asignar al cliente
              </button>
            </footer>
          </div>
        </div>
      }
    </div>
  `,
})
export class ClientServicesComponent implements OnInit {
  @Input() clientId: string = '';
  @Input() companyId: string = '';

  private supabaseService = inject(SimpleSupabaseService);
  private toast = inject(ToastService);
  private modulesService = inject(SupabaseModulesService);

  loading = signal<boolean>(true);
  contracted = signal<ContractedService[]>([]);

  // Assign modal
  assignModalOpen = signal<boolean>(false);
  loadingAvailable = signal<boolean>(false);
  available = signal<AvailableService[]>([]);
  modalSearch = '';
  assigning = signal<string | null>(null);

  // Detail modal (opened when clicking "Asignar" in the catalog)
  detailModalOpen = signal<boolean>(false);
  detailService = signal<AvailableService | null>(null);
  detailName = signal<string>('');
  detailDescription = signal<string>('');
  detailPrice = signal<number>(0);
  detailCurrency = signal<string>('EUR');
  detailStartDate = signal<string>(new Date().toISOString().slice(0, 10));
  detailRecurrence = signal<'none' | 'monthly' | 'weekly' | 'yearly'>('none');
  detailRecurrenceDay = signal<number | null>(null);
  detailRecurrenceEnd = signal<string | null>(null);

  filteredAvailable = computed<AvailableService[]>(() => {
    const q = this.modalSearch.trim().toLowerCase();
    if (!q) return this.available();
    return this.available().filter((s) => s.name.toLowerCase().includes(q));
  });

  ngOnInit() {
    if (this.clientId) this.loadContracted();
  }

  async loadContracted() {
    this.loading.set(true);
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('contracted_services')
        .select('*')
        .eq('client_id', this.clientId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      this.contracted.set((data ?? []) as ContractedService[]);
    } catch (e: any) {
      this.toast.error('Error al cargar servicios contratados', e?.message || 'Error desconocido');
    } finally {
      this.loading.set(false);
    }
  }

  async openAssignModal() {
    this.assignModalOpen.set(true);
    this.modalSearch = '';
    this.loadAvailable();
  }

  closeAssignModal() {
    this.assignModalOpen.set(false);
  }

  async loadAvailable() {
    this.loadingAvailable.set(true);
    try {
      const supabase = this.supabaseService.getClient();
      // Resolve company_id from the client if not provided
      let companyId = this.companyId;
      if (!companyId) {
        const { data: client } = await supabase
          .from('clients')
          .select('company_id')
          .eq('id', this.clientId)
          .single();
        companyId = client?.company_id ?? '';
      }
      if (!companyId) {
        this.available.set([]);
        return;
      }
      const { data, error } = await supabase
        .from('services')
        .select('id, name, description, base_price, category, is_active, is_public, is_bookable, allow_direct_contracting, has_variants')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('is_public', true)
        .order('name');
      if (error) throw error;
      this.available.set((data ?? []) as AvailableService[]);
    } catch (e: any) {
      this.toast.error('Error al cargar catálogo', e?.message || 'Error desconocido');
    } finally {
      this.loadingAvailable.set(false);
    }
  }

  async assignService(s: AvailableService) {
    // Open the detail modal pre-populated with the service's data.
    // Skip the description if it looks like a stray UUID (data quality issue
    // in some services: the description column ended up holding the service id).
    const cleanDescription = this.isLikelyUuid(s.description) ? '' : (s.description ?? '');
    this.detailService.set(s);
    this.detailName.set(s.name);
    this.detailDescription.set(cleanDescription);
    this.detailPrice.set(s.base_price ?? 0);
    this.detailCurrency.set('EUR');
    this.detailStartDate.set(new Date().toISOString().slice(0, 10));
    this.detailRecurrence.set('none');
    this.detailRecurrenceDay.set(null);
    this.detailRecurrenceEnd.set(null);
    this.detailModalOpen.set(true);
  }

  closeDetailModal() {
    this.detailModalOpen.set(false);
    this.detailService.set(null);
  }

  async confirmAssign() {
    const s = this.detailService();
    if (!s) return;
    const name = this.detailName().trim();
    if (!name) {
      this.toast.error('Falta el nombre', 'El servicio necesita un nombre.');
      return;
    }
    this.assigning.set(s.id);
    try {
      const supabase = this.supabaseService.getClient();
      const { data: client } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', this.clientId)
        .single();
      const rec = this.detailRecurrence();
      const { error } = await supabase.from('contracted_services').insert({
        client_id: this.clientId,
        company_id: client?.company_id ?? this.companyId,
        name,
        description: this.detailDescription().trim() || null,
        price: this.detailPrice(),
        currency: this.detailCurrency() || 'EUR',
        start_date: this.detailStartDate(),
        status: 'active',
        recurrence_type: rec === 'none' ? null : rec,
        recurrence_day: rec === 'none' ? null : this.detailRecurrenceDay(),
        recurrence_start: rec === 'none' ? null : this.detailStartDate(),
        recurrence_end: rec === 'none' ? null : this.detailRecurrenceEnd(),
      });
      if (error) throw error;
      this.toast.success('Servicio asignado', `"${name}" añadido a los servicios del cliente`);
      this.modalSearch = '';
      this.closeDetailModal();
      this.closeAssignModal();
      await this.loadContracted();
    } catch (e: any) {
      this.toast.error('No se pudo asignar', e?.message || 'Error desconocido');
    } finally {
      this.assigning.set(null);
    }
  }

  async updateStatus(c: ContractedService, status: 'active' | 'paused') {
    try {
      const supabase = this.supabaseService.getClient();
      const { error } = await supabase
        .from('contracted_services')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', c.id);
      if (error) throw error;
      this.toast.success('Estado actualizado', `"${c.name}" → ${this.statusLabel(status)}`);
      await this.loadContracted();
    } catch (e: any) {
      this.toast.error('No se pudo cambiar el estado', e?.message || 'Error desconocido');
    }
  }

  async cancelContract(c: ContractedService) {
    if (!confirm(`¿Cancelar el servicio "${c.name}"? El cliente ya no lo verá como activo.`)) return;
    try {
      const supabase = this.supabaseService.getClient();
      const { error } = await supabase
        .from('contracted_services')
        .update({ status: 'cancelled', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', c.id);
      if (error) throw error;
      this.toast.success('Servicio cancelado', `"${c.name}" fue cancelado`);
      await this.loadContracted();
    } catch (e: any) {
      this.toast.error('No se pudo cancelar', e?.message || 'Error desconocido');
    }
  }

  formatPrice(p?: number | null): string {
    if (p == null) return '—';
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p);
  }

  detailRecurrenceOptions: Array<{ value: 'none' | 'monthly' | 'weekly' | 'yearly'; label: string }> = [
    { value: 'none', label: 'Puntual' },
    { value: 'monthly', label: 'Mensual' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'yearly', label: 'Anual' },
  ];

  /**
   * Heuristic: many CRM services in production have a UUID stored in the
   * `description` column (a data entry bug from early imports). Detect that
   * pattern so the UI doesn't display a raw UUID as the description.
   */
  isLikelyUuid(v: string | null | undefined): boolean {
    if (!v) return false;
    const trimmed = v.trim();
    if (trimmed.length !== 36) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  }

  recurrenceLabel(t: string): string {
    switch (t) {
      case 'monthly': return 'Mensual';
      case 'weekly': return 'Semanal';
      case 'yearly': return 'Anual';
      default: return t;
    }
  }

  statusLabel(s: string): string {
    switch (s) {
      case 'active': return 'Activo';
      case 'paused': return 'Pausado';
      case 'cancelled': return 'Cancelado';
      default: return s;
    }
  }

  statusClass(s: string): string {
    const base = 'text-xs px-2 py-0.5 rounded-full font-medium';
    switch (s) {
      case 'active': return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300`;
      case 'paused': return `${base} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`;
      case 'cancelled': return `${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
      default: return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
    }
  }
}
