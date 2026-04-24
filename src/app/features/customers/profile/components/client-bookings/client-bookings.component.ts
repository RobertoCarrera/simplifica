import { Component, Input, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  SupabaseBookingsService,
  Booking,
} from '../../../../../services/supabase-bookings.service';
import { SupabaseProfessionalsService } from '../../../../../services/supabase-professionals.service';
import { SupabaseResourcesService } from '../../../../../services/supabase-resources.service';
import { SimpleSupabaseService } from '../../../../../services/simple-supabase.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';
import { BookingNotesService } from '../../../../../services/booking-notes.service';
import { EventFormComponent } from '../../../../../shared/components/event-form/event-form.component';
import { SkeletonComponent } from '../../../../../shared/ui/skeleton/skeleton.component';
import { AppModalComponent } from '../../../../../shared/ui/app-modal/app-modal.component';
import { PaymentIntegrationsService } from '../../../../../services/payment-integrations.service';
import { environment } from '../../../../../../environments/environment';

@Component({
  selector: 'app-client-bookings',
  standalone: true,
  imports: [CommonModule, EventFormComponent, SkeletonComponent, TranslocoPipe, AppModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <!-- Header Actions -->
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ 'clients.agenda.titulo' | transloco }}</h3>
        <button
          (click)="openNewBooking()"
          [disabled]="isLoadingForm()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          @if (isLoadingForm()) {
            <i class="fas fa-spinner fa-spin"></i> {{ 'clients.agenda.cargando' | transloco }}
          } @else {
            <i class="fas fa-plus"></i> {{ 'clients.agenda.nuevaCita' | transloco }}
          }
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-6 border-b border-gray-200 dark:border-slate-700 mt-4 mb-4">
        <button (click)="setViewMode('upcoming')"
                class="pb-2 text-sm font-medium transition-colors border-b-2"
                [ngClass]="viewMode() === 'upcoming' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'">
          {{ 'clients.agenda.proximasCitas' | transloco }}
        </button>
        <button (click)="setViewMode('history')"
                class="pb-2 text-sm font-medium transition-colors border-b-2"
                [ngClass]="viewMode() === 'history' ? 'text-blue-600 border-blue-600' : 'text-gray-500 border-transparent hover:text-gray-700'">
          {{ 'clients.agenda.historial' | transloco }}
        </button>
      </div>

      <!-- Bookings List -->
      <div
        class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden"
      >
        @if (isLoading()) {
          <div class="p-6">
            <div class="space-y-4">
              <app-skeleton type="list" [count]="3" height="4rem"></app-skeleton>
            </div>
          </div>
        }

        @if (!isLoading() && bookings().length === 0) {
          <div class="p-8 text-center text-gray-500 dark:text-gray-400">
            <i class="fas fa-calendar-times text-4xl mb-3 opacity-50"></i>
            <p>{{ 'clients.agenda.vacio' | transloco }}</p>
          </div>
        }

        @if (!isLoading() && bookings().length > 0) {
          <div class="divide-y divide-gray-100 dark:divide-slate-700">
            @for (booking of bookings(); track booking.id) {
              <div
                class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer"
                (click)="toggleBookingDetails(booking.id)"
              >
                <!-- Info -->
                <div class="flex items-start gap-4">
                  <div
                    class="flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700"
                  >
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{{
                      booking.start_time | date: 'MMM'
                    }}</span>
                    <span class="text-lg font-bold text-gray-900 dark:text-white">{{
                      booking.start_time | date: 'dd'
                    }}</span>
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-gray-900 dark:text-white">
                      {{ booking.service?.name || ('clients.agenda.servicioPersonalizado' | transloco) }}
                    </h4>
                    <div
                      class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1"
                    >
                      <span
                        ><i class="fas fa-clock mr-1"></i>
                        {{ booking.start_time | date: 'shortTime' }} -
                        {{ booking.end_time | date: 'shortTime' }}</span
                      >
                      @if (booking.professional?.display_name) {
                        <span class="hidden sm:inline">
                          <i class="fas fa-user-tie mr-1 ml-2"></i>
                          {{ booking.professional?.display_name }}
                        </span>
                      }
                    </div>
                  </div>
                </div>
                <!-- Status & Price -->
                <div class="flex items-center gap-4 ml-16 sm:ml-0">
                  <!-- Status Badge -->
                  <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-medium border"
                    [ngClass]="getStatusClasses(booking.status)"
                  >
                    {{ getStatusLabel(booking.status) }}
                  </span>
                  <!-- Price -->
                  <div class="text-right min-w-[80px]">
                    <span class="block text-sm font-bold text-gray-900 dark:text-white">
                      {{ booking.total_price || 0 | currency: 'EUR' }}
                    </span>
                    <span class="text-xs" [ngClass]="getPaymentStatusColor(booking.payment_status)">
                      {{ getPaymentStatusLabel(booking.payment_status) }}
                    </span>
                  </div>
                  <!-- Actions -->
                  <div class="relative group">
                    <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2">
                      <i class="fas fa-ellipsis-v"></i>
                    </button>
                  </div>
                  <button
                    (click)="editBooking(booking); $event.stopPropagation()"
                    class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                  >
                    {{ 'clients.agenda.verEditar' | transloco }}
                  </button>
                  @if (booking.total_price && booking.total_price > 0) {
                    <button
                      (click)="openPaymentLinkModal(booking); $event.stopPropagation()"
                      class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 text-sm font-medium"
                    >
                      <i class="fas fa-link mr-1"></i>{{ 'clients.agenda.paymentLink' | transloco }}
                    </button>
                  }
                  @if (viewMode() === 'history') {
                    <button
                      class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
                    >
                      <i class="fas" [class.fa-chevron-down]="expandedBookingId() !== booking.id" [class.fa-chevron-up]="expandedBookingId() === booking.id"></i>
                    </button>
                  }
                </div>
              </div>

              <!-- Expandable Notes & Documents Section -->
              @if (viewMode() === 'history' && expandedBookingId() === booking.id) {
                <div class="bg-gray-50 dark:bg-slate-900/50 p-4 border-t border-gray-100 dark:border-slate-700" (click)="$event.stopPropagation()">
                  <!-- Loading notes count indicator -->
                  @if (loadingNotes().has(booking.id)) {
                    <div class="text-center py-2 text-sm text-gray-500">
                      <i class="fas fa-spinner fa-spin mr-1"></i> {{ 'clients.agenda.loadingNotes' | transloco }}
                    </div>
                  }
                  
                  <!-- Clinical Notes Section -->
                  <div class="mb-4">
                    <h5 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <i class="fas fa-file-medical text-red-500"></i>
                      {{ 'clients.historialClinico.titulo' | transloco }}
                    </h5>

                    <!-- Privacy indicator: count only — content visible in Historial Clínico -->
                    @if (!loadingNotes().has(booking.id)) {
                      <div class="flex items-center gap-2 px-3 py-2 mb-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                        <i class="fas fa-lock"></i>
                        <span>
                          @if (bookingNoteCounts().get(booking.id)) {
                            {{ bookingNoteCounts().get(booking.id) }} {{ 'clients.agenda.notasClinicasCount' | transloco }}
                          } @else {
                            {{ 'clients.agenda.sinNotasClinicas' | transloco }}
                          }
                        </span>
                      </div>
                    }

                    <!-- New Note Input (write-only from Agenda) -->
                    <div class="flex gap-2">
                      <textarea
                        [value]="getNoteInput(booking.id) || ''"
                        (input)="setNoteInput(booking.id, $any($event.target).value)"
                        (click)="$event.stopPropagation()"
                        placeholder="{{ 'clients.agenda.addClinicalNote' | transloco }}"
                        class="flex-1 text-sm rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows="2"
                      ></textarea>
                      <button
                        (click)="saveNote(booking.id); $event.stopPropagation()"
                        [disabled]="savingNote().has(booking.id) || !getNoteInput(booking.id)?.trim()"
                        class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                      >
                        @if (savingNote().has(booking.id)) {
                          <i class="fas fa-spinner fa-spin"></i>
                        } @else {
                          <i class="fas fa-save"></i>
                        }
                      </button>
                    </div>
                  </div>
                  
                  <!-- Documents Section: count only — full access in Historial Clínico -->
                  <div>
                    <h5 class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                      <i class="fas fa-paperclip text-blue-500"></i>
                      {{ 'clients.documentos.titulo' | transloco }}
                    </h5>

                    @if (loadingDocuments().has(booking.id)) {
                      <div class="text-center py-2 text-sm text-gray-500">
                        <i class="fas fa-spinner fa-spin mr-1"></i> {{ 'clients.documentos.cargando' | transloco }}
                      </div>
                    } @else {
                      <div class="flex items-center gap-2 px-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-lg text-xs text-blue-700 dark:text-blue-400">
                        <i class="fas fa-lock"></i>
                        <span>
                          @if (bookingDocCounts().get(booking.id)) {
                            {{ bookingDocCounts().get(booking.id) }} {{ 'clients.documentos.documentosCount' | transloco }}
                          } @else {
                            {{ 'clients.documentos.vacio' | transloco }}
                          }
                        </span>
                      </div>
                    }

                    <!-- Upload New Document -->
                    <div class="flex items-center gap-2">
                      <input
                        type="file"
                        [id]="'file-upload-' + booking.id"
                        (change)="uploadDocument(booking.id, $event)"
                        (click)="$event.stopPropagation()"
                        class="hidden"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      />
                      <label
                        [for]="'file-upload-' + booking.id"
                        (click)="$event.stopPropagation()"
                        class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2"
                      >
                        @if (uploadingFile().has(booking.id)) {
                          <i class="fas fa-spinner fa-spin"></i> {{ 'clients.documentos.subiendo' | transloco }}
                        } @else {
                          <i class="fas fa-upload"></i> {{ 'clients.documentos.subir' | transloco }}
                        }
                      </label>
                    </div>
                  </div>
                </div>
              }
            }
          </div>
        }
      </div>

      <!-- Event Form Modal -->
      @if (isModalOpen()) {
        <app-event-form
          [calendarId]="calendarId()"
          [professionals]="professionals()"
          [bookableServices]="availableServices()"
          [clients]="[clientData]"
          [availableResources]="availableResources()"
          [allEvents]="calendarEvents()"
          [eventToEdit]="selectedBooking()"
          (close)="closeModal()"
          (created)="handleBookingCreated()"
        ></app-event-form>
      }

      <!-- Send Payment Link Modal -->
      @if (showPaymentLinkModal()) {
        <app-modal [visible]="showPaymentLinkModal()" (close)="closePaymentLinkModal()">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{{ 'clients.agenda.sendPaymentLink' | transloco }}</h3>
            <!-- No integrations -->
            @if (availableProviders().length === 0) {
              <div class="text-center py-6">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-amber-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p class="text-gray-700 dark:text-gray-300 mb-2">{{ 'clients.agenda.noPaymentGateways' | transloco }}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ 'clients.agenda.configureGatewaysHint' | transloco }}</p>
                <button class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300" (click)="closePaymentLinkModal()">{{ 'shared.cerrar' | transloco }}</button>
              </div>
            }
            <!-- Provider selection -->
            @if (availableProviders().length > 0 && !generatedPaymentLink()) {
              <div>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">{{ 'clients.agenda.selectPaymentGateway' | transloco }}</p>
                <div class="grid grid-cols-2 gap-3 mb-4">
                  @for (p of availableProviders(); track p.provider) {
                    <button
                      (click)="selectedPaymentProvider.set(p.provider)"
                      class="p-4 rounded border-2 transition-colors flex flex-col items-center"
                      [ngClass]="selectedPaymentProvider() === p.provider
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:border-purple-300'">
                      <span class="text-2xl mb-1">{{ p.provider === 'paypal' ? '💳' : '💵' }}</span>
                      <span class="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">{{ p.provider }}</span>
                      @if (p.is_sandbox) {
                        <span class="text-xs text-amber-600 dark:text-amber-400 mt-1">Sandbox</span>
                      }
                    </button>
                  }
                </div>
                <div class="flex justify-end gap-2">
                  <button class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300" (click)="closePaymentLinkModal()">{{ 'shared.cancelar' | transloco }}</button>
                  <button
                    [disabled]="generatingPaymentLink() || !selectedPaymentProvider()"
                    (click)="generateBookingPaymentLink()"
                    class="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                    @if (generatingPaymentLink()) {
                      <i class="fas fa-spinner fa-spin"></i> {{ 'clients.agenda.generating' | transloco }}
                    } @else {
                      {{ 'clients.agenda.generateLink' | transloco }}
                    }
                  </button>
                </div>
              </div>
            }
            <!-- Generated link -->
            @if (generatedPaymentLink()) {
              <div class="space-y-4">
                <div class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <i class="fas fa-check-circle text-green-600"></i>
                  <span class="text-sm text-green-800 dark:text-green-200">{{ 'clients.agenda.linkGenerated' | transloco }}</span>
                </div>
                <div class="flex gap-2">
                  <input
                    type="text"
                    readonly
                    [value]="generatedPaymentLink()!"
                    class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm" />
                  <button
                    (click)="copyPaymentLink()"
                    class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
                    <i class="fas fa-copy"></i>
                  </button>
                </div>
                @if (copiedPaymentLink()) {
                  <p class="text-xs text-green-600 dark:text-green-400"><i class="fas fa-check mr-1"></i>{{ 'clients.agenda.copied' | transloco }}</p>
                }
                <div class="flex justify-end gap-2 mt-4">
                  <button class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300" (click)="closePaymentLinkModal()">{{ 'shared.cerrar' | transloco }}</button>
                  <button class="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700" (click)="openPaymentUrl()">
                    <i class="fas fa-external-link-alt mr-1"></i>{{ 'clients.agenda.openLink' | transloco }}
                  </button>
                </div>
              </div>
            }
          </div>
        </app-modal>
      }
    </div>
  `,
})
export class ClientBookingsComponent implements OnInit, OnDestroy {
  @Input({ required: true }) clientId!: string;
  @Input() clientData: any = null;

  bookingsService = inject(SupabaseBookingsService);
  professionalsService = inject(SupabaseProfessionalsService);
  resourcesService = inject(SupabaseResourcesService);
  supabase = inject(SimpleSupabaseService);
  authService = inject(AuthService);
  toast = inject(ToastService);
  bookingNotesService = inject(BookingNotesService);
  paymentService = inject(PaymentIntegrationsService);

  bookings = signal<Booking[]>([]);
  isLoading = signal(true); // Start loading immediately

  // Expandable rows
  expandedBookingId = signal<string | null>(null);

  // Note counts per booking (privacy: only count shown in Agenda, content in Historial)
  bookingNoteCounts = signal<Map<string, number>>(new Map());
  bookingDocCounts = signal<Map<string, number>>(new Map());

  // Loading states
  loadingNotes = signal<Set<string>>(new Set());
  loadingDocuments = signal<Set<string>>(new Set());

  // Note input
  newNoteContent = signal<Map<string, string>>(new Map());
  savingNote = signal<Set<string>>(new Set());

  // File upload
  uploadingFile = signal<Set<string>>(new Set());

  viewMode = signal<'upcoming' | 'history'>('upcoming');
  isFormReady = signal(false);
  isLoadingForm = signal(false);
  realtimeSubscription: any;

  // Modal & Data for Modal
  isModalOpen = signal(false);
  selectedBooking = signal<any | null>(null);
  availableServices = signal<any[]>([]);
  professionals = signal<any[]>([]);
  availableResources = signal<any[]>([]);
  calendarEvents = signal<any[]>([]);
  calendarId = signal<string | undefined>(undefined);

  // Payment link modal state
  showPaymentLinkModal = signal(false);
  generatingPaymentLink = signal(false);
  generatedPaymentLink = signal<string | null>(null);
  selectedPaymentProvider = signal<'stripe' | 'paypal' | null>(null);
  selectedBookingForPayment = signal<Booking | null>(null);
  availableProviders = signal<{ provider: 'stripe' | 'paypal'; is_sandbox: boolean }[]>([]);
  copiedPaymentLink = signal(false);

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      await this.fetchBookings();
      this.setupRealtime();
    } catch (error) {
      console.error('Error loading initial data', error);
      this.toast.error('Error', 'No se pudieron cargar los datos de la agenda.');
    } finally {
      this.isLoading.set(false);
    }
  }

  ngOnDestroy() {
    if (this.realtimeSubscription) {
      this.supabase.getClient().removeChannel(this.realtimeSubscription);
    }
  }

  setViewMode(mode: 'upcoming' | 'history') {
    this.viewMode.set(mode);
    this.isLoading.set(true);
    this.fetchBookings().finally(() => this.isLoading.set(false));
  }

  setupRealtime() {
    this.realtimeSubscription = this.supabase.getClient()
      .channel('client-bookings-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `client_id=eq.${this.clientId}` },
        () => {
          // Silent background refresh for optimistic-like immediate updates UI.
          this.fetchBookings();
        }
      )
      .subscribe();
  }

  async fetchBookings() {
    try {
      const now = new Date().toISOString();
      const companyId = this.authService?.currentCompanyId?.();
      const isUpcoming = this.viewMode() === 'upcoming';

      const { data, error } = await this.bookingsService.getBookings({
        companyId: companyId || undefined,
        clientId: this.clientId,
        from: isUpcoming ? now : undefined,
        before: isUpcoming ? undefined : now,
        ascending: isUpcoming,
        limit: isUpcoming ? 100 : 50,
        columns: `id, client_id, customer_name, start_time, end_time, status, payment_status, total_price, currency, notes, service_id, professional_id,
          service:services(name), professional:professionals(display_name)`,
      });

      if (error) throw error;
      this.bookings.set(data);
    } catch (e) {
      console.error('Error fetching bookings', e);
      throw e;
    }
  }

  async ensureFormDataLoaded() {
    if (this.isFormReady()) return;
    this.isLoadingForm.set(true);
    try {
      // Load form dependencies in parallel — calendar events fetched alongside, not sequentially
      await Promise.all([
        this.fetchServices(),
        this.fetchProfessionals(),
        this.fetchResources(),
        this.fetchCalendarEvents(),
      ]);
      this.isFormReady.set(true);
    } catch (error) {
      console.error('Error loading form data', error);
      this.toast.error('Error', 'No se pudieron cargar algunos datos para la cita.');
    } finally {
      this.isLoadingForm.set(false);
    }
  }

  async fetchServices() {
    try {
      const companyId = this.authService.currentCompanyId();
      const client = this.supabase.getClient();

      let query = client
        .from('services')
        .select('id, name, base_price, duration_minutes, company_id')
        .eq('is_active', true)
        .limit(200);

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      if (data) this.availableServices.set(data);
    } catch (e) {
      console.error('Error fetching services', e);
      throw e;
    }
  }

  async fetchProfessionals() {
    try {
      const data = await firstValueFrom(this.professionalsService.getProfessionals());
      this.professionals.set(data);
    } catch (e) {
      console.error('Error fetching professionals', e);
      throw e;
    }
  }

  async fetchResources() {
     try {
       const res = await firstValueFrom(this.resourcesService.getResources());
       this.availableResources.set(res || []);
     } catch (e) {
       console.error('Error loading resources', e);
     }
  }

  async fetchCalendarEvents() {
    try {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      const end = new Date();
      end.setMonth(end.getMonth() + 2);

      const companyId = this.authService.currentCompanyId();
      if (!companyId) return;

      const { data: localBookings, error } = await this.bookingsService.getBookings({
        companyId,
        from: start.toISOString(),
        to: end.toISOString(),
      });

      if (error) {
        console.error('Error fetching calendar events', error);
        return;
      }

      const allEvents = (localBookings || []).map((b: any) => ({
        id: b.id,
        title: b.customer_name + ' - ' + (b.service?.name || 'Servicio'),
        start: new Date(b.start_time),
        end: new Date(b.end_time),
        allDay: false,
        description: b.notes || '',
        color: b.status === 'cancelled' ? '#9ca3af' : '#6366f1',
        type: 'appointment',
        resourceId: b.resource_id,
        professionalId: b.professional_id,
        isLocal: true,
        extendedProps: {
          shared: {
            localBookingId: b.id,
            serviceId: b.service_id,
            clientId: b.client_id,
            professionalId: b.professional_id,
            resourceId: b.resource_id,
          },
        },
      }));

      this.calendarEvents.set(allEvents);
    } catch (e) {
      console.error('Error fetching calendar events', e);
    }
  }

  async openNewBooking() {
    await this.ensureFormDataLoaded();
    this.selectedBooking.set(null);
    this.isModalOpen.set(true);
  }

  async editBooking(booking: Booking) {
    await this.ensureFormDataLoaded();
    // Map booking to the structure expected by event-form (Calendar Event format)
    const eventToEdit = {
      id: booking.id,
      start: booking.start_time,
      end: booking.end_time,
      description: booking.notes || '',
      isLocal: true,
      googleEventId: booking.google_event_id,
      extendedProps: {
        shared: {
          localBookingId: booking.id,
          serviceId: booking.service_id,
          clientId: booking.client_id,
          professionalId: booking.professional_id,
          resourceId: booking.resource_id,
          clientName: booking.customer_name,
        },
      },
    };

    this.selectedBooking.set(eventToEdit);
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedBooking.set(null);
  }

  async handleBookingCreated() {
    this.closeModal();
  }

  // Helpers
  getStatusClasses(status: string): string {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  getStatusLabel(status: string): string {
    const map: any = { confirmed: 'Confirmada', pending: 'Pendiente', cancelled: 'Cancelada' };
    return map[status] || status;
  }

  getPaymentStatusColor(status?: string): string {
    if (status === 'paid') return 'text-green-600 dark:text-green-400';
    if (status === 'pending') return 'text-yellow-600 dark:text-yellow-400';
    return 'text-gray-500';
  }

  getPaymentStatusLabel(status?: string): string {
    const map: any = {
      paid: 'Pagado',
      pending: 'Pendiente',
      partial: 'Parcial',
      refunded: 'Reembolsado',
    };
    return status ? map[status] || 'No pagado' : 'No pagado';
  }

  // Expandable row methods
  toggleBookingDetails(bookingId: string) {
    if (this.viewMode() !== 'history') return;
    
    if (this.expandedBookingId() === bookingId) {
      this.expandedBookingId.set(null);
    } else {
      this.expandedBookingId.set(bookingId);
      // Load note count and documents when expanding
      this.loadNoteCountForBooking(bookingId);
      this.loadDocCountForBooking(bookingId);
    }
  }

  async loadNoteCountForBooking(bookingId: string) {
    if (this.loadingNotes().has(bookingId)) return;

    this.loadingNotes.update(set => {
      const newSet = new Set(set);
      newSet.add(bookingId);
      return newSet;
    });

    try {
      const count = await firstValueFrom(this.bookingNotesService.countNotes(bookingId));
      const current = new Map(this.bookingNoteCounts());
      current.set(bookingId, count);
      this.bookingNoteCounts.set(current);
    } catch (error) {
      console.error('Error loading note count', error);
    } finally {
      this.loadingNotes.update(set => {
        const newSet = new Set(set);
        newSet.delete(bookingId);
        return newSet;
      });
    }
  }

  async loadDocCountForBooking(bookingId: string) {
    if (this.loadingDocuments().has(bookingId)) return;

    this.loadingDocuments.update(set => {
      const newSet = new Set(set);
      newSet.add(bookingId);
      return newSet;
    });

    try {
      const count = await firstValueFrom(this.bookingNotesService.countDocuments(bookingId));
      const current = new Map(this.bookingDocCounts());
      current.set(bookingId, count);
      this.bookingDocCounts.set(current);
    } catch (error) {
      console.error('Error loading document count', error);
    } finally {
      this.loadingDocuments.update(set => {
        const newSet = new Set(set);
        newSet.delete(bookingId);
        return newSet;
      });
    }
  }

  getNoteInput(bookingId: string): string | undefined {
    return this.newNoteContent().get(bookingId);
  }

  setNoteInput(bookingId: string, content: string) {
    const current = new Map(this.newNoteContent());
    current.set(bookingId, content);
    this.newNoteContent.set(current);
  }

  async saveNote(bookingId: string) {
    const content = this.getNoteInput(bookingId)?.trim();
    if (!content) return;

    this.savingNote.update(set => {
      const newSet = new Set(set);
      newSet.add(bookingId);
      return newSet;
    });

    try {
      await firstValueFrom(this.bookingNotesService.createNote(bookingId, content));
      
      // Clear input
      this.setNoteInput(bookingId, '');
      
      // Reload note count
      await this.loadNoteCountForBooking(bookingId);
      this.toast.success('Nota guardada', 'La nota clínica se ha guardado correctamente.');
    } catch (error) {
      console.error('Error saving note', error);
      this.toast.error('Error', 'No se pudo guardar la nota.');
    } finally {
      this.savingNote.update(set => {
        const newSet = new Set(set);
        newSet.delete(bookingId);
        return newSet;
      });
    }
  }

  async uploadDocument(bookingId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingFile.update(set => {
      const newSet = new Set(set);
      newSet.add(bookingId);
      return newSet;
    });

    try {
      await firstValueFrom(this.bookingNotesService.uploadDocument(bookingId, this.clientId, file));
      
      // Reload documents
      await this.loadDocCountForBooking(bookingId);
      this.toast.success('Documento subido', 'El documento se ha adjuntado correctamente.');
    } catch (error) {
      console.error('Error uploading document', error);
      this.toast.error('Error', 'No se pudo subir el documento.');
    } finally {
      this.uploadingFile.update(set => {
        const newSet = new Set(set);
        newSet.delete(bookingId);
        return newSet;
      });
      
      // Reset file input
      input.value = '';
    }
  }

  // ── Payment Link ─────────────────────────────────────────────────────────────

  async openPaymentLinkModal(booking: Booking) {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    this.selectedBookingForPayment.set(booking);
    this.generatedPaymentLink.set(null);
    this.selectedPaymentProvider.set(null);
    this.generatingPaymentLink.set(false);

    try {
      const integrations = await this.paymentService.getIntegrations(companyId);
      const active = integrations.filter(i => i.is_active);
      this.availableProviders.set(active.map(i => ({
        provider: i.provider as 'stripe' | 'paypal',
        is_sandbox: i.is_sandbox,
      })));
      if (active.length > 0) {
        this.selectedPaymentProvider.set(active[0].provider as 'stripe' | 'paypal');
      }
      this.showPaymentLinkModal.set(true);
    } catch (e) {
      this.toast.error('Error', 'No se pudieron cargar las pasarelas de pago');
    }
  }

  closePaymentLinkModal() {
    this.showPaymentLinkModal.set(false);
    this.generatedPaymentLink.set(null);
    this.selectedBookingForPayment.set(null);
    this.selectedPaymentProvider.set(null);
    this.generatingPaymentLink.set(false);
    this.copiedPaymentLink.set(false);
  }

  async generateBookingPaymentLink() {
    const booking = this.selectedBookingForPayment();
    const provider = this.selectedPaymentProvider();
    if (!booking || !provider) return;

    this.generatingPaymentLink.set(true);
    try {
      const amount = booking.total_price || 0;
      if (amount <= 0) {
        this.toast.error('Error', 'La reserva no tiene un importe válido para generar enlace de pago');
        return;
      }
      const result = await this.paymentService.generateBookingPaymentLink({
        bookingId: booking.id,
        provider,
        amount,
        currency: 'EUR',
        description: `Pago de reserva - ${booking.service?.name || 'Servicio'}`,
        customerEmail: booking.customer_email,
        customerName: booking.customer_name,
        serviceName: booking.service?.name || 'Reserva',
      });
      this.generatedPaymentLink.set(result.payment_url);
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo generar el enlace de pago');
    } finally {
      this.generatingPaymentLink.set(false);
    }
  }

  async copyPaymentLink() {
    const link = this.generatedPaymentLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.copiedPaymentLink.set(true);
      setTimeout(() => this.copiedPaymentLink.set(false), 2000);
    } catch {
      this.toast.error('Error', 'No se pudo copiar al portapapeles');
    }
  }

  openPaymentUrl() {
    const url = this.generatedPaymentLink();
    if (url) window.open(url, '_blank');
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
