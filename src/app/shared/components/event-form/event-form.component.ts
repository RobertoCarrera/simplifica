import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  effect,
  signal,
  computed,
  OnInit,
  DestroyRef,
} from "@angular/core";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  FormControl,
} from "@angular/forms";
import { SimpleSupabaseService } from "../../../services/simple-supabase.service";
import { ToastService } from "../../../services/toast.service";
import { SupabaseSettingsService } from "../../../services/supabase-settings.service";
import { SupabaseCustomersService } from "../../../services/supabase-customers.service";
import { SupabaseBookingsService } from "../../../services/supabase-bookings.service";
import { SupabaseWaitlistService } from "../../../services/supabase-waitlist.service";
import { AuthService } from "../../../services/auth.service";
import { WaitlistButtonComponent } from "../waitlist-button/waitlist-button.component";
import { firstValueFrom, take } from "rxjs";

@Component({
  selector: "app-event-form",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, WaitlistButtonComponent],
  template: `
    <div
      class="fixed inset-0 z-[9999] overflow-y-auto"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="flex items-center justify-center min-h-screen px-4 py-4 sm:p-4"
      >
        <!-- Backdrop -->
        <div
          class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity cursor-pointer"
          aria-hidden="true"
          (click)="close.emit()"
        ></div>

        <!-- Modal Panel -->
        <div
          class="relative bg-white dark:bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:max-w-xl sm:w-full border border-gray-200 dark:border-gray-700 flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh]"
        >
          <!-- Modal Header -->
          <div
            class="bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center flex-shrink-0"
          >
            <div>
              <h3
                class="text-xl font-bold leading-6 text-gray-900 dark:text-white"
                id="modal-title"
              >
                {{ eventToEdit ? "Editar Cita" : "Nuevo Evento" }}
              </h3>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{
                  eventToEdit
                    ? "Modifica los detalles de la cita seleccionada."
                    : "Añade un nuevo evento a tu calendario."
                }}
              </p>
            </div>
            <!-- Close Button -->
            <button
              type="button"
              (click)="close.emit()"
              class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white focus:outline-none transition-colors"
            >
              <i class="fas fa-times text-sm"></i>
            </button>
          </div>

          <!-- Body -->
          <div
            class="px-6 py-6 overflow-y-auto flex-1 overscroll-contain no-scrollbar pb-32 sm:pb-6"
          >
            <form [formGroup]="form" class="space-y-5">
              <!-- Service Selection First -->
              <div>
                <label
                  for="service"
                  class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
                  >Servicio</label
                >
                <select
                  id="service"
                  formControlName="service"
                  [compareWith]="compareById"
                  class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                >
                  <option [ngValue]="null">-- Selecciona un servicio --</option>
                  @for (svc of availableBookableServices(); track svc) {
                    <option [ngValue]="svc" [disabled]="!svc.isAvailable">
                      {{ svc.name }} ({{ svc.base_price | currency: "EUR" }})
                      {{ !svc.isAvailable ? "- No disponible" : "" }}
                    </option>
                  }
                </select>
              </div>

              <!-- Session Type Toggle -->
              <div class="mb-5">
                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo de sesión</label>
                <div class="flex rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600">
                  <button type="button"
                    class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors"
                    [ngClass]="form.get('session_type')?.value === 'presencial'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                    (click)="form.patchValue({session_type: 'presencial'})">
                    <i class="fas fa-map-marker-alt"></i> Presencial
                  </button>
                  <button type="button"
                    class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-l border-gray-300 dark:border-gray-600"
                    [ngClass]="form.get('session_type')?.value === 'online'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                    (click)="form.patchValue({session_type: 'online'})">
                    <i class="fas fa-video"></i> Online
                  </button>
                </div>
                @if (form.get('session_type')?.value === 'online') {
                  <p class="mt-1.5 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <i class="fas fa-info-circle"></i> Se generará un enlace de Google Meet automáticamente.
                  </p>
                }
              </div>

              <!-- Dates Second -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <div>
                  <label
                    for="date"
                    class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
                    >Fecha</label
                  >
                  <input
                    type="date"
                    id="date"
                    formControlName="date"
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                  />
                </div>

                <div>
                  <label
                    for="time"
                    class="flex text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 justify-between"
                  >
                    <span>Hora de Inicio</span>
                    @if (selectedEndFormatted()) {
                      <span
                        class="font-normal text-xs text-indigo-600 dark:text-indigo-400"
                      >
                        Termina a las {{ selectedEndFormatted() }}
                      </span>
                    }
                  </label>
                  <select
                    id="time"
                    formControlName="time"
                    [class.opacity-50]="!form.get('service')?.value"
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                  >
                    @for (slot of availableTimeSlots(); track slot.time) {
                      <option
                        [ngValue]="slot.time"
                        [disabled]="!slot.isAvailable"
                      >
                        {{ slot.time
                        }}{{
                          !slot.isAvailable ? " - Sin Profesionales Libres" : ""
                        }}
                      </option>
                    }
                  </select>
                </div>
              </div>

              <!-- Client Selection (Custom Searchable Dropdown) -->
              @if (!isClient()) {
                <div class="relative">
                  <label
                    class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
                    >Cliente</label
                  >

                  <!-- Search Input -->
                  <input
                    type="text"
                    [formControl]="clientSearchControl"
                    (focus)="showClientList.set(true)"
                    placeholder="Buscar cliente..."
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                  />

                  <!-- Selected Client Badge (if any) -->
                  @if (form.get("client")?.value; as selectedClient) {
                    <div
                      class="mt-2 flex items-center justify-between p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-100 dark:border-indigo-800"
                    >
                      <div class="flex items-center">
                        <div
                          class="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold mr-3"
                        >
                          {{ $any(selectedClient).name?.charAt(0) || "C" }}
                        </div>
                        <div>
                          <div
                            class="text-sm font-medium text-gray-900 dark:text-white"
                          >
                            {{ $any(selectedClient).displayName }}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        (click)="clearClient()"
                        class="text-gray-400 hover:text-red-500"
                      >
                        <i class="fas fa-times"></i>
                      </button>
                    </div>
                  }

                  <!-- Dropdown List -->
                  @if (showClientList()) {
                    <div
                      class="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-xl py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm border border-gray-200 dark:border-gray-700"
                    >
                      @if (filteredClients().length === 0) {
                        <div
                          class="cursor-default select-none relative py-2 pl-3 pr-9 text-gray-70:dark:text-gray-400 italic"
                        >
                          No se encontraron clientes.
                        </div>
                      }
                      @for (client of filteredClients(); track client.id) {
                        <div
                          (click)="selectClient(client)"
                          class="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <div class="flex flex-col">
                            <span class="font-medium"
                              >{{ client.name }} {{ client.surname }}</span
                            >
                            <span
                              class="text-xs text-gray-500 dark:text-gray-400"
                              >{{ client.email }}</span
                            >
                          </div>
                        </div>
                      }

                      @if (canInviteUnregistered()) {
                        <div
                          (click)="
                            selectClient({
                              id: 'new',
                              email: clientSearchTerm(),
                              name: (clientSearchTerm() || '').split('@')[0],
                              isNew: true,
                              displayName: clientSearchTerm(),
                            })
                          "
                          class="cursor-pointer select-none relative py-3 pl-3 pr-9 hover:bg-green-50 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 border-t border-gray-100 dark:border-gray-700"
                        >
                          <div class="flex items-center">
                            <i class="fas fa-plus-circle mr-2"></i>
                            <div class="flex flex-col">
                              <span class="font-medium"
                                >Invitar a {{ clientSearchTerm() }}</span
                              >
                              <span class="text-xs opacity-80"
                                >(Nuevo cliente)</span
                              >
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  }

                  <!-- Click outside listener (Overlay) -->
                  @if (showClientList()) {
                    <div
                      (click)="showClientList.set(false)"
                      class="fixed inset-0 z-40 bg-transparent cursor-default"
                    ></div>
                  }
                </div>
              }

              <!-- Resource Selection -->
              @if (filteredResourcesByService().length > 0) {
                <div>
                  <label
                    for="resource"
                    class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex justify-between"
                  >
                    <span>Recurso (Sala/Equipo)</span>
                    <span
                      class="font-normal text-xs text-indigo-600 dark:text-indigo-400"
                    >
                      {{ freeResources().length }} libres
                    </span>
                  </label>
                  <select
                    id="resource"
                    formControlName="resource"
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                  >
                    @if (freeResources().length > 0) {
                      <option [ngValue]="'automatic'">
                        Automático (Asignar recurso libre)
                      </option>
                    }
                    @if (freeResources().length === 0) {
                      <option [ngValue]="'automatic'" disabled>
                        Ninguno disponible
                      </option>
                    }
                    @for (res of filteredResourcesByService(); track res.id) {
                      <option
                        [ngValue]="res"
                        [disabled]="!isResourceFree(res.id)"
                      >
                        {{ res.name }} ({{ res.type || "Recurso" }})
                        {{ !isResourceFree(res.id) ? " - Ocupado" : "" }}
                      </option>
                    }
                  </select>

                  @if (
                    freeResources().length === 0 &&
                    availableResources.length > 0 &&
                    form.get("start")?.value
                  ) {
                    <div
                      class="mt-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg border border-yellow-200 dark:border-yellow-800/30"
                    >
                      <i class="fas fa-exclamation-triangle mr-1"></i>
                      No hay recursos libres en este horario.
                      @if (nextAvailableSuggestion()) {
                        <br /><span class="font-medium mt-1 block w-full"
                          >Sugerencia: {{ nextAvailableSuggestion() }}</span
                        >
                      }
                    </div>
                  }
                </div>
              }

              <!-- Professional Selection -->
              @if (filteredProfessionals().length > 0) {
                <div>
                  <label
                    for="professional"
                    class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex justify-between"
                  >
                    <span>Atendido por</span>
                    @if (form.get("service")?.value) {
                      <span
                        class="font-normal text-xs text-indigo-600 dark:text-indigo-400"
                      >
                        {{ freeProfessionals().length }} disponibles
                      </span>
                    }
                  </label>
                  <select
                    id="professional"
                    formControlName="professional"
                    class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                  >
                    @if (freeProfessionals().length > 0) {
                      <option [ngValue]="'automatic'">
                        Automático (Asignar libre)
                      </option>
                    }
                    @if (freeProfessionals().length === 0) {
                      <option [ngValue]="'automatic'" disabled>
                        Ninguno disponible
                      </option>
                    }
                    @for (prof of filteredProfessionals(); track prof.id) {
                      <option
                        [ngValue]="prof"
                        [disabled]="!isProfessionalFree(prof.id)"
                      >
                        {{ prof.display_name }}
                        {{ !isProfessionalFree(prof.id) ? " - Ocupado" : "" }}
                      </option>
                    }
                  </select>
                </div>
              }

              <!-- Description -->
              <div>
                <label
                  for="description"
                  class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1"
                  >Descripción</label
                >
                <textarea
                  id="description"
                  formControlName="description"
                  rows="3"
                  placeholder="Detalles adicionales..."
                  class="block w-full rounded-xl border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white sm:text-sm py-2.5 px-3 transition-colors"
                ></textarea>
              </div>
            </form>
          </div>

          <!-- Waitlist CTA — shown when slot is fully booked and service supports active waitlist -->
          @if (slotFull() && waitlistEligible()) {
            <div class="px-6 pb-4 flex-shrink-0">
              <div
                class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 mb-3"
              >
                <p
                  class="text-xs text-amber-700 dark:text-amber-300 font-medium mb-2"
                >
                  <i class="fas fa-users mr-1"></i>
                  Este horario está completo ({{ currentBookingCount() }}/{{
                    selectedServiceMaxCapacity()
                  }}
                  plazas).
                </p>
                <app-waitlist-button
                  [serviceId]="selectedService()?.id || ''"
                  [companyId]="currentCompanyId()"
                  [startTime]="selectedStart() || ''"
                  [endTime]="selectedEnd() || ''"
                  [enableWaitlist]="selectedService()?.enable_waitlist ?? false"
                  [activeModeEnabled]="
                    selectedService()?.active_mode_enabled ?? true
                  "
                  (joined)="onWaitlistJoined()"
                ></app-waitlist-button>
              </div>
            </div>
          }

          <!-- Footer Action Bar -->
          <div
            class="fixed bottom-0 left-0 right-0 sm:relative p-6 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex flex-row items-center justify-between gap-4 z-30 flex-shrink-0 sm:rounded-b-2xl"
          >
            <div class="flex flex-col">
              <span
                class="text-[10px] text-gray-400 dark:text-gray-500 uppercase font-bold tracking-widest leading-none"
                >Cita</span
              >
              <span
                class="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[150px] sm:max-w-xs"
              >
                {{ serviceName }}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="close.emit()"
                class="p-3 text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95 shadow-sm sm:px-6 sm:py-2 sm:text-sm sm:font-medium"
              >
                <i class="fas fa-times sm:hidden"></i>
                <span class="hidden sm:inline">Cancelar</span>
              </button>

              @if (!slotFull()) {
                <button
                  type="button"
                  [disabled]="form.invalid || loading"
                  (click)="onSubmit()"
                  class="flex-1 sm:flex-none py-3 px-6 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 sm:text-sm"
                >
                  <i
                    class="fas"
                    [class.fa-save]="!loading"
                    [class.fa-spinner]="loading"
                    [class.fa-spin]="loading"
                  ></i>
                  <span>{{
                    loading ? "Guardando..." : eventToEdit ? "Guardar" : "Crear"
                  }}</span>
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class EventFormComponent implements OnInit {
  @Input() initialDate: Date | null = null;
  @Input() calendarId: string | undefined;
  @Input() professionals: any[] = [];
  @Input() availableResources: any[] = [];
  @Input() bookableServices: any[] = [];
  @Input() clients: any[] = [];
  @Input() bookingConstraints: any;

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<any>();

  loading = false;

  get serviceName(): string {
    const service = this.form.get("service")?.value as any;
    return service?.name || "Nueva Cita";
  }

  private fb = inject(FormBuilder);
  private toastService = inject(ToastService);
  private supabase = inject(SimpleSupabaseService);
  private settingsService = inject(SupabaseSettingsService);
  private customersService = inject(SupabaseCustomersService);
  private bookingsService = inject(SupabaseBookingsService);
  private waitlistService = inject(SupabaseWaitlistService);
  private authService = inject(AuthService);

  companySettings = signal<any>(null);

  // Role detection
  userRole = this.authService.userRole;
  isClient = computed(() => this.userRole() === "client");

  // Capacity / waitlist state
  /** Count of confirmed/pending bookings for the currently selected slot */
  currentBookingCount = signal<number>(0);
  /** Whether the currently selected slot is at max capacity */
  slotFull = computed(() => {
    const svc = this.selectedService() as any;
    const maxCap = svc?.max_capacity;
    if (!maxCap || !this.selectedStart() || !this.selectedEnd()) return false;
    return this.currentBookingCount() >= maxCap;
  });
  /** Whether the selected service supports active-mode waitlist */
  waitlistEligible = computed(() => {
    const svc = this.selectedService() as any;
    return !!(svc?.enable_waitlist && (svc?.active_mode_enabled ?? true));
  });
  /** Max capacity of the selected service */
  selectedServiceMaxCapacity = computed(
    () => (this.selectedService() as any)?.max_capacity ?? 0,
  );
  /** Current company ID — passed to waitlist button */
  currentCompanyId = computed(() => this.authService.currentCompanyId() ?? "");

  // Client Search Control
  clientSearchControl = new FormControl("");
  clientSearchTerm = toSignal(this.clientSearchControl.valueChanges, {
    initialValue: "",
  });
  showClientList = signal(false);

  @Input() allEvents: any[] = [];
  @Input() eventToEdit: any | null = null;

  // Time selections for resource availability
  selectedStart = signal<string | null>(null);
  selectedEnd = signal<string | null>(null);
  selectedService = signal<any>(null);
  selectedDate = signal<string | null>(null);
  selectedTime = signal<string | null>(null);

  selectedEndFormatted = computed(() => {
    const endStr = this.selectedEnd();
    if (!endStr) return null;
    const timeFormatter = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return timeFormatter.format(new Date(endStr));
  });

  availableTimeSlots = computed(() => {
    const dStr = this.selectedDate();
    const service: any = this.selectedService();
    const constraints = this.bookingConstraints;

    if (!dStr || !service || !constraints) return [];

    // Create Date recognizing local timezone so getDay() matches local
    const selectedDateParts = dStr.split("-");
    const selectedDateObj = new Date(
      Number(selectedDateParts[0]),
      Number(selectedDateParts[1]) - 1,
      Number(selectedDateParts[2]),
    );
    const dayOfWeek = selectedDateObj.getDay();

    if (
      constraints.workingDays &&
      !constraints.workingDays.includes(dayOfWeek)
    ) {
      return [];
    }

    const daySchedules = (constraints.schedules || []).filter(
      (s: any) => s.day_of_week === dayOfWeek,
    );
    if (daySchedules.length === 0) return []; // No schedule for this day

    const parseTimeToMinutes = (t: string) => {
      const parts = t.split(":").map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const slots: { time: string; isAvailable: boolean }[] = [];
    const minH = constraints.minHour ?? 8;
    const maxH = constraints.maxHour ?? 20;

    for (let h = minH; h <= maxH; h++) {
      for (const m of [0, 30]) {
        if (h === maxH && m > 0) continue; // Usually don't allow beyond maxH

        const slotStartMinutes = h * 60 + m;
        const slotEndMinutes = slotStartMinutes + service.duration_minutes;

        // Ensure the entire event fits within at least one working block
        const isWithinAnySchedule = daySchedules.some((s: any) => {
          const schedStart = parseTimeToMinutes(s.start_time);
          const schedEnd = parseTimeToMinutes(s.end_time);
          return slotStartMinutes >= schedStart && slotEndMinutes <= schedEnd;
        });

        if (!isWithinAnySchedule) continue; // Skip if outside working blocks

        const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        const slotStartStr = `${dStr}T${timeStr}:00`;
        const slotEnd = new Date(
          new Date(slotStartStr).getTime() + service.duration_minutes * 60000,
        );

        const capableProfessionals = this.professionals.filter((prof) =>
          prof.services?.some((s: any) => s.id === service.id),
        );

        let hasFreeProfessional = false;
        if (capableProfessionals.length > 0) {
          hasFreeProfessional = capableProfessionals.some((prof) => {
            return !this.allEvents.some((event) => {
              // If it's the exact same professional and the times overlap
              if (event.extendedProps?.shared?.professionalId !== prof.id)
                return false;
              if (!event.start || !event.end) return false;
              const eStart = new Date(event.start);
              const eEnd = new Date(event.end);
              return new Date(slotStartStr) < eEnd && slotEnd > eStart;
            });
          });
        }

        // User requested: "Deben aparecer sólo las horas que tienen alguna disponibilidad"
        if (hasFreeProfessional) {
          slots.push({ time: timeStr, isAvailable: true });
        }
      }
    }
    return slots;
  });

  availableBookableServices = computed(() => {
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();

    return this.bookableServices.map((svc) => {
      const capableProfessionals = this.professionals.filter((prof) =>
        prof.services?.some((s: any) => s.id === svc.id),
      );

      let capableResources = this.availableResources;
      if (this.availableResources.length > 0) {
        capableResources = this.availableResources.filter((resource) => {
          const resServices = resource.resource_services;
          return (
            !resServices ||
            resServices.length === 0 ||
            resServices.some((rs: any) => rs.service_id === svc.id)
          );
        });
      }

      let isAvailable =
        capableProfessionals.length > 0 &&
        (this.availableResources.length === 0 || capableResources.length > 0);

      if (isAvailable && startStr && endStr) {
        const start = new Date(startStr);
        const end = new Date(endStr);

        const hasFreeProfessional = capableProfessionals.some((prof) => {
          return !this.allEvents.some((event) => {
            if (event.extendedProps?.shared?.professionalId !== prof.id)
              return false;
            if (!event.start || !event.end) return false;
            const eStart = new Date(event.start);
            const eEnd = new Date(event.end);
            return start < eEnd && end > eStart;
          });
        });

        let hasFreeResource = true;
        if (capableResources.length > 0) {
          hasFreeResource = capableResources.some((resource) => {
            return !this.allEvents.some((event) => {
              if (event.extendedProps?.shared?.resourceId !== resource.id)
                return false;
              if (!event.start || !event.end) return false;
              const eStart = new Date(event.start);
              const eEnd = new Date(event.end);
              return start < eEnd && end > eStart;
            });
          });
        }

        isAvailable = hasFreeProfessional && hasFreeResource;
      }

      return {
        ...svc,
        isAvailable,
      };
    });
  });

  filteredResourcesByService = computed(() => {
    const selectedService = this.selectedService();
    if (!selectedService) return this.availableResources;

    return this.availableResources.filter((resource) => {
      const resServices = resource.resource_services;
      return (
        !resServices ||
        resServices.length === 0 ||
        resServices.some((rs: any) => rs.service_id === selectedService.id)
      );
    });
  });

  freeResources = computed(() => {
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();
    const resources = this.filteredResourcesByService();

    if (!startStr || !endStr) return resources;

    const start = new Date(startStr);
    const end = new Date(endStr);

    return resources.filter((resource) => {
      return !this.allEvents.some((event) => {
        if (event.extendedProps?.shared?.resourceId !== resource.id)
          return false;
        if (!event.start || !event.end) return false;
        const eStart = new Date(event.start);
        const eEnd = new Date(event.end);
        return start < eEnd && end > eStart;
      });
    });
  });

  nextAvailableSuggestion = computed(() => {
    if (this.freeResources().length > 0) return null;
    const resources = this.filteredResourcesByService();
    if (resources.length === 0) return null;

    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();
    if (!startStr || !endStr) return null;

    const duration = new Date(endStr).getTime() - new Date(startStr).getTime();
    let attemptStart = new Date(startStr);

    for (let i = 0; i < 24; i++) {
      attemptStart = new Date(attemptStart.getTime() + 30 * 60000);
      const attemptEnd = new Date(attemptStart.getTime() + duration);

      const hasFreeResource = resources.some((resource) => {
        return !this.allEvents.some((event) => {
          if (event.extendedProps?.shared?.resourceId !== resource.id)
            return false;
          if (!event.start || !event.end) return false;
          const eStart = new Date(event.start);
          const eEnd = new Date(event.end);
          return attemptStart < eEnd && attemptEnd > eStart;
        });
      });

      if (hasFreeResource) {
        const timeFormatter = new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateFormatter = new Intl.DateTimeFormat("es-ES", {
          day: "2-digit",
          month: "2-digit",
        });
        if (attemptStart.getDate() === new Date(startStr).getDate()) {
          return `Prueba a las ${timeFormatter.format(attemptStart)}`;
        } else {
          return `Prueba el ${dateFormatter.format(attemptStart)} a las ${timeFormatter.format(attemptStart)}`;
        }
      }
    }
    return "Consulte disponibilidad en los próximos días";
  });

  isResourceFree(resourceId: string): boolean {
    return this.freeResources().some((r) => r.id === resourceId);
  }

  compareById(opt1: any, opt2: any): boolean {
    return opt1 && opt2 ? opt1.id === opt2.id : opt1 === opt2;
  }

  filteredProfessionals = computed(() => {
    const selectedService = this.selectedService();
    if (!selectedService) return this.professionals;

    return this.professionals.filter((prof) =>
      prof.services?.some((s: any) => s.id === selectedService.id),
    );
  });

  freeProfessionals = computed(() => {
    const professionals = this.filteredProfessionals();
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();

    if (!startStr || !endStr) return professionals;

    const start = new Date(startStr);
    const end = new Date(endStr);

    return professionals.filter((prof) => {
      return !this.allEvents.some((event) => {
        if (event.extendedProps?.shared?.professionalId !== prof.id)
          return false;
        if (!event.start || !event.end) return false;
        const eStart = new Date(event.start);
        const eEnd = new Date(event.end);
        return start < eEnd && end > eStart;
      });
    });
  });

  isProfessionalFree(profId: string): boolean {
    return this.freeProfessionals().some((p) => p.id === profId);
  }

  isTimeInAvailableSlots(time: string | null | undefined): boolean {
    if (!time) return false;
    return this.availableTimeSlots().some((s) => s.time === time);
  }

  // Filter clients based on search
  filteredClients = computed(() => {
    const term = this.clientSearchTerm()?.toLowerCase() || "";
    if (!term) return this.clients.slice(0, 50); // Limit to 50 if no search
    return this.clients.filter(
      (c) =>
        (c.displayName && c.displayName.toLowerCase().includes(term)) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.name && c.name.toLowerCase().includes(term)) ||
        (c.surname && c.surname.toLowerCase().includes(term)),
    );
  });

  canInviteUnregistered = computed(() => {
    const settings = this.companySettings();
    if (!settings?.allow_unregistered_client_invites) return false;

    const term = this.clientSearchTerm()?.trim();
    if (!term || !term.includes("@") || !term.includes(".")) return false; // Basic email heuristic

    // Check if matches exactly an existing client's email
    const exactMatch = this.clients.some(
      (c) => c.email && c.email.toLowerCase() === term.toLowerCase(),
    );
    return !exactMatch;
  });

  form = this.fb.group({
    service: [null, Validators.required],
    client: [null, Validators.required],
    summary: [""],
    description: [""],
    date: ["", Validators.required],
    time: ["", Validators.required],
    professional: ["automatic"],
    resource: ["automatic"],
    session_type: ["presencial"],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe((val) => {
      if (val.service || val.client) {
        const serviceName = (val.service as any)?.name || "Servicio";
        const clientName =
          (val.client as any)?.displayName ||
          ((val.client as any)?.name
            ? `${(val.client as any).name} ${(val.client as any).surname || ""}`.trim()
            : null) ||
          "Cliente";

        if (val.service && val.client) {
          this.form.patchValue(
            { summary: `${serviceName} - ${clientName}` },
            { emitEvent: false },
          );
        }
      }

      // Update signals for computed properties
      if (val.date !== this.selectedDate()) {
        this.selectedDate.set(val.date || null);
      }
      if (val.time !== this.selectedTime()) {
        this.selectedTime.set(val.time || null);
      }

      const d = val.date;
      const t = val.time;
      const svc = val.service as any;

      if (d && t) {
        const startStr = `${d}T${t}:00`;
        this.selectedStart.set(startStr);
        if (svc?.duration_minutes) {
          const endObj = new Date(
            new Date(startStr).getTime() + svc.duration_minutes * 60000,
          );
          // Return timezone-safe ISO string
          this.selectedEnd.set(endObj.toISOString());
        } else {
          this.selectedEnd.set(null);
        }
      } else {
        this.selectedStart.set(null);
        this.selectedEnd.set(null);
      }
    });

    this.form.get("service")?.valueChanges.pipe(takeUntilDestroyed()).subscribe((val) => {
      this.selectedService.set(val);

      const profs = this.filteredProfessionals();
      const res = this.filteredResourcesByService();

      if (profs.length === 1) {
        this.form.patchValue({ professional: profs[0] }, { emitEvent: false });
      } else if (
        !this.form.get("professional")?.value ||
        this.form.get("professional")?.value === null
      ) {
        this.form.patchValue(
          { professional: "automatic" },
          { emitEvent: false },
        );
      }

      if (res.length === 1) {
        this.form.patchValue({ resource: res[0] }, { emitEvent: false });
      } else if (
        !this.form.get("resource")?.value ||
        this.form.get("resource")?.value === null
      ) {
        this.form.patchValue({ resource: "automatic" }, { emitEvent: false });
      }
    });

    // Handle professional changes to pre-fill default resource
    this.form.get("professional")?.valueChanges.pipe(takeUntilDestroyed()).subscribe((prof: any) => {
      if (prof?.default_resource_id) {
        const resource = this.availableResources.find(
          (r) => r.id === prof.default_resource_id,
        );
        if (resource) {
          this.form.patchValue({ resource: resource });
        }
      }
    });

    // Initialize dates if provided
    effect(() => {
      if (this.initialDate && !this.form.get("date")?.value) {
        const localDate = new Date(this.initialDate);
        const yy = localDate.getFullYear();
        const mm = (localDate.getMonth() + 1).toString().padStart(2, "0");
        const dd = localDate.getDate().toString().padStart(2, "0");
        const hh = localDate.getHours().toString().padStart(2, "0");
        const min = localDate.getMinutes().toString().padStart(2, "0");

        const dateStr = `${yy}-${mm}-${dd}`;
        const timeStr = `${hh}:${min}`;

        let validTimeObj = hh === "00" && min === "00" ? "" : timeStr;

        this.form.patchValue({
          date: dateStr,
          time: validTimeObj,
        });
      }
    });

    // Load settings
    this.settingsService.getCompanySettings().pipe(take(1), takeUntilDestroyed()).subscribe((settings) => {
      this.companySettings.set(settings);
    });

    // Reactively check capacity when service or time slot changes
    effect(() => {
      const serviceId = (this.selectedService() as any)?.id;
      const startStr = this.selectedStart();
      const endStr = this.selectedEnd();
      const maxCap = (this.selectedService() as any)?.max_capacity;
      if (serviceId && startStr && endStr && maxCap) {
        // Non-blocking: update booking count in background
        this.waitlistService
          .getBookingCountForSlot(
            serviceId,
            new Date(startStr).toISOString(),
            new Date(endStr).toISOString(),
          )
          .then((count) => this.currentBookingCount.set(count))
          .catch(() => this.currentBookingCount.set(0));
      } else {
        this.currentBookingCount.set(0);
      }
    });
  }

  ngOnInit() {
    if (this.isClient()) {
      const user = this.authService.userProfile;
      if (user?.email) {
        const client = this.clients.find(
          (c) => c.email?.toLowerCase() === user.email?.toLowerCase(),
        );
        if (client) {
          this.selectClient(client);
        }
      }
    }

    if (this.eventToEdit) {
      // Check if it's an existing event with extendedProps
      if (this.eventToEdit.extendedProps) {
        const shared = this.eventToEdit.extendedProps?.shared || {};
        const serviceId = shared.serviceId;
        const clientId = shared.clientId;
        const professionalId = shared.professionalId;
        const resourceId = shared.resourceId;

        const service = this.bookableServices.find(
          (s: any) => s.id === serviceId,
        );
        const client = this.clients.find((c: any) => c.id === clientId);
        const professional = this.professionals.find(
          (p: any) => p.id === professionalId,
        );
        const resource = this.availableResources.find(
          (r: any) => r.id === resourceId,
        );

        let dateStr = "";
        let timeStr = "";
        if (this.eventToEdit.start) {
          const d = new Date(this.eventToEdit.start);
          const yy = d.getFullYear();
          const mm = (d.getMonth() + 1).toString().padStart(2, "0");
          const dd = d.getDate().toString().padStart(2, "0");
          const hh = d.getHours().toString().padStart(2, "0");
          const min = d.getMinutes().toString().padStart(2, "0");
          dateStr = `${yy}-${mm}-${dd}`;
          timeStr = `${hh}:${min}`;
        }

        this.form.patchValue({
          service: service || null,
          client: client || null,
          date: dateStr,
          time: timeStr,
          professional: professional || "automatic",
          resource: resource || "automatic",
          description: this.eventToEdit.description || "",
          session_type: shared.sessionType || "presencial",
        });
      }
      // Or if it's pre-selected data for a new event (e.g. from "Reservar" click)
      else {
        this.form.patchValue({
          service: this.eventToEdit.service || null,
          professional: this.eventToEdit.professional || "automatic",
        });
      }
      return; // Skip normal defaults
    }

    if (this.professionals.length === 1) {
      this.form.patchValue(
        { professional: this.professionals[0] },
        { emitEvent: false },
      );
    }
    if (this.availableResources.length === 1) {
      this.form.patchValue(
        { resource: this.availableResources[0] },
        { emitEvent: false },
      );
    }
  }

  selectClient(client: any) {
    this.form.get("client")?.setValue(client);
    this.showClientList.set(false);
    this.clientSearchControl.setValue(""); // Clear search or keep name? Clear is better if we show badge.
  }

  clearClient() {
    this.form.get("client")?.setValue(null);
  }

  /** Called by the WaitlistButtonComponent when a join succeeds — close the form */
  onWaitlistJoined(): void {
    this.close.emit();
  }

  async onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    const formValue = this.form.value;

    try {
      let description = formValue.description
        ? `<p>${formValue.description.replace(/\\n/g, "<br/>")}</p>`
        : "";

      let assignedResource = null;
      if (formValue.resource === "automatic") {
        const freeRes = this.freeResources();
        if (freeRes.length > 0) {
          assignedResource = freeRes[0];
        }
      } else if (formValue.resource && (formValue.resource as any).id) {
        assignedResource = formValue.resource as any;
      }

      let assignedProfessional = null;
      if (formValue.professional === "automatic") {
        const freeProfs = this.freeProfessionals();
        if (freeProfs.length > 0) {
          assignedProfessional = freeProfs[0];
        }
      } else if (formValue.professional && (formValue.professional as any).id) {
        assignedProfessional = formValue.professional as any;
      }

      const details = [];
      if (formValue.service) {
        details.push(`<b>Servicio:</b> ${(formValue.service as any).name}`);
      }
      if (formValue.client) {
        details.push(
          `<b>Cliente:</b> ${(formValue.client as any).displayName || (formValue.client as any).name + " " + ((formValue.client as any).surname || "")}`,
        );
      }
      if (assignedProfessional) {
        details.push(
          `<b>Profesional Asignado:</b> ${assignedProfessional.display_name}`,
        );
      }
      if (assignedResource) {
        details.push(`<b>Recurso/Sala:</b> ${assignedResource.name}`);
      }

      if (details.length > 0) {
        description += `<br/><ul>${details.map((d) => `<li>${d}</li>`).join("")}</ul>`;
      }

      const startStr = this.selectedStart();
      const endStr = this.selectedEnd();
      if (!startStr || !endStr) throw new Error("Falta fecha y hora de inicio");

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      let finalClient = formValue.client as any;

      let targetMemberIdForOwner: string | undefined;
      if (assignedProfessional?.id) {
        targetMemberIdForOwner = assignedProfessional.id;
      }

      if (finalClient && finalClient.isNew) {
        try {
          const newCustomerObj = {
            name: finalClient.name,
            surname: "",
            dni: "",
            phone: "",
            email: finalClient.email,
            client_type: "individual" as const,
            status: "lead" as const, // Default for incomplete registered
          } as any;
          const createdClient = await firstValueFrom(
            this.customersService.createCustomer(newCustomerObj, {
              assignedMemberId: targetMemberIdForOwner,
            }),
          );
          finalClient = createdClient;
          // Important: Swap the form value so it has the real ID for description logic below
          this.form.patchValue(
            { client: createdClient as any },
            { emitEvent: false },
          );
        } catch (err: any) {
          console.error("Error auto-creating client:", err);
          throw new Error("No se pudo crear el cliente para la invitación.");
        }
      }

      // 0. Capacity check — only for new bookings (not edits)
      // If the slot is full, the WaitlistButtonComponent in the UI already handles the flow.
      // Prevent booking creation silently so the CTA stays visible.
      const isNewBooking = !(this.eventToEdit && this.eventToEdit.isLocal);
      if (isNewBooking && this.slotFull()) {
        this.loading = false;
        // Slot is full — the UI shows the waitlist CTA; nothing more to do here.
        return;
      }

      // 1. Create or Update the booking locally first
      let localBooking: any;
      try {
        const companyId = this.authService.currentCompanyId();
        if (!companyId)
          throw new Error("No se pudo obtener el ID de la empresa");

        const bookingData = {
          company_id: companyId,
          client_id: finalClient.id,
          customer_name:
            finalClient.displayName ||
            `${finalClient.name} ${finalClient.surname || ""}`.trim(),
          customer_email: finalClient.email,
          service_id: (formValue.service as any)?.id || undefined,
          professional_id: assignedProfessional?.id || undefined,
          resource_id: assignedResource?.id || undefined,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          status: "confirmed" as const,
          notes: formValue.description || undefined,
          session_type: (formValue as any).session_type || "presencial",
        };

        if (this.eventToEdit && this.eventToEdit.isLocal) {
          const localId =
            this.eventToEdit.extendedProps?.shared?.localBookingId ||
            this.eventToEdit.id;
          localBooking = await this.bookingsService.updateBooking(
            localId,
            bookingData,
          );
        } else {
          localBooking = await this.bookingsService.createBookingWithQuote(bookingData).then(r => r.booking);
        }
      } catch (err: any) {
        console.error("Error saving local booking:", err);
        throw new Error("No se pudo guardar la reserva en el sistema.");
      }

      // 2. Try to sync with Google Calendar if integration exists
      let targetCalendarId = this.calendarId;
      if (assignedProfessional?.google_calendar_id) {
        targetCalendarId = assignedProfessional.google_calendar_id;
      }

      let createdGoogleEvent = null;

      if (targetCalendarId) {
        const eventAttendees: { email: string }[] = [];
        if (finalClient?.email) {
          eventAttendees.push({ email: finalClient.email });
        }
        if (assignedResource?.google_calendar_id) {
          eventAttendees.push({ email: assignedResource.google_calendar_id });
        }

        const eventData = {
          summary: formValue.summary,
          description: description,
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
          extendedProperties: {
            shared: {
              localBookingId: localBooking.id,
              serviceId: (formValue.service as any)?.id
                ? String((formValue.service as any).id)
                : undefined,
              clientId: finalClient?.id ? String(finalClient.id) : undefined,
              professionalId: assignedProfessional?.id
                ? String(assignedProfessional.id)
                : undefined,
              resourceId: assignedResource?.id
                ? String(assignedResource.id)
                : undefined,
              sessionType: (formValue.session_type as any) || 'presencial',
              clientName:
                finalClient?.displayName ||
                (finalClient?.name
                  ? finalClient.name +
                    (finalClient.surname ? " " + finalClient.surname : "")
                  : undefined),
              serviceName: (formValue.service as any)?.name,
              professionalName: assignedProfessional?.display_name,
              resourceName: assignedResource?.name,
            },
          },
          attendees: eventAttendees,
        };

        const actionName =
          this.eventToEdit?.googleEventId || this.eventToEdit?.isGoogle
            ? "update-event"
            : "create-event";
        const targetEventId =
          this.eventToEdit?.googleEventId ||
          (this.eventToEdit?.isGoogle ? this.eventToEdit?.id : undefined);

        if (actionName !== "update-event" && (formValue as any).session_type === 'online') {
          (eventData as any).conferenceData = {
            createRequest: {
              requestId: localBooking.id,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        const { data, error } = await this.supabase
          .getClient()
          .functions.invoke("google-auth", {
            body: {
              action: actionName,
              calendarId: targetCalendarId,
              event: eventData,
              ...(actionName === "update-event" && { eventId: targetEventId }),
              ...(actionName === "create-event" && (formValue as any).session_type === 'online' && { conferenceDataVersion: 1 }),
            },
          });

        if (error) {
          console.error(
            "Supabase Function Error (Calendar sync failed):",
            error,
          );
          this.toastService.warning(
            "Sincronización Fallida",
            "La cita se guardó localmente, pero falló la sincronización con Google Calendar.",
          );
        } else if (data && data.error) {
          console.error("Google API Error from Backend:", data.error);
          if (
            data.error.code === 403 ||
            data.error.message?.includes("requiredAccessLevel")
          ) {
            this.toastService.warning(
              "Error de Permisos en Calendar",
              "La cita se guardó localmente, pero no tienes permisos en el calendario.",
            );
          } else {
            console.error("Google Calendar sync error:", data.error.message);
            this.toastService.warning(
              "Aviso",
              "La cita se guardó localmente, pero hubo un problema al sincronizar con Calendar.",
            );
          }
        } else if (data && data.success) {
          createdGoogleEvent = data.event;
          try {
            const bookingUpdates: any = { google_event_id: createdGoogleEvent.id };
            if (createdGoogleEvent.hangoutLink) {
              bookingUpdates.meeting_link = createdGoogleEvent.hangoutLink;
              localBooking.meeting_link = createdGoogleEvent.hangoutLink;
            }
            await this.bookingsService.updateBooking(localBooking.id, bookingUpdates);
            localBooking.google_event_id = createdGoogleEvent.id;
          } catch (updateErr) {
            console.error(
              "Failed to update local booking with google event ID",
              updateErr,
            );
          }
        }
      }

      const isUpdate = !!this.eventToEdit;

      if (createdGoogleEvent) {
        this.toastService.success(
          isUpdate ? "Evento Actualizado" : "Evento Creado",
          "La cita se ha guardado y sincronizado con Google Calendar correctamente.",
        );
      } else if (!targetCalendarId) {
        this.toastService.success(
          isUpdate ? "Cita Actualizada" : "Cita Creada",
          "La reserva se ha guardado correctamente.",
        );
      } else {
        // It had a target calendar but failed to sync, toast warning already shown above
      }

      // Enrich localBooking with professional and resource names for immediate UI update
      if (localBooking) {
        localBooking.professional = assignedProfessional;
        localBooking.resource = assignedResource;
        localBooking.service = formValue.service;
      }

      this.created.emit({ localBooking, googleEvent: createdGoogleEvent });
      this.close.emit();
    } catch (error: any) {
      console.error("Error creating event:", error);
      this.toastService.error(
        "Error al crear evento",
        "No se pudo guardar la cita. Inténtalo de nuevo.",
      );
    } finally {
      this.loading = false;
    }
  }
}
