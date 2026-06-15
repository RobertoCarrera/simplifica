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

export interface ServiceCategoryRef {
  id: string;
  name: string;
  color?: string;
  icon?: string;
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

      <!-- DEBUG BANNER (quitar cuando se arregle) -->
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-xs font-mono text-amber-900 dark:text-amber-200">
        🔧 DEBUG · <b>clientId (Input):</b> {{ clientId || '(vacío)' }}
        · <b>companyId (Input):</b> {{ companyId || '(vacío)' }}
        · <b>contracted count:</b> {{ contracted().length }}
        @if (debugLastResult()) { · <b>último insert:</b> {{ debugLastResult() }} }
        @if (debugLastError()) { · <b>error:</b> {{ debugLastError() | slice:0:200 }} }
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
                        @if (categoryLabel(s)) {
                          <span
                            class="px-1.5 py-0.5 rounded"
                            [class.bg-gray-100]="!categoryColor(s)"
                            [class.dark:bg-slate-700]="!categoryColor(s)"
                            [style.backgroundColor]="categoryColor(s) || null"
                            [style.color]="categoryColor(s) ? '#fff' : null"
                          >{{ categoryLabel(s) }}</span>
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

            <!-- DEBUG PANEL (visible siempre en este modal — quitar cuando se arregle) -->
            @if (showDebug()) {
              <div class="border-t-2 border-amber-400 pt-3 space-y-2 bg-amber-50 dark:bg-amber-900/20 -mx-2 px-2 rounded">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-bold text-amber-700 dark:text-amber-300">
                    🔧 DEBUG — último intento de asignación
                  </div>
                  <button
                    (click)="showDebug.set(false)"
                    class="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400"
                    title="Ocultar"
                  >✕</button>
                </div>
                <div class="text-xs">
                  <div class="font-semibold text-gray-700 dark:text-gray-300">Status:</div>
                  <div
                    class="font-mono text-[10px] mt-0.5 px-2 py-1 rounded"
                    [class.bg-emerald-100]="debugLastResult() === 'OK — fila insertada'"
                    [class.text-emerald-800]="debugLastResult() === 'OK — fila insertada'"
                    [class.bg-amber-100]="debugLastResult() === 'Insertando…'"
                    [class.text-amber-800]="debugLastResult() === 'Insertando…'"
                    [class.bg-red-100]="debugLastError()"
                    [class.text-red-800]="debugLastError()"
                    [class.bg-gray-100]="!debugLastResult() && !debugLastError()"
                  >
                    {{ debugLastResult() || '(aún sin intentar)' }}
                  </div>
                </div>
                @if (debugLastError()) {
                  <div class="text-xs">
                    <div class="font-semibold text-red-700 dark:text-red-300">Error:</div>
                    <pre class="font-mono text-[10px] mt-0.5 px-2 py-1 rounded bg-red-100 text-red-800 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{{ debugLastError() }}</pre>
                  </div>
                }
                <div class="text-xs">
                  <div class="font-semibold text-gray-700 dark:text-gray-300">Payload / Row:</div>
                  <pre class="font-mono text-[10px] mt-0.5 px-2 py-1 rounded bg-white dark:bg-slate-900 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{{ formatDebug(debugLastInsert()) }}</pre>
                </div>
                <div class="text-xs text-amber-700 dark:text-amber-300">
                  clientId (de @Input): <span class="font-mono">{{ clientId }}</span><br>
                  companyId (de @Input): <span class="font-mono">{{ companyId || '(vacío)' }}</span>
                </div>
              </div>
            }

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

  // Categories cache: categoryId → { name, color, icon }
  categoriesById = signal<Record<string, ServiceCategoryRef>>({});

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

  // DEBUG: visible in template (no console needed)
  debugLastInsert = signal<any>(null);
  debugLastResult = signal<string>('');
  debugLastError = signal<string>('');
  showDebug = signal<boolean>(true);

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

      // If any service's category is a UUID, fetch the matching service_categories
      // (no FK exists in the DB, so we resolve names client-side — same pattern
      // as SupabaseServicesService.getServicesFromTable).
      const categoryIds = Array.from(
        new Set(
          (data ?? [])
            .map((s: any) => s?.category)
            .filter((id: any) => typeof id === 'string' && this.isValidUuid(id)),
        ),
      );
      const missing = categoryIds.filter((id) => !this.categoriesById()[id]);
      if (missing.length > 0) {
        const { data: cats, error: catErr } = await supabase
          .from('service_categories')
          .select('id, name, color, icon')
          .in('id', missing)
          .eq('company_id', companyId);
        if (!catErr && Array.isArray(cats)) {
          const map: Record<string, ServiceCategoryRef> = { ...this.categoriesById() };
          for (const c of cats) {
            map[c.id] = c as ServiceCategoryRef;
          }
          this.categoriesById.set(map);
        }
      }
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
    this.debugLastResult.set('');
    this.debugLastError.set('');
    try {
      const supabase = this.supabaseService.getClient();

      // Resolve company_id from the client (the source of truth — the client's
      // owning company, NOT the company the admin is currently logged into
      // via @Input). Fall back to @Input only if the lookup fails.
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', this.clientId)
        .single();
      if (clientErr) {
        console.warn('[ClientServices.confirmAssign] could not resolve company_id from client, falling back to @Input companyId', clientErr);
      }
      const resolvedCompanyId = client?.company_id ?? this.companyId;
      if (!resolvedCompanyId) {
        throw new Error('No se pudo resolver la empresa del cliente. Aborta la asignación.');
      }

      const rec = this.detailRecurrence();
      const insertPayload = {
        client_id: this.clientId,
        company_id: resolvedCompanyId,
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
      };
      this.debugLastInsert.set(insertPayload);
      this.debugLastResult.set('Insertando…');
      const { data, error } = await supabase
        .from('contracted_services')
        .insert(insertPayload)
        .select()
        .single();
      if (error) {
        this.debugLastError.set(JSON.stringify(error, null, 2));
        throw error;
      }
      this.debugLastInsert.set(data);
      this.debugLastResult.set('OK — fila insertada');
      this.toast.success('Servicio asignado', `"${name}" añadido a los servicios del cliente`);
      this.modalSearch = '';
      this.closeDetailModal();
      this.closeAssignModal();
      await this.loadContracted();
    } catch (e: any) {
      const msg = e?.message || JSON.stringify(e);
      if (!this.debugLastError()) this.debugLastError.set(msg);
      this.toast.error('No se pudo asignar', msg);
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

  /** Strict UUID check (same pattern as SupabaseServicesService.isValidUuid). */
  isValidUuid(v: any): boolean {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }

  /**
   * Resolve the category label for a service. If `service.category` is a UUID
   * (no FK in the DB), look it up in the categories cache. Otherwise treat
   * it as a plain string name.
   */
  categoryLabel(s: AvailableService): string | null {
    const c = s.category;
    if (!c) return null;
    if (this.isValidUuid(c)) {
      const resolved = this.categoriesById()[c];
      return resolved?.name ?? null; // hide if we couldn't resolve
    }
    return c;
  }

  categoryColor(s: AvailableService): string | null {
    const c = s.category;
    if (!c || !this.isValidUuid(c)) return null;
    return this.categoriesById()[c]?.color ?? null;
  }

  formatDebug(v: any): string {
    if (v == null) return '(vacío)';
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
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
