import { Component, OnInit, inject, signal, OnDestroy, viewChild, computed, effect, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';
import { ProfessionalsComponent } from './tabs/professionals/professionals.component';
import { ResourcesComponent } from './tabs/resources/resources.component';
import { UnlinkedBookingsComponent } from './tabs/unlinked/unlinked-bookings.component';
import { UnlinkedReportComponent } from './tabs/unlinked-report/unlinked-report.component';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { ToastService } from '../../../services/toast.service';
import {
  SupabaseProfessionalsService,
  Professional,
} from '../../../services/supabase-professionals.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { ProfessionalBlockedDatesService, ProfessionalBlockedDate } from '../../../services/professional-blocked-dates.service';
import { SupabaseResourcesService, Resource } from '../../../services/supabase-resources.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { BudgetNotificationSettingsService } from '../../../services/budget-notification-settings.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';

import { EventFormComponent } from '../../../shared/components/event-form/event-form.component';
import { CalendarComponent } from '../../calendar/calendar.component';
import { BlockDatesModalComponent } from '../../../shared/components/block-dates-modal/block-dates-modal.component';
import { CalendarDateClick } from '../../calendar/calendar.interface';
import { ProfessionalSelfSettingsComponent } from './tabs/professionals/components/professional-self-settings/professional-self-settings.component';
import { SourceIconsSettingsComponent } from '../../bookings/settings/source-icons-settings.component';
import { ServiceTranslatePipe } from '../../../shared/pipes/service-translate.pipe';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
@Component({
  selector: 'app-booking-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    BookingAvailabilityComponent,
    ProfessionalsComponent,
    ResourcesComponent,
    UnlinkedBookingsComponent,
    UnlinkedReportComponent,
    EventFormComponent,
    CalendarComponent,
    BlockDatesModalComponent,
    ProfessionalSelfSettingsComponent,
    SourceIconsSettingsComponent,
    ServiceTranslatePipe,
    ConfirmDialogComponent,
  ],
  templateUrl: './booking-settings.component.html',
  styleUrls: ['./booking-settings.component.scss'],
})
export class BookingSettingsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private queryParamsSub?: Subscription;
  private servicesService = inject(SupabaseServicesService);
  authService = inject(AuthService);
  private supabase = inject(SimpleSupabaseService);
  private professionalsService = inject(SupabaseProfessionalsService);
  private resourcesService = inject(SupabaseResourcesService);
  private customersService = inject(SupabaseCustomersService);
  private settingsService = inject(SupabaseSettingsService);
  private toastService = inject(ToastService);
  private sidebarService = inject(SidebarStateService);

  activeTab:
    | 'services'
    | 'professionals'
    | 'resources'
    | 'availability'
    | 'calendar'
    | 'general'
    | 'unlinked'
    | 'unlinked-report' = 'calendar';
  bookableServices = signal<Service[]>([]);
  professionals = signal<Professional[]>([]); // New signal
  clients = signal<any[]>([]); // Clients signal
  calendarEvents = signal<any[]>([]); // Signal for calendar events
  // ALL company bookings (not filtered by professional) — needed for global
  // resource availability checks in the event-form modal. Resources are shared
  // across all professionals in the company, so the modal must know about every
  // booking that occupies a resource, not just the current professional's.
  allCompanyBookings = signal<any[]>([]);
  loading = true;
  saving = false;
  showProfessionalSelfSettings = signal(false);
  error: string | null = null;
  settingsTab: 'general' | 'professionals' | 'resources' | 'availability' = 'general';

  openSettingsMenu(event?: MouseEvent): void {
    if (this.isProfessional()) {
      this.showProfessionalSelfSettings.set(true);
      return;
    }
    this.switchTab('general');
  }

  onProfessionalCalendarViewsChanged(views: string[]): void {
    if (!views?.length) return;
    this.bookingConstraints.update(prev => ({
      ...prev,
      enabledViews: views,
      enabledViews_desktop: views,
      enabledViews_mobile: views,
      defaultView: views[0],
    }));
  }

  bookingSettings = {
    slot_interval: 15,
    min_advance_hours: 2,
  };

  get bookingPortalUrl(): string {
    return this.publicBookingUrl();
  }

  isLoadingCalendar = signal(false);
  isCalendarLoaded = false;
  isProfessionalsLoaded = false;
  isClientsLoaded = false;
  isResourcesLoaded = false;
  isCalendarsLoaded = false;
  realtimeSubscription: any;
  private readonly realtimeChannelName = `company-bookings-realtime-${Math.random().toString(36).slice(2)}`;
  private _realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Stores the DB-resolved professional ID for users with role='professional'.
   *  activeProfessionalId() is only set for owners switching to professional mode,
   *  so real professional users need this cached value for all subsequent loads. */
  private _resolvedProfessionalId: string | undefined;
  /** Professional slug from URL query param (e.g. ?professional=<slug>) */
  private _queryProfessionalSlug: string | undefined;
  /** Professional UUID from URL query param (e.g. ?professional_id=<uuid>) */
  private _queryProfessionalId: string | undefined;

  // Add missing signal
  googleIntegration = signal<any>(null);
  availableCalendars = signal<any[]>([]); // New signal for calendars
  availableResources = signal<Resource[]>([]); // New signal for resources
  companySettings = signal<any>(null);
  savingSettings = signal(false);
  viewSettingsMode = signal<'desktop' | 'mobile'>('desktop');

  // Computed: get the enabled views based on current mode
  enabledViewsForMode = computed(() => {
    const mode = this.viewSettingsMode();
    return mode === 'desktop'
      ? this.bookingConstraints().enabledViews_desktop || ['agenda', 'week', '3days', 'day', 'month']
          : this.bookingConstraints().enabledViews_mobile || ['agenda', 'week', '3days', 'day', 'month'];
  });

  // Computed: return bookingConstraints with enabledViews updated based on current mode
  bookingConstraintsForCalendar = computed(() => {
    const constraints = this.bookingConstraints();
    const owner = this.isOwner();
    // Owner: ONLY 'agenda' view. Others: configured views WITHOUT 'agenda'
    const modeViews = this.enabledViewsForMode();
    const nonOwnerViews = modeViews.filter(v => v !== 'agenda');
    const enabledViews = owner ? ['agenda'] : (nonOwnerViews.length ? nonOwnerViews : ['week']);
    // Default view: 'agenda' for owner, first non-agenda view for others
    const defaultView = owner
      ? 'agenda'
      : (constraints.defaultView && constraints.defaultView !== 'agenda'
          ? constraints.defaultView
          : enabledViews[0]);
    return {
      ...constraints,
      enabledViews,
      defaultView,
    };
  });

  // ─── Filtros Visibles en el Portal (desde Edge Functions) ───
  portalFilters = signal<Array<{ id: string; label: string; icon: string; sort_order: number; visible: boolean }>>([]);
  portalFiltersLoading = signal(false);
  portalFiltersError = signal<string | null>(null);
  savingPortalFilters = signal(false);

  isFilterEnabled(filterId: string): boolean {
    return this.portalFilters().find(f => f.id === filterId)?.visible ?? true;
  }

  async toggleFilter(filterId: string) {
    const filters = this.portalFilters();
    const filter = filters.find(f => f.id === filterId);
    if (!filter) return;

    const visibleCount = filters.filter(f => f.visible).length;
    if (filter.visible && visibleCount <= 1) {
      this.toastService.error('Configuración', 'Al menos un filtro debe estar activo');
      return;
    }

    // Optimistic local update
    const newFilters = filters.map(f =>
      f.id === filterId ? { ...f, visible: !f.visible } : f
    );
    this.portalFilters.set(newFilters);

    // Persist via edge function
    await this.savePortalFilters(newFilters);
  }

  async loadPortalFilters() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    this.portalFiltersLoading.set(true);
    this.portalFiltersError.set(null);

    try {
      // Read filters directly from the table — avoids needing edge functions
      // and respects RLS automatically.
      const { data: defs, error: defsError } = await this.supabase
        .getClient()
        .from('filter_definitions')
        .select('id, label, icon, sort_order')
        .order('sort_order', { ascending: true });

      if (defsError) throw defsError;

      const { data: visibility, error: visError } = await this.supabase
        .getClient()
        .from('company_filter_visibility')
        .select('filter_id, visible')
        .eq('company_id', companyId);

      if (visError) throw visError;

      const visMap = new Map((visibility || []).map((v: any) => [v.filter_id, v.visible]));
      const filters = (defs || []).map((d: any) => ({
        id: d.id,
        label: d.label,
        icon: d.icon,
        sort_order: d.sort_order,
        visible: visMap.has(d.id) ? visMap.get(d.id) : true,
      }));

      this.portalFilters.set(filters);
    } catch (err: any) {
      console.error('[PortalFilters] Error loading:', err);
      this.portalFiltersError.set(err?.message || 'Error al cargar los filtros del portal');
    } finally {
      this.portalFiltersLoading.set(false);
    }
  }

  async savePortalFilters(filters: Array<{ id: string; visible: boolean }>) {
    this.savingPortalFilters.set(true);

    try {
      const companyId = this.authService.currentCompanyId();
      if (!companyId) throw new Error('No company selected');

      // Upsert each filter's visibility — direct table write respects RLS.
      const rows = filters.map((f) => ({
        company_id: companyId,
        filter_id: f.id,
        visible: f.visible,
      }));

      const { error } = await this.supabase
        .getClient()
        .from('company_filter_visibility')
        .upsert(rows, { onConflict: 'company_id,filter_id' });

      if (error) throw error;

      this.toastService.success('Configuración', 'Filtros del portal actualizados correctamente');
    } catch (err: any) {
      console.error('[PortalFilters] Error saving:', err);

      // Revert optimistic update by reloading
      await this.loadPortalFilters();

      this.toastService.error(
        'Configuración',
        err?.message || 'No se pudieron guardar los filtros del portal'
      );
    } finally {
      this.savingPortalFilters.set(false);
    }
  }

  saveSettings() {
    this.saving = true;
    this.settingsService
      .upsertCompanySettings({
        default_calendar_view: this.bookingSettings.slot_interval.toString(), // or whichever field corresponds to slot_interval in your schema
        // ... map other fields
      } as any)
      .subscribe({
        next: () => {
          this.toastService.success('Configuración', 'Ajustes guardados correctamente');
          this.saving = false;
        },
        error: (err: any) => {
          console.error('Error saving booking settings:', err);
          this.toastService.error('Configuración', 'No se pudieron guardar los ajustes');
          this.saving = false;
        },
      });
  }

  // Role detection
  userRole = this.authService.userRole;
  isClient = computed(() => this.userRole() === 'client');
  isProfessional = computed(() => this.userRole() === 'professional');
  isOwner = computed(() => this.userRole() === 'owner' || this.userRole() === 'supervisor');
  // CRITICAL: must derive from authService to stay in sync when user switches professional mode
  currentProfessionalId = computed(() => this.authService.activeProfessionalId());

  // Derived slug for the current professional (for pretty public booking URLs)
  currentProfessionalSlug = computed(() => {
    const profId = this.currentProfessionalId();
    if (!profId) return null;
    const prof = this.professionals().find((p) => p.id === profId);
    return prof?.slug || null;
  });

  /** When the current user is a professional, filter services to only those they can perform */
  filteredBookableServices = computed(() => {
    const services = this.bookableServices();
    // If eventToEdit has a professional set (e.g. when clicking on a specific column,
    // OR when editing an existing booking), filter by THAT professional's services.
    // Otherwise use the current logged-in professional.
    let profId = this.currentProfessionalId();
    // `editProfObject` is the full Professional object if available — preferred
    // because it has the .services array already populated, so we don't need
    // to look it up in the (possibly still-loading) `this.professionals()` list.
    let editProfObject: any = null;
    const edit = this.eventToEdit();
    if (edit?.professional?.id) {
      profId = edit.professional.id;
      // Use the embedded object ONLY if it has a services array — otherwise
      // we still have to look it up in the professionals list.
      if (Array.isArray(edit.professional.services)) {
        editProfObject = edit.professional;
      }
    } else if (edit?.extendedProps?.shared?.professionalId) {
      // Editing a FullCalendar event — the professional lives in extendedProps
      profId = edit.extendedProps.shared.professionalId;
    } else if (edit?.extendedProps?.shared?.professional?.id) {
      profId = edit.extendedProps.shared.professional.id;
    }
    // No active professional → owner mode → show all company services
    if (!profId) return services;

    // Get the service-id set for this professional. Prefer the embedded
    // object (faster + works even if `this.professionals()` hasn't loaded
    // yet or is missing this entry), fall back to the loaded list.
    let myServiceIds: Set<string> | null = null;
    if (editProfObject?.services?.length) {
      myServiceIds = new Set(editProfObject.services.map((s: any) => s.id));
    } else {
      const prof = this.professionals().find((p) => p.id === profId);
      // If the professional isn't loaded yet (e.g. calendar opened a new
      // event before the professionals query resolved) and the embedded
      // object didn't carry services, DON'T drop the list — return the
      // full company services. The next time this computed runs (when
      // `professionals` updates) the filter will kick in.
      if (!prof) {
        // Trigger a reload if we don't have the professional yet.
        if (!this.isProfessionalsLoaded) {
          this.loadProfessionalsBasic();
        }
        return services;
      }
      if (prof.services?.length) {
        myServiceIds = new Set(prof.services.map((s: any) => s.id));
      }
      // If the loaded professional has no services assigned, the filter
      // set is empty — return [] (no services available for them).
    }
    let filtered = myServiceIds
      ? services.filter((s) => myServiceIds!.has(s.id))
      : services;

    // When editing a booking whose service is NOT in the bookable list
    // (e.g. it was renamed or flagged is_bookable=false but the booking
    // still references the old one), inject the original service so the
    // form can pre-select it and the user can see what the booking had.
    // Without this, the service dropdown appears empty and the user has
    // no clue why or how to fix it.
    if (edit?.extendedProps?.shared?.serviceId) {
      const editServiceId = edit.extendedProps.shared.serviceId;
      if (!filtered.some((s) => s.id === editServiceId)) {
        const editServiceName =
          edit.extendedProps.shared.serviceName ||
          (typeof edit.title === 'string' ? edit.title : '') ||
          'Servicio';
        filtered = [
          {
            id: editServiceId,
            name: editServiceName,
            duration_minutes: 60,
            base_price: undefined,
            is_bookable: false,
            _legacyStub: true,
          } as any,
          ...filtered,
        ];
      }
    }
    return filtered;
  });

  // Modal state
  showEventModal = false;
  eventToEdit = signal<any | null>(null);
  selectedDate: Date | null = null;
  selectedEventDetails: any | null = null;
  isDeletingEvent = signal(false);
  isUpdatingPayment = signal(false);

  // State for the styled delete-confirmation dialog (replaces native confirm()).
  // The event being considered for deletion is stored on the dialog object so
  // the (confirm) handler knows what to act on. Default values match the
  // shared <app-confirm-dialog> contract.
  deleteEventDialog: {
    isOpen: boolean;
    event: any | null;
    // Pre-computed display fields (formatted strings) so the template doesn't
    // have to repeat date/number formatting logic. Populated by
    // openDeleteEventDialog() and read by the template.
    title: string;
    message: string;
    type: 'danger' | 'warning';
    customerName: string;
    serviceName: string;
    professionalName: string;
    startTimeFormatted: string;
    durationMinutes: number;
    hasLocalBooking: boolean;
    hasGoogleEvent: boolean;
    // Resolved from `company_settings.email_preferences.booking_cancellation_client`.
    // `null` means preference not set yet → defaults to ON in the UI (matches
    // the email-preferences component default). When `false`, we don't show the
    // "cancellation email will be sent" line in the dialog.
    sendCancellationEmail: boolean;
  } = {
    isOpen: false,
    event: null,
    title: 'Eliminar reserva',
    message: '',
    type: 'danger',
    customerName: '',
    serviceName: '',
    professionalName: '',
    startTimeFormatted: '',
    durationMinutes: 0,
    hasLocalBooking: false,
    hasGoogleEvent: false,
    sendCancellationEmail: true,
  };
  calendarComponent = viewChild<any>('calendarComponent');
  // CRITICAL: must be a signal to avoid NG0100 ExpressionChangedAfterItHasBeenCheckedError
  loadedRange = signal<{ start: Date; end: Date } | null>(null);

  // Public URL logic - computed to reactively update when professionalId changes
  publicBookingUrl = computed(() => {
    const companySlug = this.companySettings()?.slug;
    if (!companySlug) return '';
    const profSlug = this.currentProfessionalSlug();
    const professionalId = this.currentProfessionalId();
    let url = `https://agenda.simplificacrm.es/${companySlug}/servicios`;
    // Prefer slug for pretty URLs; fall back to professional_id for backward compatibility
    if (profSlug) {
      url += `?professional=${profSlug}`;
    } else if (professionalId) {
      url += `?professional_id=${professionalId}`;
    }
    return url;
  });

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.toastService.success('Copiado', 'Enlace copiado al portapapeles');
    });
  }

  shareBookingUrl() {
    const url = this.publicBookingUrl();
    if (navigator.share) {
      navigator.share({ title: 'Agenda', url }).catch(() => {
        // User cancelled or error — fallback to copy
        this.copyToClipboard(url);
      });
    } else {
      this.copyToClipboard(url);
    }
  }

  // Cached public user ID to avoid repeated auth.getUser() + users lookup
  private cachedPublicUserId: string | null = null;
  private destroyRef = inject(DestroyRef);

  constructor() {
    // Watch for professional profile changes (mode on/off OR switching between profiles)
    // Using effect() instead of setInterval — signals auto-track dependencies
    effect(() => {
      const _currentMode = this.authService.isInProfessionalMode();
      const _currentProfId = this.authService.activeProfessionalId();

      // Skip the first run — only react to CHANGES
      if (!this._profileModeInitialized) {
        this._profileModeInitialized = true;
        return;
      }

      // Signal loading BEFORE clearing so the calendar skeleton shows immediately,
      // avoiding a flash of empty state. We skip calendarEvents.set([]) and let
      // ngOnInit (triggered by the router navigation) do the real reload.
      this.isLoadingCalendar.set(true);
    });
  }

  private _profileModeInitialized = false;

  async ngOnInit() {
    // Collapsar la sidebar temporalmente al entrar a Reservas para maximizar el espacio del calendario
    this.sidebarService.setCollapsed(true);

    // Fire-and-forget: load the Google Calendar sync setting so onEventChange /
    // deleteEvent can skip the google-auth roundtrip when disabled. The setting
    // defaults to true in the service, so the first sync calls before this
    // resolves are still safe (they'll go through and notify Google).
    this.loadGoogleCalendarSyncSetting();

    // Phase 0a: company settings are small & fast — load first (needed for UI chrome)
    await this.loadCompanySettings();

    // Phase 0b: professionals MUST be resolved BEFORE loading services, so the
    // service filter has a real professionalId for native professionals (whose
    // activeProfessionalId signal only sets after linkedProfessionals loads).
    // Without this, getBookableServices was called with `null` and the modal
    // listed every service in the company — a data leak analogous to the
    // bookings one. We await it (small query, blocking cost is negligible).
    await this.loadProfessionalsBasic();

    // Phase 0c: services + availability sequentially to avoid saturating the DB
    // connection pool with concurrent RLS-heavy queries. Pass the resolved
    // professionalId so the modal lists ONLY the active professional's services.
    await this.loadBookableServices(undefined, this.currentProfessionalId() ?? this._resolvedProfessionalId ?? undefined);
    await this.loadAvailabilityConstraints();

    // Phase 0d: load blocked dates for the active professional so the
    // calendar can render them as unavailable days.
    this.loadBlockedDatesForActiveProfessional();

    // Now subscribe to query params and trigger tab loading
    // (settings are already loaded, so the calendar tab won't race)
    this.queryParamsSub = this.route.queryParams.subscribe((params) => {
      const allowedTabs = this.isClient()
        ? ['services', 'professionals']
        : [
            'professionals',
            'resources',
            'availability',
            'calendar',
            'general',
            'unlinked',
            'unlinked-report',
          ];
      if (params['tab'] && allowedTabs.includes(params['tab'])) {
        this.activeTab = params['tab'] as any;
      } else if (this.isClient() && !['services', 'professionals'].includes(this.activeTab)) {
        this.activeTab = 'services';
      }

      // Apply professional filter from URL (e.g. ?professional=<slug>)
      // Resolved below in handleTabChange — professionals must be loaded first
      if (params['professional']) {
        this._queryProfessionalSlug = params['professional'];
      } else if (params['professional_id']) {
        this._queryProfessionalId = params['professional_id'];
      }

      this.handleTabChange(this.activeTab);
    });

    this.setupRealtime();
  }

  ngOnDestroy() {
    this.queryParamsSub?.unsubscribe();
    if (this._realtimeDebounceTimer) clearTimeout(this._realtimeDebounceTimer);
    if (this.realtimeSubscription) {
      this.supabase.getClient().removeChannel(this.realtimeSubscription);
    }
  }

  switchTab(
    tab:
      | 'services'
      | 'professionals'
      | 'resources'
      | 'availability'
      | 'calendar'
      | 'general'
      | 'unlinked'
      | 'unlinked-report',
  ) {
    this.activeTab = tab;
    this.handleTabChange(tab);
  }

  private async handleTabChange(tab: string) {
    if (tab === 'calendar') {
      // ─── STEP 1: Resolve professional & update bookingConstraints ───
      // This MUST run regardless of isLoadingCalendar — otherwise the user
      // sees all 4 views for 3 seconds while the auth effect resolves.
      let professionalId: string | undefined;
      let professionalCalendarViews: string[] | undefined;
      const userRole = this.authService.userRole();
      const isProfessionalMode = this.authService.isInProfessionalMode();
      const shouldFilterByProfessional = userRole === 'professional' || isProfessionalMode;

      if (shouldFilterByProfessional) {
        const companyId = this.authService.currentCompanyId();
        const authUserId = (await this.supabase.getClient().auth.getUser()).data.user?.id;
        if (authUserId && companyId) {
          const { data: userData } = await this.supabase.getClient()
            .from('users').select('id').eq('auth_user_id', authUserId).single();
          const publicUserId = userData?.id;
          if (publicUserId) {
            const { data } = await this.supabase.getClient()
              .from('professionals').select('id, calendar_views').eq('user_id', publicUserId).eq('company_id', companyId).maybeSingle();
            professionalId = data?.id;
            professionalCalendarViews = data?.calendar_views;
          }
        }

        if (!professionalId && companyId) {
          const linked = this.authService.linkedProfessionals();
          const matchingProf = linked.find(p => p.company_id === companyId);
          if (matchingProf) professionalId = matchingProf.id;
        }

        if (!professionalId && this._queryProfessionalId) professionalId = this._queryProfessionalId;
        if (!professionalId && this._queryProfessionalSlug) {
          const slugProf = this.professionals().find(p => p.slug === this._queryProfessionalSlug);
          if (slugProf) professionalId = slugProf.id;
        }

        if (!professionalId) professionalId = this.currentProfessionalId() ?? undefined;
      }

      this._resolvedProfessionalId = professionalId;
      this._queryProfessionalId = undefined;
      this._queryProfessionalSlug = undefined;

      // Apply calendar_views to constraints
      if (professionalCalendarViews?.length) {
        this.bookingConstraints.update(prev => ({
          ...prev,
          enabledViews: professionalCalendarViews,
          enabledViews_desktop: professionalCalendarViews,
          enabledViews_mobile: professionalCalendarViews,
          defaultView: professionalCalendarViews[0],
        }));
      } else if (shouldFilterByProfessional) {
        const safeViews = ['week', '3days', 'day', 'month'];
        this.bookingConstraints.update(prev => ({
          ...prev,
          enabledViews: safeViews,
          enabledViews_desktop: safeViews,
          enabledViews_mobile: safeViews,
          defaultView: 'week',
        }));
      }

      // ─── STEP 2: Guard events loading (runs AFTER constraints are applied) ───
      if (this.isLoadingCalendar()) return;

      // Load professionals FIRST to ensure currentProfessionalId is set before loading events.
      // Always refresh — even if calendar is already loaded — so newly created professionals appear.
      await this.loadProfessionalsBasic();

      if (!this.isCalendarLoaded) {
        const start = this.addMonths(new Date(), -1);
        const end = this.addMonths(new Date(), 2);
        // professionalId is already fully resolved above (DB → linkedProfessionals → signal)
        await this.loadCalendarEvents(start, end, false, professionalId);
      // Phase 2: secondary data for modals (deferred, won't block render)
      this.loadClientsBasic(1, professionalId);
      this.loadAvailableResources();
      this.loadAvailableCalendars();
      // Load source icons for calendar event chip badges
      const srcCompanyId = this.authService.currentCompanyId();
      if (srcCompanyId) this.calendarComponent()?.loadSourceIcons(srcCompanyId);
    }
  } else if (tab === 'professionals') {
      if (!this.isProfessionalsLoaded) {
        this.loadProfessionals();
      }
      // Always ensure resources and calendars are loaded for the edit modal
      if (!this.isResourcesLoaded) {
        this.loadAvailableResources();
      }
      if (!this.isCalendarsLoaded) {
        this.loadAvailableCalendars();
      }
    } else if (tab === 'resources') {
      if (!this.isResourcesLoaded) {
        this.loadAvailableResources();
      }
      // Ensure calendars are loaded for the edit modal
      if (!this.isCalendarsLoaded) {
        this.loadAvailableCalendars();
      }
    } else {
      // general and any other tab — ensure calendars are loaded for modals
      if (!this.isCalendarsLoaded) {
        this.loadAvailableCalendars();
      }
      // Load portal filters for the general settings sub-tab
      if (tab === 'general') {
        this.loadPortalFilters();
      }
    }
  }

  setupRealtime() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    // Remove any stale channel with the same base name (e.g. from a previous
    // component instance that was destroyed before removeChannel resolved).
    const client = this.supabase.getClient();
    client.getChannels()
      .filter((c: any) => c.topic?.startsWith('realtime:company-bookings-realtime'))
      .forEach((c: any) => client.removeChannel(c));

    this.realtimeSubscription = client
      .channel(this.realtimeChannelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `company_id=eq.${companyId}` },
        () => {
          // Debounce: bulk operations (e.g. backfill-gcal-bookings) fire one UPDATE
          // per booking — without debounce, 50–200 updates would trigger 50–200
          // google-auth calls within seconds and hit the 30 req/min rate limit.
          if (this._realtimeDebounceTimer) clearTimeout(this._realtimeDebounceTimer);
          this._realtimeDebounceTimer = setTimeout(() => {
            this._realtimeDebounceTimer = null;
            const range = this.loadedRange();
            const profId = this.currentProfessionalId() ?? this._resolvedProfessionalId;
            if (range && profId) {
              this.loadCalendarEvents(range.start, range.end, true, profId);
            } else if (!range) {
              // Calendar hasn't been viewed yet — don't lose the event.
              // Reload the full current month instead.
              const now = new Date();
              const start = new Date(now.getFullYear(), now.getMonth(), 1);
              const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
              this.loadCalendarEvents(start, end, true, profId);
            }
          }, 3000);
        },
      )
      .subscribe();
  }

  async loadCompanySettings() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    // Run both queries in parallel to avoid sequential waterfall
    const [companyResult, settings] = await Promise.all([
      this.supabase
        .getClient()
        .from('companies')
        .select('id, name, slug, logo_url, settings')
        .eq('id', companyId)
        .single(),
      new Promise<any>((resolve) => {
        this.settingsService.getCompanySettings().subscribe({
          next: (s) => resolve(s),
          error: () => resolve(null),
        });
      }),
    ]);

    if (companyResult.error) {
      console.error('Error loading company data:', companyResult.error);
      return;
    }

    const company = companyResult.data;
    this.companySettings.set({
      ...settings,
      slug: company.slug,
      name: company.name,
      settings: company.settings,
    });

    // Determine which default view to use based on device
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const desktopView = settings?.default_calendar_view;
    const mobileView = settings?.default_calendar_view_mobile;
    const view = isMobile ? mobileView || 'agenda' : desktopView || 'agenda';

    // Restore persisted enabled views from companies.settings JSONB
    const savedDesktopViews = company.settings?.enabledViews_desktop;
    const savedMobileViews = company.settings?.enabledViews_mobile;

    this.bookingConstraints.update((prev) => ({
      ...prev,
      defaultView: view || prev.defaultView,
      ...(savedDesktopViews ? { enabledViews_desktop: savedDesktopViews } : {}),
      ...(savedMobileViews ? { enabledViews_mobile: savedMobileViews } : {}),
    }));
  }

  updateGeneralSettings(key: string, value: any) {
    this.savingSettings.set(true);
    this.settingsService.upsertCompanySettings({ [key]: value } as any).subscribe({
      next: (settings) => {
        this.companySettings.set(settings);
        this.savingSettings.set(false);

        // Update default view if it was changed
        if (key === 'default_calendar_view' || key === 'default_calendar_view_mobile') {
          const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
          const desktopView = settings?.default_calendar_view;
          const mobileView = settings?.default_calendar_view_mobile;
          const view = isMobile ? mobileView || 'agenda' : desktopView || 'agenda';

          if (view) {
            this.bookingConstraints.update((prev) => ({
              ...prev,
              defaultView: view,
            }));
          }
        }
      },
      error: (err) => {
        console.error('Error updating settings', err);
        this.savingSettings.set(false);
      },
    });
  }

  // Availability Constraints
  bookingConstraints = signal<{
    minHour: number;
    maxHour: number;
    workingDays: number[];
    schedules?: any[];
    enabledViews?: string[];
    enabledViews_desktop?: string[];
    enabledViews_mobile?: string[];
    defaultView?: string;
  }>({
    minHour: 8,
    maxHour: 20,
    workingDays: [1, 2, 3, 4, 5],
    schedules: [],
    enabledViews: ['agenda', 'week', '3days', 'day', 'month'],
    enabledViews_desktop: ['agenda', 'week', '3days', 'day', 'month'],
    enabledViews_mobile: ['agenda', 'week', '3days', 'day', 'month'],
  });

  private bookingsService = inject(SupabaseBookingsService);
  private blockedDatesService = inject(ProfessionalBlockedDatesService);

  /** Blocked dates for the currently-active professional (empty when owner in
   *  owner mode, since owner-mode can see all pros and each has their own
   *  blocks — we don't render that complexity in the shared calendar). */
  blockedDates = signal<ProfessionalBlockedDate[]>([]);
  private budgetNotificationSettings = inject(BudgetNotificationSettingsService);

  /**
   * Cached value of `budget_notification_settings.booking_google_calendar_enabled`
   * for the active company. When `false`, the component SKIPS all `google-auth`
   * calls (update-event / delete-event) to avoid wasting API quota and to
   * prevent Google from sending its own attendee notification emails.
   * Loaded once on construction and refreshed whenever the user changes
   * the setting in "Configuración > Notificaciones".
   */
  private googleCalendarSyncEnabled = signal<boolean>(true);

  private async loadGoogleCalendarSyncSetting(): Promise<void> {
    try {
      const s = await this.budgetNotificationSettings.getSettings();
      this.googleCalendarSyncEnabled.set(s.booking_google_calendar_enabled !== false);
    } catch (err) {
      // On any error, default to enabled (preserve current behavior).
      console.warn('[booking-settings] could not load booking_google_calendar_enabled:', err);
      this.googleCalendarSyncEnabled.set(true);
    }
  }

  /** Resolve and cache the public user ID (avoids repeated auth.getUser + users lookup) */
  private async resolvePublicUserId(): Promise<string | null> {
    if (this.cachedPublicUserId) return this.cachedPublicUserId;

    const client = this.supabase.getClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;

    const { data: publicUser } = await client
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!publicUser) return null;

    this.cachedPublicUserId = publicUser.id;
    return publicUser.id;
  }

  /** Resolve and cache the Google Calendar integration (avoids repeated lookups) */
  private async resolveGoogleIntegration(client: any): Promise<any> {
    const existing = this.googleIntegration();
    if (existing) return existing;

    const publicUserId = await this.resolvePublicUserId();
    if (!publicUserId) return null;

    const { data: integ } = await client
      .from('integrations')
      .select('metadata')
      .eq('user_id', publicUserId)
      .eq('provider', 'google_calendar')
      .maybeSingle();

    this.googleIntegration.set(integ);
    return integ;
  }

  async loadAvailabilityConstraints() {
    // Use userProfileSignal (instant, from cache) instead of resolvePublicUserId (async)
    // This ensures constraints are ready before the calendar tab renders.
    const appUser = this.authService.userProfileSignal();
    if (!appUser?.id) return;

    this.bookingsService.getAvailabilitySchedules(appUser.id).subscribe({
      next: async (schedules: any[]) => {
        // Apply constraints if we got any schedules (even empty array = keep defaults)
        if (schedules?.length) {
          this.applyScheduleConstraints(schedules);
          return;
        }

        // Professional user: use their own professional_schedules as calendar constraints
        // (NOT the union of all professionals — that would show irrelevant time ranges)
        if (this.isProfessional()) {
          const companyId = this.authService.currentCompanyId();
          if (companyId) {
            try {
              const { data: profData } = await this.supabase.getClient()
                .from('professionals')
                .select('id')
                .eq('user_id', appUser.id)
                .eq('company_id', companyId)
                .maybeSingle();
              if (profData?.id) {
                const profSchedules = await this.professionalsService.getProfessionalSchedules(profData.id);
                const activeSchedules = profSchedules.filter((s: any) => s.is_active);
                if (activeSchedules.length > 0) {
                  this.applyScheduleConstraints(activeSchedules);
                }
                // else: no active schedules → keep company defaults (8-20, Mon-Fri)
              }
            } catch (err) {
              console.error('Error loading professional schedule constraints', err);
            }
          }
          return; // don't fall through to the all-professionals owner fallback
        }

        // Owner: first check if they also have their OWN professional record with schedules
        // (an owner can also be a professional with configured working hours)
        const ownerCompanyId = this.authService.currentCompanyId();
        if (ownerCompanyId) {
          try {
            const { data: ownerProfData } = await this.supabase.getClient()
              .from('professionals')
              .select('id')
              .eq('user_id', appUser.id)
              .eq('company_id', ownerCompanyId)
              .maybeSingle();
            if (ownerProfData?.id) {
              const ownerProfSchedules = await this.professionalsService.getProfessionalSchedules(ownerProfData.id);
              const ownerActiveSchedules = ownerProfSchedules.filter((s: any) => s.is_active);
              if (ownerActiveSchedules.length > 0) {
                this.applyScheduleConstraints(ownerActiveSchedules);
                return; // Owner has their own professional schedules, use those
              }
            }
          } catch (err) {
            console.error('Error loading owner professional schedule constraints', err);
          }
        }

        // Owner has no professional record (or no active schedules) →
        // compute range from all professionals so the owner sees every possible slot.
        this.professionalsService.getProfessionals().subscribe({
          next: (profs: any[]) => {
            const allSchedules = profs
              .flatMap((p: any) => p.schedules || [])
              .filter((s: any) => s.is_active);
            if (allSchedules.length > 0) {
              this.applyScheduleConstraints(allSchedules);
            }
            // else keep defaults (8-20)
          },
          error: (err: any) => console.error('Error loading professional schedules', err),
        });
      },
      error: (err: any) => console.error('Error loading availability constraints', err),
    });
  }

  private applyScheduleConstraints(schedules: any[]) {
    const workingDays = [...new Set(schedules.map((s: any) => Number(s.day_of_week)))];

    let minH = 24;
    let maxH = 0;

    schedules.forEach((s: any) => {
      // Support new slots array format
      if (s.slots && Array.isArray(s.slots) && s.slots.length > 0) {
        s.slots.forEach((slot: any) => {
          const startH = parseInt(slot.start.split(':')[0], 10);
          const endH = parseInt(slot.end.split(':')[0], 10) + 1; // +1 buffer
          if (startH < minH) minH = startH;
          if (endH > maxH) maxH = endH;
        });
      } else if (s.start_time && s.end_time) {
        // Legacy fallback
        const startH = parseInt(s.start_time.split(':')[0], 10);
        let endH = parseInt(s.end_time.split(':')[0], 10);
        const endM = parseInt(s.end_time.split(':')[1], 10);
        endH = endH + 1; // Add 1-hour buffer
        if (startH < minH) minH = startH;
        if (endH > maxH) maxH = endH;
      }
    });

    this.bookingConstraints.update((prev) => ({
      ...prev,
      minHour: minH === 24 ? 8 : minH,
      maxHour: maxH === 0 ? 20 : maxH,
      workingDays: workingDays,
      schedules: schedules.map((s: any) => ({
        ...s,
        day_of_week: Number(s.day_of_week),
      })),
    }));
  }

  loadProfessionals() {
    this.professionalsService.getProfessionals().subscribe({
      next: (data: Professional[]) => {
        this.professionals.set(data);
        this.isProfessionalsLoaded = true;
      },
      error: (err: any) => console.error('Error loading professionals', err),
    });
  }

  getProfessionalSchedules(professionalId: string): Observable<any[]> {
    return from(this.professionalsService.getProfessionalSchedules(professionalId)).pipe(
      map(schedules => schedules || []),
    );
  }

  /** Lightweight professionals load for calendar rendering (no nested JOINs) */
  loadProfessionalsBasic() {
    return new Promise<void>((resolve) => {
      // Use getProfessionals (not getProfessionalsBasic) to ensure services are included
      this.professionalsService.getProfessionals().subscribe({
        next: (data: any[]) => {
          this.professionals.set(data as Professional[]);
          // NOTE: currentProfessionalId is now a computed derived from authService.activeProfessionalId()
          // so no need to set it here — it's always in sync with the auth service
          this.isProfessionalsLoaded = true;
          resolve();
        },
        error: (err: any) => {
          console.error('Error loading professionals', err);
          resolve();
        },
      });
    });
  }

  /**
   * Loads the blocked dates for the currently-active professional so the
   * calendar can render them as unavailable days. Owners in owner mode (no
   * active professional) get an empty list — each pro has their own blocks
   * and the shared calendar doesn't aggregate them.
   */
  loadBlockedDatesForActiveProfessional() {
    const profId = this.currentProfessionalId() ?? this._resolvedProfessionalId;
    if (!profId) {
      this.blockedDates.set([]);
      return;
    }
    this.blockedDatesService.getBlockedDates([profId]).subscribe({
      next: (dates) => this.blockedDates.set(dates ?? []),
      error: (err) => {
        console.error('Error loading blocked dates for active professional:', err);
        this.blockedDates.set([]);
      },
    });
  }

  /** Lightweight clients load for calendar dropdowns (no JOINs)
   * @param professionalId - if provided, load only clients for this professional (owner clicking column) */
  async loadClientsBasic(retries = 1, professionalId?: string) {
    console.log('[booking-settings] loadClientsBasic called, professionalId:', professionalId, 'userRole:', this.authService.userRole(), 'isInProfessionalMode:', this.authService.isInProfessionalMode(), 'activeProfessionalId:', this.authService.activeProfessionalId(), 'currentCompanyId:', this.authService.currentCompanyId());
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    // Fallback: if no explicit ID but user is a professional, resolve from DB
    if (!professionalId && this.authService.userRole() === 'professional') {
      try {
        const { data: { user } } = await this.supabase.getClient().auth.getUser();
        if (user) {
          const { data: userData } = await this.supabase.getClient()
            .from('users').select('id').eq('auth_user_id', user.id).single();
          if (userData?.id) {
            const { data: profData } = await this.supabase.getClient()
              .from('professionals').select('id').eq('user_id', userData.id).eq('company_id', companyId!).maybeSingle();
            professionalId = profData?.id;
          }
        }
      } catch (e) { /* fall through */ }
    }

    this.customersService.getClientsBasic(companyId, professionalId).subscribe({
      next: (data: any[]) => {
        const mapped = data.map((c: any) => ({
          ...c,
          displayName: `${c.name || ''} ${c.surname || ''} (${c.email || ''})`.trim(),
        }));
        this.clients.set(mapped);
        this.isClientsLoaded = true;
      },
      error: (err: any) => {
        if (err?.code === '57014' && retries > 0) {
          setTimeout(() => this.loadClientsBasic(retries - 1, professionalId), 1000);
          return;
        }
        console.error('Error loading clients:', err);
      },
    });
  }

  createEvent(dateOrClick?: Date | CalendarDateClick, preselectedService?: Service, preselectedProfessional?: Professional) {
    // Handle both Date and CalendarDateClick formats
    let date: Date;
    let clickProfessional: Professional | undefined;
    if (dateOrClick instanceof Date) {
      date = dateOrClick;
    } else if (dateOrClick && 'date' in dateOrClick) {
      date = dateOrClick.date;
      clickProfessional = dateOrClick.professional;
    } else {
      date = new Date();
    }
    this.selectedDate = date;
    this.eventToEdit.set(null);

    // When professional role creates event from clicking on a column, pre-select that professional
    // Also pre-select for admins/owners clicking on a specific professional's column
    if (clickProfessional) {
      this.eventToEdit.set({
        professional: clickProfessional,
        service: preselectedService,
      });
    } else if (preselectedService || preselectedProfessional) {
      this.eventToEdit.set({
        service: preselectedService,
        professional: preselectedProfessional,
      });
    } else {
      this.eventToEdit.set(null);
    }

    // Ensure resources are loaded before showing the modal
    if (!this.isResourcesLoaded) {
      this.isResourcesLoaded = false; // Reset to force reload in case of prior empty result
      this.loadAvailableResources();
    }

    // Load clients filtered by the clicked professional column (owner viewing in owner mode).
    // This fetches only the clients assigned to that professional via client_assignments.
    // No forcedProfessionalId → loads all company clients (cache key = companyId).
    if (clickProfessional) {
      this.loadClientsBasic(1, clickProfessional.id);
    } else if (this.authService.userRole() === 'professional') {
      // Professionals: always load fresh clients when opening the modal
      this.loadClientsBasic(1);
    }

    this.showEventModal = true;
  }

  toggleCalendarView(view: string) {
    const mode = this.viewSettingsMode();
    const companyId = this.authService.currentCompanyId();

    this.bookingConstraints.update((prev) => {
      const current =
        mode === 'desktop'
          ? prev.enabledViews_desktop || ['agenda', 'week', '3days', 'day', 'month']
          : prev.enabledViews_mobile || ['agenda', 'week', '3days', 'day', 'month'];

      let next: string[];
      if (current.includes(view)) {
        if (current.length <= 1) return prev;
        next = current.filter((v) => v !== view);
      } else {
        next = [...current, view];
      }

      const update = { ...prev };
      if (mode === 'desktop') {
        update.enabledViews_desktop = next;
      } else {
        update.enabledViews_mobile = next;
      }

      // Persist to companies.settings JSONB
      if (companyId) {
        const existingSettings = this.companySettings()?.settings || {};
        const key = mode === 'desktop' ? 'enabledViews_desktop' : 'enabledViews_mobile';
        const newSettings = { ...existingSettings, [key]: next };
        this.supabase
          .getClient()
          .from('companies')
          .update({ settings: newSettings })
          .eq('id', companyId)
          .then(({ error }) => {
            if (error) {
              console.error('Error saving calendar views:', error);
              this.toastService.error('Configuración', 'No se pudieron guardar las vistas');
            } else {
              this.companySettings.update((prev) => ({ ...prev, settings: newSettings }));
            }
          });
      }

      return update;
    });
  }

  closeModal() {
    this.showEventModal = false;
    this.selectedDate = null;
    this.eventToEdit.set(null);
  }

  onEventClick(eventClick: any) {
    this.selectedEventDetails = eventClick.event;
  }

  closeEventDetails() {
    this.selectedEventDetails = null;
  }

  onEditEvent() {
    this.eventToEdit.set(this.selectedEventDetails);
    this.selectedEventDetails = null;
    // Ensure ALL arrays are loaded before modal opens (fixes edit form population race conditions)
    if (!this.isResourcesLoaded) {
      this.loadAvailableResources();
    }
    if (!this.isClientsLoaded) {
      this.loadClientsBasic();
    }
    // Force reload full professionals with services if not already loaded with services
    // (loadProfessionalsBasic() doesn't include services array, so we need the full query)
    if (!this.isProfessionalsLoaded || !this.professionals().some(p => p.services?.length)) {
      this.loadProfessionals();
    }
    this.showEventModal = true;
  }

  async updatePaymentStatus(event: any, status: 'paid' | 'pending') {
    if (!event || !event.extendedProps?.shared?.isLocal) {
      // Check if it's a local event. If e.isLocal is true or the extendedProp isLocal exists.
      const isLocal = event.isLocal || event.extendedProps?.shared?.isLocal;
      if (!isLocal) return;
    }

    const localId = event.extendedProps?.shared?.localBookingId || event.id;
    if (!localId) return;

    this.isUpdatingPayment.set(true);
    try {
      await this.bookingsService.updateBooking(localId, { payment_status: status });
      this.toastService.success(
        'Pago Actualizado',
        `La reserva se ha marcado como ${status === 'paid' ? 'pagada' : 'pendiente'}.`,
      );

      // Update local state in selectedEventDetails if it's the same event
      if (this.selectedEventDetails?.id === event.id) {
        this.selectedEventDetails = {
          ...this.selectedEventDetails,
          extendedProps: {
            ...this.selectedEventDetails.extendedProps,
            shared: {
              ...this.selectedEventDetails.extendedProps.shared,
              paymentStatus: status,
            },
          },
        };
      }

      // Reload calendar silently (Realtime will handle it, but for safety...)
      const range = this.loadedRange();
      if (range) {
        const profId = this.currentProfessionalId() ?? this._resolvedProfessionalId;
        await this.loadCalendarEvents(range.start, range.end, true, profId);
      }
    } catch (error: any) {
      console.error('Error updating payment status:', error);
      this.toastService.error('Error', 'No se pudo actualizar el estado de pago.');
    } finally {
      this.isUpdatingPayment.set(false);
    }
  }

  /**
   * Opens the styled confirmation dialog for deleting a booking. The actual
   * deletion is performed by `confirmDeleteEvent()` once the user confirms.
   *
   * The dialog pre-formats every field of the booking (client, service,
   * professional, date, duration) so the template can render a clean card
   * and the user can verify what they're deleting at a glance.
   */
  openDeleteEventDialog(event: any): void {
    const localBookingId = event.localBookingId || (event.isLocal ? event.id : null);
    const googleEventId = event.googleEventId || (event.isGoogle ? event.id : null);
    const hasLocalBooking = !!localBookingId;
    const hasGoogleEvent = !!googleEventId;

    const customerName =
      event.extendedProps?.customerName || event.title || 'Cliente sin nombre';
    const serviceName =
      event.extendedProps?.service?.name ||
      event.extendedProps?.shared?.serviceName ||
      '—';
    const professionalName =
      event.extendedProps?.professional?.display_name ||
      event.extendedProps?.shared?.professionalName ||
      'Sin asignar';

    // Date + time formatted for human reading.
    let startTimeFormatted = '';
    let durationMinutes = 0;
    if (event.start) {
      const start = new Date(event.start);
      startTimeFormatted = start.toLocaleString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      // Capitalize the first letter (toLocaleString returns lowercase on some locales).
      startTimeFormatted =
        startTimeFormatted.charAt(0).toUpperCase() + startTimeFormatted.slice(1);

      if (event.end) {
        const end = new Date(event.end);
        durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
      }
    }

    // Short summary line for screen-readers and as fallback message.
    const message =
      `Vas a eliminar la reserva de ${customerName}` +
      (startTimeFormatted ? ` del ${startTimeFormatted}` : '') +
      '. Esta acción no se puede deshacer.';

    // Read the cancellation-email toggle from company_settings so the
    // dialog tells the truth about what will happen. The toggle lives in
    // `company_settings.email_preferences.booking_cancellation_client`. If
    // the field is missing we default to true (matches the default in the
    // email-preferences component and in the booking-notifier Edge Function).
    const emailPrefs: any = (this.companySettings() as any)?.email_preferences ?? {};
    const sendCancellationEmail =
      emailPrefs.booking_cancellation_client !== false;

    this.deleteEventDialog = {
      isOpen: true,
      event,
      title: '¿Eliminar esta reserva?',
      message,
      type: 'danger',
      customerName,
      serviceName,
      professionalName,
      startTimeFormatted,
      durationMinutes,
      hasLocalBooking,
      hasGoogleEvent,
      sendCancellationEmail,
    };
  }

  onDeleteEventConfirm(): void {
    const event = this.deleteEventDialog.event;
    this.deleteEventDialog.isOpen = false;
    this.deleteEventDialog.event = null;
    if (event) {
      // Fire-and-forget: errors are surfaced via toast inside deleteEvent.
      this.deleteEvent(event);
    }
  }

  onDeleteEventCancel(): void {
    this.deleteEventDialog.isOpen = false;
    this.deleteEventDialog.event = null;
  }

  /**
   * Performs the actual deletion. Steps (must keep calendar email + cancellation
   * notification intact):
   *   1. Delete local booking → triggers `bookings` DELETE which fires the
   *      `booking-notifier` DB webhook → cancellation email to the client
   *      (and waitlist promotion if applicable).
   *   2. Delete the Google Calendar event via the `google-auth` Edge Function
   *      so the operator's calendar stays in sync — SKIPPED if the company
   *      has `booking_google_calendar_enabled=false` in notification settings.
   *   3. Refresh local UI state.
   */
  async deleteEvent(event: any) {
    this.isDeletingEvent.set(true);
    try {
      const calendarId = this.googleIntegration()?.metadata?.calendar_id_appointments;
      // Target the calendar ID used for this event, fallback to integration default
      const targetCalendarId = event.extendedProps?.shared?.professionalCalendarId || calendarId;

      // 1. Delete Local Booking if exists — this is what fires the
      //    booking-notifier webhook (cancellation email + waitlist promotion).
      const localBookingId = event.localBookingId || (event.isLocal ? event.id : null);
      if (localBookingId) {
        await this.bookingsService.deleteBooking(localBookingId);
        // Local booking deleted → cancellation email already dispatched by webhook
      }

      // 2. Delete Google Event if exists — keeps operator's calendar in sync
      //    and sends a Google Calendar cancellation to attendees.
      //    SKIPPED when the company has disabled Google Calendar sync.
      const googleEventId = event.googleEventId || (event.isGoogle ? event.id : null);
      if (
        googleEventId &&
        targetCalendarId &&
        this.googleCalendarSyncEnabled()
      ) {
        const { data, error } = await this.supabase.getClient().functions.invoke('google-auth', {
          body: { action: 'delete-event', calendarId: targetCalendarId, eventId: googleEventId },
        });

        if (error || !data?.success) {
          console.error('Delete google event error:', error || data);
          this.toastService.error(
            'Aviso',
            'Se eliminó la reserva local, pero podría haber un problema sincronizando con Google Calendar.',
          );
        }
      }

      this.toastService.success('Evento eliminado', 'El evento ha sido eliminado correctamente.');
      this.selectedEventDetails = null;

      // Remove from local calendar events optimistically
      this.calendarEvents.update((evts) => evts.filter((e) => e.id !== event.id));
    } catch (err: any) {
      this.toastService.error('Error', err.message || 'No se pudo eliminar el evento.');
    } finally {
      this.isDeletingEvent.set(false);
    }
  }

  onEventCreated(createdEvent?: any) {
    // Handle force reload signal from event-form debug button
    if ((createdEvent as any)?.__reloadClients) {
      this.isClientsLoaded = false;
      this.loadClientsBasic();
      return;
    }

    this.showEventModal = false;

    if (createdEvent) {
      // ... (keeping internal object creation logic) ...
      let evtStart: Date;
      let evtEnd: Date;
      let isAllDay = false;
      let title = '';
      let id = '';
      let description = '';
      let resourceId = undefined;
      let extendedProps: any = {};

      if (createdEvent.localBooking) {
        const lb = createdEvent.localBooking;
        evtStart = new Date(lb.start_time);
        evtEnd = new Date(lb.end_time);
        title = lb.customer_name || '(Nueva reserva)';
        id = lb.id;
        description = lb.notes || '';
        resourceId = lb.resource_id;
        // Populate extendedProps for local bookings so edit modal can read them
        extendedProps = {
          serviceId: lb.service_id,
          clientId: lb.client_id,
          professionalId: lb.professional_id,
          resourceId: lb.resource_id,
          sessionType: lb.session_type || 'presencial',
          localBookingId: lb.id,
          isLocal: true,
          paymentStatus: lb.payment_status,
          professionalName: lb.professional?.display_name || lb.professional_name,
          resourceName: lb.resource?.name || lb.resource_name,
          customerName: lb.customer_name,
        };
      } else if (createdEvent.start) {
        const e = createdEvent;
        isAllDay = !!e.start?.date;
        if (isAllDay) {
          const [sY, sM, sD] = e.start.date.split('-').map(Number);
          evtStart = new Date(sY, sM - 1, sD);
          const [eY, eM, eD] = e.end.date.split('-').map(Number);
          evtEnd = new Date(eY, eM - 1, eD);
        } else {
          evtStart = new Date(e.start.dateTime);
          evtEnd = new Date(e.end.dateTime);
        }
        title = e.summary || '(Sin título)';
        id = e.id;
        description = e.description || '';
        resourceId = e.extendedProperties?.shared?.resourceId;
        extendedProps = e.extendedProperties?.shared || {};
      } else {
        return; // unrecognized format, skip optimistic update
      }

      let serviceColor = '#6366f1';

      if (createdEvent.localBooking?.service_id) {
        const svc = this.bookableServices().find(
          (s) => s.id === createdEvent.localBooking.service_id,
        );
        if (svc?.booking_color) serviceColor = svc.booking_color;
      } else if (extendedProps.serviceId) {
        const svc = this.bookableServices().find((s) => s.id === extendedProps.serviceId);
        if (svc?.booking_color) serviceColor = svc.booking_color;
      }

      const newEvt = {
        id: id,
        title: title,
        start: evtStart,
        end: evtEnd,
        allDay: isAllDay,
        description: description,
        color: serviceColor,
        type: 'appointment',
        resourceId: resourceId,
        extendedProps: {
          shared: {
            ...extendedProps,
            professionalName:
              createdEvent.localBooking?.professional?.display_name ||
              extendedProps.professionalName,
            resourceName: createdEvent.localBooking?.resource?.name || extendedProps.resourceName,
          },
        },
      };

      this.calendarEvents.update((evts) => [...evts, newEvt]);
    }

    // Reload events silently via Realtime or manual fetch
    const range = this.loadedRange();
    if (range) {
      const profId = this.currentProfessionalId() ?? this._resolvedProfessionalId;
      this.loadCalendarEvents(range.start, range.end, true, profId);
    }
  }

  async onEventChange(event: any) {
    // 1. Validation
    if (!(event.start instanceof Date) || isNaN(event.start.getTime())) {
      console.error('❌ Invalid event start date:', event.start);
      return; // Do not update
    }
    if (!(event.end instanceof Date) || isNaN(event.end.getTime())) {
      console.error('❌ Invalid event end date:', event.end);
      return; // Do not update
    }

    // 2. Keep reference to old event for rollback
    const currentEvts = this.calendarEvents();
    const oldEvent = currentEvts.find((e) => e.id === event.id);
    if (!oldEvent) return;

    // 3. Optimistic Update
    this.calendarEvents.update((evts) => evts.map((e) => (e.id === event.id ? { ...event } : e)));

    // 4. Resolve the Google Calendar event ID. `event.id` in FullCalendar is
    //    the LOCAL booking UUID; Google needs the googleEventId (set on first
    //    sync, stored in extendedProps.shared.googleEventId or as a top-level
    //    field on the event object). Without this fix Google returns 404 and
    //    no notification is sent to attendees.
    const googleEventId: string | null =
      event.googleEventId ||
      oldEvent.googleEventId ||
      event.extendedProps?.shared?.googleEventId ||
      null;

    // 5. Settings gate: if the company has disabled Google Calendar sync for
    //    booking changes, skip the network call entirely. Saves API quota and
    //    prevents Google from auto-sending attendee notification emails.
    if (!this.googleCalendarSyncEnabled()) {
      return;
    }

    const client = this.supabase.getClient();
    const integration = this.googleIntegration();

    if (!integration?.metadata?.calendar_id_appointments) {
      // No calendar config — rollback
      this.calendarEvents.update((evts) => evts.map((e) => (e.id === event.id ? oldEvent : e)));
      return;
    }

    // 6. Standalone Google events (no local booking) have no googleEventId on
    //    the local event object — fall back to event.id which IS the Google
    //    event id for those.
    const eventIdForGoogle = googleEventId || event.id;

    try {
      // Map to Google Event format. The backend `google-auth update-event`
      // action requires `event.id` inside the body (line 493 of
      // google-auth/index.ts). Google itself uses the path param and ignores
      // the body's id, but the backend validates its presence first.
      const googleEvent: any = {
        id: eventIdForGoogle,
        summary: event.title,
        description: event.description,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
        attendees: event.attendees, // Include attendees to ensure they persist and trigger notifications
        // location: event.location // if we had it
      };

      const response = await client.functions.invoke('google-auth', {
        body: {
          action: 'update-event',
          calendarId: integration.metadata.calendar_id_appointments,
          event: googleEvent,
        },
      });

      if (response.error) {
        console.error('Error updating event in Google Calendar:', response.error);
        this.calendarEvents.update((evts) => evts.map((e) => (e.id === event.id ? oldEvent : e)));
        throw response.error;
      }
    } catch (error) {
      console.error('Error in onEventChange:', error);
      this.calendarEvents.update((evts) => evts.map((e) => (e.id === event.id ? oldEvent : e)));
    }
  }

  // Track loaded range to prevent unnecessary re-fetches

  onViewChange(view: any) {
    // Skip if a load is already in progress (prevents duplicate on initial mount)
    if (this.isLoadingCalendar()) return;

    // Check if the new view date is within our loaded range with some buffer
    const profId = this.currentProfessionalId() ?? this._resolvedProfessionalId;
    if (!this.loadedRange()) {
      const start = this.addMonths(view.date, -1);
      const end = this.addMonths(view.date, 2);
      this.loadCalendarEvents(start, end, false, profId);
      return;
    }

    // We want to ensure we have at least 1 month buffer around the view date
    const bufferStart = this.addMonths(view.date, -1);
    const bufferEnd = this.addMonths(view.date, 1);

    // If view is outside loaded range, fetch new range
    const range = this.loadedRange();
    if (range && (bufferStart < range.start || bufferEnd > range.end)) {
      // Expand range significantly to minimize future fetches
      const newStart = this.addMonths(view.date, -2);
      const newEnd = this.addMonths(view.date, 3);
      this.loadCalendarEvents(newStart, newEnd, false, profId);
    }
  }

  // Helper to add months safely
  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  async loadCalendarEvents(start: Date, end: Date, silent = false, professionalId?: string) {
    // Set range early to prevent duplicate calls from onViewChange
    this.loadedRange.set({ start, end });
    try {
      if (!silent) this.isLoadingCalendar.set(true);

      const companyId = this.authService.currentCompanyId();
      if (!companyId) return;

      // FAIL-SAFE: Professional users MUST have a professionalId to see bookings.
      // Without it they would see ALL company bookings — a security breach.
      // NOTE: During initial load, isProfessionalsLoaded=false means the professionalId
      // is still being resolved — suppress warning in that transient state to avoid
      // spamming the console on every calendar view navigation.
      if (!professionalId && this.isProfessional() && this.isProfessionalsLoaded) {
        console.warn('🔒 [Security] Professional user without professionalId — returning empty results');
        this.calendarEvents.set([]);
        this.isCalendarLoaded = true;
        return;
      }

      // Phase 1: Fetch local bookings (fast — hits indexed DB)
      // Two parallel queries:
      //   - localBookings: filtered by the active professional (for calendar display)
      //   - allCompanyBookings: ALL bookings in the date range (for global resource
      //     availability checks in the event-form modal — resources are shared
      //     across professionals, so we must consider every booking that occupies
      //     a resource, not just the current professional's)
      const [filteredResult, allResult] = await Promise.all([
        this.bookingsService.getBookings({
          companyId,
          professionalId: professionalId || undefined,
          from: start.toISOString(),
          to: end.toISOString(),
          limit: 500,
        }),
        // For the GLOBAL resource-availability check we need to see bookings
        // from ALL professionals in the company (not just the active one).
        // Owners/admins can use the plain getBookings (RLS grants full access).
        // Professionals CANNOT — the 20260610000004 RLS rebuild isolates
        // them to their own bookings. So for professionals we use the
        // SECURITY DEFINER RPC get_resource_occupancy_for_company, which
        // returns ONLY minimal resource-occupancy metadata (no client info,
        // notes, totals) for resource-bearing bookings in the company.
        this.isProfessional()
          ? this.bookingsService
              .getResourceOccupancy(companyId, start.toISOString(), end.toISOString())
              // Normalize the minimal RPC result to the shape that
              // mapBookingToEvent expects (Booking-like) AND that the
              // event-form `freeResources` filter uses (extendedProps.shared.resourceId).
              .then((r) => ({
                data: (r.data || []).map((row) => ({
                  id: row.id,
                  professional_id: row.professional_id,
                  resource_id: row.resource_id,
                  start_time: row.start_time,
                  end_time: row.end_time,
                  status: row.status,
                  // Extended-shape fields consumed by freeResources filter:
                  extendedProps: { shared: { resourceId: row.resource_id } },
                  start: row.start_time,
                  end: row.end_time,
                })),
                error: r.error,
              }))
          : this.bookingsService.getBookings({
              companyId,
              from: start.toISOString(),
              to: end.toISOString(),
              limit: 500,
            }),
      ]);

      const { data: localBookings, error: localBookingsError } = filteredResult;
      const { data: allBookings, error: allBookingsError } = allResult;

      if (localBookingsError) {
        console.error('Error fetching bookings:', localBookingsError);
        if (!silent) {
          this.toastService.error('Error', 'No se pudieron cargar las reservas.');
        }
        return;
      }
      if (allBookingsError) {
        console.error('Error fetching all-company bookings:', allBookingsError);
        // Non-blocking — the modal will fall back to filtered events
      }

      const localEvents = (localBookings || []).map((b: any) => {
      const event = this.mapBookingToEvent(b);
      // Fire-and-forget: ensure Doctoralia bookings without client_id get linked/created
      this.ensureClientLinked(b);
      return event;
    });

      // Render local bookings immediately — don't wait for Google
      this.calendarEvents.set(localEvents);
      // All-company events (used for GLOBAL resource availability in the modal)
      this.allCompanyBookings.set(
        (allBookings || []).map((b: any) => this.mapBookingToEvent(b)),
      );
      this.isCalendarLoaded = true;

      // Phase 2: Merge Google Calendar events in background (non-blocking)
      this.mergeGoogleEvents(start, end, localEvents);
    } catch (err) {
      console.error('Failed to load calendar events', err);
      this.loadedRange.set(null);
    } finally {
      this.isLoadingCalendar.set(false);
    }
  }

  /**
   * Map a Booking row to a CalendarEvent object.
   *
   * We pass `start` and `end` as the RAW ISO string from PostgREST (e.g.
   * `2026-06-08T15:30:00.000Z` or `2026-06-08T17:30:00+02:00`) rather than
   * wrapping in `new Date()`. Reason: the calendar's slot position and label
   * read the wall-clock hour/minute from the literal "HH:mm" of this string,
   * so the event is anchored to the time the professional actually entered,
   * regardless of the browser's local TZ. If we wrapped here, the browser
   * would convert to its local TZ before the calendar read it, and any
   * mismatch between the browser TZ and the company's TZ (Europe/Madrid)
   * would push the event into a different slot — see the Monday 8 Jun 2026
   * bug for Sandra Turrens where the 17:30 booking rendered at 19:30.
   */
  /**
   * Convert a Postgres timestamptz (e.g. "2026-06-11 15:00:00+02") to a
   * strict ISO-8601 string ("2026-06-11T15:00:00+02"). The space-separated
   * form Postgres returns is NOT a valid ISO-8601 datetime — `new Date()`
   * parses it inconsistently across browsers (some treat it as local,
   * some as UTC, some as Invalid Date), which silently breaks every
   * `new Date(event.start).getTime()` comparison in the event-form
   * resource-availability filter.
   *
   * The "T" separator is the only form that every JS engine parses the
   * same way (always preserving the offset).
   */
  private toIsoDateTime(s: string | null | undefined): string {
    if (!s) return s as any;
    // Postgres returns "YYYY-MM-DD HH:MM:SS+TZ" or "YYYY-MM-DD HH:MM:SS".
    // Also handle values that already include a "T" (some RPCs do).
    return s.replace(' ', 'T');
  }

  private mapBookingToEvent(b: any) {
    return {
      id: b.id,
      title: b.customer_name + ' - ' + (b.service?.name || 'Servicio'),
      start: this.toIsoDateTime(b.start_time),
      end: this.toIsoDateTime(b.end_time),
      allDay: false,
      description: b.notes || '',
      location: b.meeting_link || null,
      color: b.status === 'cancelled' ? '#9ca3af' : (b.professional?.color || b.service?.booking_color || '#6366f1'),
      type: 'appointment',
      attendees: b.customer_email ? [{ email: b.customer_email }] : [],
      resourceId: b.resource_id,
      resourceName: b.resource?.name,
      professionalId: b.professional_id,
      isLocal: true,
      googleEventId: b.google_event_id,
      extendedProps: {
        shared: {
          isLocal: true,
          localBookingId: b.id,
          serviceId: b.service_id,
          clientId: b.client_id,
          professionalId: b.professional_id,
          resourceId: b.resource_id,
          paymentStatus: b.payment_status,
          totalPrice: b.total_price,
          currency: b.currency,
          clientName: b.customer_name,
          serviceName: b.service?.name,
          professionalName: b.professional?.display_name,
          resourceName: b.resource?.name,
          sessionType: b.session_type || 'presencial',
          source: b.source,
          dp_service_unmapped: b.dp_service_unmapped,
          status: b.status,
        },
      },
      origen: b.source || undefined,
    };
  }

  /**
   * Background process: if a booking has no client_id but has customer email,
   * search for an existing client (by email + name) or create one, then link it.
   * Runs fire-and-forget after calendar render — does not block the UI.
   */
  private async ensureClientLinked(b: any): Promise<void> {
    if (b.client_id) return; // Already linked
    // Only auto-link for Doctoralia bookings with email or phone
    if (b.source !== 'docplanner') return;
    if (!b.customer_email && !b.customer_phone) return;

    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    try {
      // Search existing client by email (primary) and phone (secondary)
      const client = await this.findClientByEmailOrPhone(
        companyId,
        b.customer_email,
        b.customer_phone,
      );

      if (client) {
        await this.linkClientToBooking(b.id, client.id);
      } else if (b.customer_email || b.customer_phone) {
        // Only create if we have email or phone (not just name)
        await this.createAndLinkClient(b, companyId);
      }
    } catch (err) {
      console.error('[ensureClientLinked] error:', err);
    }
  }

  private async findClientByEmailOrPhone(companyId: string, email: string, phone: string): Promise<any> {
    const supabase = this.supabase.getClient();

    // Try email match first (precise)
    if (email) {
      const { data } = await supabase
        .from('clients')
        .select('id, email, name, surname')
        .eq('company_id', companyId)
        .eq('email', email.toLowerCase().trim())
        .limit(1)
        .maybeSingle();

      if (data) return data;
    }

    // Try phone match (last 9 digits — Spanish phone normalization)
    if (phone) {
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneLast9 = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : null;
      if (phoneLast9) {
        const { data: phoneClients } = await supabase
          .from('clients')
          .select('id, email, name, surname, phone')
          .eq('company_id', companyId)
          .not('phone', 'is', null)
          .limit(500);
        if (phoneClients) {
          const match = phoneClients.find((c: any) => {
            const cDigits = (c.phone || '').replace(/\D/g, '');
            return cDigits.length >= 9 && cDigits.slice(-9) === phoneLast9;
          });
          if (match) return match;
        }
      }
    }

    return null;
  }

  private async createAndLinkClient(b: any, companyId: string): Promise<void> {
    // Parse name: try to split into first name + surname
    const fullName = (b.customer_name || '').trim();
    const parts = fullName.split(/\s+/);
    const name = parts[0] || fullName;
    const surname = parts.length > 1 ? parts.slice(1).join(' ') : '';

    const newClient = {
      company_id: companyId,
      name,
      surname,
      email: b.customer_email || '',
      phone: b.customer_phone || '',
      is_active: true,
    };

    try {
      const { data, error } = await this.supabase.getClient()
        .from('clients')
        .insert(newClient)
        .select('id')
        .single();

      if (error || !data?.id) {
        console.error('[createAndLinkClient] Failed to create client:', error?.message || 'No ID returned');
        return;
      }

      await this.linkClientToBooking(b.id, data.id);
    } catch (err) {
      // Catch unexpected errors (network, timeout, etc.) to prevent retry loops
      console.error('[createAndLinkClient] Unexpected error:', err);
    }
  }

  private async linkClientToBooking(bookingId: string, clientId: string): Promise<void> {
    try {
      await this.bookingsService.updateBooking(bookingId, { client_id: clientId });
      // Update the event in calendarEvents signal so the UI reflects the link immediately
      this.calendarEvents.update(evts =>
        evts.map(evt => {
          if (evt.extendedProps?.shared?.localBookingId === bookingId) {
            return {
              ...evt,
              extendedProps: {
                ...evt.extendedProps,
                shared: { ...evt.extendedProps.shared, clientId },
              },
            };
          }
          return evt;
        }),
      );
    } catch (err) {
      console.error('[linkClientToBooking] failed:', err);
    }
  }

  /** Fetch Google Calendar events and merge with existing local events (fire-and-forget) */
  private async mergeGoogleEvents(start: Date, end: Date, localEvents: any[]) {
    try {
      const client = this.supabase.getClient();
      const integration = await this.resolveGoogleIntegration(client);
      if (!integration?.metadata?.calendar_id_appointments) return;

      const calendarId = integration.metadata.calendar_id_appointments;
      const { data: eventsData, error } = await client.functions.invoke('google-auth', {
        body: {
          action: 'list-events',
          calendarId,
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
        },
      });

      if (error || !eventsData?.events) return;

      const googleEvents = eventsData.events.map((e: any) => {
        const isAllDay = !!e.start.date;
        let evtStart: Date;
        let evtEnd: Date;
        if (isAllDay) {
          const [sY, sM, sD] = e.start.date.split('-').map(Number);
          evtStart = new Date(sY, sM - 1, sD);
          const [eY, eM, eD] = e.end.date.split('-').map(Number);
          evtEnd = new Date(eY, eM - 1, eD);
        } else {
          evtStart = new Date(e.start.dateTime);
          evtEnd = new Date(e.end.dateTime);
        }
        const localId = e.extendedProperties?.shared?.localBookingId || null;
        return {
          id: e.id,
          title: e.summary || '(Sin título)',
          start: evtStart,
          end: evtEnd,
          allDay: isAllDay,
          description: e.description,
          location: e.location,
          color: e.colorId ? undefined : '#4285F4',
          type: 'appointment',
          attendees: e.attendees || [],
          resourceId: e.extendedProperties?.shared?.resourceId,
          isGoogle: true,
          isLocal: !!localId,
          localBookingId: localId,
          extendedProps: {
            shared: {
              ...(e.extendedProperties?.shared || {}),
              isLocal: !!localId,
              localBookingId: localId,
            },
          },
        };
      });

      // Merge: Google events linked to a local booking update start/end
      const googleByLocalId = new Map<string, any>();
      const standaloneGoogle: any[] = [];
      for (const ge of googleEvents) {
        if (ge.localBookingId) {
          googleByLocalId.set(ge.localBookingId, ge);
        } else {
          standaloneGoogle.push(ge);
        }
      }

      let merged = localEvents.map((evt: any) => {
        if (evt.isLocal && evt.id && googleByLocalId.has(evt.id)) {
          const matchingGe = googleByLocalId.get(evt.id);
          return {
            ...evt,
            isSynced: true,
            googleEventId: matchingGe.id,
            start: matchingGe.start,
            end: matchingGe.end,
            color: evt.color, // preserve local professional/service color
            attendees: matchingGe.attendees.length > 0 ? matchingGe.attendees : evt.attendees,
          };
        }
        return evt;
      });

      merged = [...merged, ...standaloneGoogle];

      // Deduplicate by id AND by localBookingId. The previous implementation
      // only dedup'd by id, but a standalone Google event and a local event
      // can reference the SAME booking via different ids (google event id vs
      // local booking uuid). Without this second pass, Angular's @for track
      // expression ends up with two events at the same booking position,
      // causing NG0955 in the calendar view.
      const eventsMap = new Map<string, any>();
      for (const e of merged) {
        const localId = e.localBookingId || e.extendedProps?.shared?.localBookingId;
        // If a Google-only event references a local booking that's already
        // in the map, skip it — the local entry is the source of truth.
        if (localId && eventsMap.has(localId) && !eventsMap.get(localId).isGoogle) {
          continue;
        }
        // Otherwise dedupe by event id.
        if (!eventsMap.has(e.id)) {
          eventsMap.set(e.id, e);
        }
      }
      this.calendarEvents.set(Array.from(eventsMap.values()));
    } catch (err) {
      // Non-blocking — local events already visible
      console.warn('Google Calendar merge failed (non-blocking):', err);
    }
  }

  async loadBookableServices(retries = 2, professionalId?: string): Promise<void> {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    this.loading = true;
    this.error = null;

    try {
      // Resolve professionalId with fallback chain (same pattern as
      // loadCalendarEvents):
      //   1. Explicit param (preferred — caller passes already-resolved id)
      //   2. activeProfessionalId signal (set for owners in pro mode and
      //      auto-set for native professionals once linkedProfessionals loads)
      //   3. _resolvedProfessionalId cached from a previous booking-load flow
      //   4. Resolve from auth user → users table → professional by user_id
      //      (LAST RESORT for native professionals whose activeProfessionalId
      //      is empty because linkedProfessionals hadn't loaded yet at the
      //      moment activeProfessionalId was set, or because the auth effect
      //      didn't run after a page reload).
      // SECURITY: if the active role is 'professional' and we STILL don't have
      // a professionalId, return an empty list — never fall through to the
      // unfiltered query. Owners in owner mode (no active professional) keep
      // getting the full company list, which is what the professionals
      // management tab needs to assign services.
      let resolvedProfessionalId: string | null =
        professionalId
        ?? this.currentProfessionalId()
        ?? this._resolvedProfessionalId
        ?? null;

      // Last-resort fallback: query the professionals table for the auth user.
      // This MUST work even when `this.professionals()` hasn't been populated
      // yet, because that's the exact race we hit — the call to
      // loadBookableServices from ngOnInit runs BEFORE loadProfessionalsBasic
      // finishes. So we query the DB directly for the pro, not just match
      // against the in-memory list.
      //
      // IMPORTANT: do NOT filter by `is_active = true` here. The professional
      // record for the current auth user may legitimately be inactive (e.g.
      // the user was deactivated but is still logging in to finish their
      // shifts, or an admin disabled them and forgot they have a session).
      // Filtering them out would silently empty the entire modal with no
      // feedback. RLS will still hide the rows the user isn't entitled to
      // see, so this is safe to omit.
      if (!resolvedProfessionalId && this.isProfessional()) {
        try {
          const { data: authData } = await this.supabase.getClient().auth.getUser();
          const authUserId = authData?.user?.id;
          if (authUserId) {
            const { data: userData } = await this.supabase.getClient()
              .from('users').select('id').eq('auth_user_id', authUserId).maybeSingle();
            const publicUserId = userData?.id;
            if (publicUserId) {
              // Direct DB query — independent of whether this.professionals()
              // is populated yet. No is_active filter (see comment above).
              const { data: profData } = await this.supabase.getClient()
                .from('professionals')
                .select('id')
                .eq('user_id', publicUserId)
                .eq('company_id', companyId)
                .maybeSingle();
              if (profData?.id) {
                resolvedProfessionalId = profData.id;
                this.authService.activeProfessionalId.set(profData.id);
                this._resolvedProfessionalId = profData.id;
              } else {
                // Fallback: try the in-memory list (may be populated by now).
                const matchingProf = this.professionals().find(
                  (p: any) => p.user_id === publicUserId && p.company_id === companyId,
                );
                if (matchingProf) {
                  resolvedProfessionalId = matchingProf.id;
                  this.authService.activeProfessionalId.set(matchingProf.id);
                  this._resolvedProfessionalId = matchingProf.id;
                }
              }
            }
          }
        } catch (e) {
          console.warn('[loadBookableServices] last-resort professionalId resolution failed:', e);
        }
      }

      if (this.isProfessional() && !resolvedProfessionalId) {
        console.warn('🔒 [Security] Professional user without professionalId — returning empty services list');
        this.bookableServices.set([]);
        this.loading = false;
        return;
      }

      const services = await this.professionalsService.getBookableServices(resolvedProfessionalId);
      this.bookableServices.set(services.map((s) => ({
        id: s.id,
        name: s.name,
        duration_minutes: s.duration_minutes ?? 60,
      } as Service)));
    } catch (err: any) {
      // Retry on statement timeout (57014) — the DB may have been under load
      if (err?.code === '57014' && retries > 0) {
        console.warn(`Bookable services timeout, retrying (${retries} left)...`);
        await new Promise((r) => setTimeout(r, 1000));
        return this.loadBookableServices(retries - 1);
      }
      console.error('Error loading bookable services:', err);
      this.error = 'Error al cargar los servicios reservables';
    } finally {
      this.loading = false;
    }
  }

  async loadClients() {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) return;

    this.customersService.getCustomers({ limit: 500, sortBy: 'name', sortOrder: 'asc' }).subscribe({
      next: (data: any[]) => {
        const mapped = data.map((c: any) => ({
          ...c,
          displayName: `${c.name || ''} ${c.surname || ''} (${c.email})`.trim(),
        }));
        this.clients.set(mapped);
        this.isClientsLoaded = true;
      },
      error: (err: any) => console.error('Error loading clients:', err),
    });
  }

  formatDuration(minutes: number | undefined): string {
    if (!minutes) return '60 min';
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
    return `${minutes} min`;
  }

  async loadAvailableCalendars() {
    try {
      const client = this.supabase.getClient();
      const { data, error } = await client.functions.invoke('google-auth', {
        body: { action: 'list-calendars' },
      });
      if (error) {
        console.error('Error fetching google calendars (invoke error):', error);
        this.isCalendarsLoaded = true;
        return;
      }
      // google-auth returns errors as { error: "message" } in data with 200 status
      if (data?.error) {
        // Expected state when user hasn't connected Google — not an application error
        if (String(data.error).includes('No google_calendar integration found')) {
          console.warn('Google Calendar not connected — skipping calendar list');
          this.isCalendarsLoaded = true;
          return;
        }
        console.error('Error fetching google calendars (function error):', data.error);
        this.isCalendarsLoaded = true;
        return;
      }
      if (data && data.calendars) {
        this.availableCalendars.set(data.calendars);
      } else {
        console.warn('No calendars returned from google-auth. Response:', JSON.stringify(data));
      }
      this.isCalendarsLoaded = true;
    } catch (err) {
      console.error('Failed to fetch total available Google Calendars (exception):', err);
      this.isCalendarsLoaded = true;
    }
  }

  loadAvailableResources() {
    this.resourcesService.getResources().subscribe({
      next: (res) => {
        this.availableResources.set(res || []);
        this.isResourcesLoaded = true;
      },
      error: (err) => console.error('Error loading resources:', err),
    });
  }
  formatClientDisplayName(
    name: string | undefined,
    email: string | undefined,
    hasClientId: boolean,
  ): string {
    const emailUser = email ? email.split('@')[0] : '';

    if (!hasClientId) {
      // Invitation only: return email username or full email
      return emailUser || email || name || '';
    }

    if (!name) return emailUser || email || '';

    // Check if name is a default one (contains email or symbols like parentheses)
    // If it looks like "username (email@...)" we just want "username"
    if (name.includes('@') || name.includes('(')) {
      return emailUser || name.split(/\s+|\(/)[0] || name;
    }

    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;

    const firstName = parts[0];
    // Only treat as surnames if they look like real names (alphabetic)
    const surnames = parts.slice(1).filter((p) => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/.test(p));

    if (surnames.length === 0) return firstName;

    const initials = surnames.map((s) => s.charAt(0).toUpperCase() + '.').join('');

    return `${firstName} ${initials}`;
  }
}
