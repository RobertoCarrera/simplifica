import { Component, OnInit, inject, signal, OnDestroy, viewChild, computed } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';
import { ProfessionalsComponent } from './tabs/professionals/professionals.component';
import { ResourcesComponent } from './tabs/resources/resources.component';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseProfessionalsService, Professional } from '../../../services/supabase-professionals.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseResourcesService, Resource } from '../../../services/supabase-resources.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { SafeHtmlPipe } from '../../../core/pipes/safe-html.pipe';

import { EventFormComponent } from '../../../shared/components/event-form/event-form.component';
import { CalendarComponent } from '../../calendar/calendar.component';
@Component({
    selector: 'app-booking-settings',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, BookingAvailabilityComponent, ProfessionalsComponent, ResourcesComponent, SkeletonComponent, EventFormComponent, SafeHtmlPipe, CalendarComponent],
    templateUrl: './booking-settings.component.html',
    styleUrls: ['./booking-settings.component.scss']
})
export class BookingSettingsComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private queryParamsSub?: Subscription;
    private servicesService = inject(SupabaseServicesService);
    private authService = inject(AuthService);
    private supabase = inject(SimpleSupabaseService);
    private professionalsService = inject(SupabaseProfessionalsService);
    private resourcesService = inject(SupabaseResourcesService);
    private customersService = inject(SupabaseCustomersService);
    private settingsService = inject(SupabaseSettingsService);
    private toastService = inject(ToastService);
    private sidebarService = inject(SidebarStateService);

    activeTab: 'services' | 'professionals' | 'resources' | 'availability' | 'calendar' | 'general' = 'calendar';
    bookableServices: Service[] = [];
    professionals = signal<Professional[]>([]); // New signal
    clients = signal<any[]>([]); // Clients signal
    calendarEvents = signal<any[]>([]); // Signal for calendar events
    loading = true;
    saving = false;
    settingsMenuOpen = false;
    error: string | null = null;

    bookingSettings = {
        slot_interval: 15,
        min_advance_hours: 2
    };

    get bookingPortalUrl(): string {
        return this.getPublicBookingUrl();
    }

    isLoadingCalendar = signal(false);
    isCalendarLoaded = false;
    isProfessionalsLoaded = false;
    isClientsLoaded = false;
    isResourcesLoaded = false;
    isCalendarsLoaded = false;
    realtimeSubscription: any;

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
            ? (this.bookingConstraints().enabledViews_desktop || ['month', 'week', '3days', 'day', 'agenda'])
            : (this.bookingConstraints().enabledViews_mobile || ['week', '3days', 'day', 'agenda']);
    });

    // Computed: return bookingConstraints with enabledViews updated based on current mode
    bookingConstraintsForCalendar = computed(() => {
        const constraints = this.bookingConstraints();
        return {
            ...constraints,
            enabledViews: this.enabledViewsForMode()
        };
    });

    // Filter selection logic
    availableFilters = [
        { id: 'services', label: 'Por Servicio', icon: 'fa-concierge-bell' },
        { id: 'professionals', label: 'Por Profesional', icon: 'fa-user-tie' },
        { id: 'duration', label: 'Por Duración', icon: 'fa-clock' }
    ];

    isFilterEnabled(filterId: string): boolean {
        const settings = this.companySettings()?.settings || {};
        const enabled = settings.enabled_filters || ['services', 'professionals', 'duration'];
        return enabled.includes(filterId);
    }

    toggleFilter(filterId: string) {
        // We use the JSONB 'settings' column in companies instead of company_settings.enabled_filters
        // because the BFF reads from companies.settings for public performance.
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        let settings = this.companySettings()?.settings || {};
        let current = settings.enabled_filters || ['services', 'professionals', 'duration'];
        
        if (current.includes(filterId)) {
            if (current.length <= 1) {
                this.toastService.error('Configuración', 'Al menos un filtro debe estar activo');
                return;
            }
            current = current.filter((f: string) => f !== filterId);
        } else {
            current = [...current, filterId];
        }

        const newSettings = { ...settings, enabled_filters: current };
        
        this.savingSettings.set(true);
        this.supabase.getClient()
            .from('companies')
            .update({ settings: newSettings })
            .eq('id', companyId)
            .then(({ data, error }) => {
                if (error) {
                    console.error('Error updating company settings:', error);
                    this.toastService.error('Configuración', 'No se pudieron guardar los filtros');
                } else {
                    // Update local state
                    this.companySettings.update(prev => ({ ...prev, settings: newSettings }));
                }
                this.savingSettings.set(false);
            });
    }

    saveSettings() {
        this.saving = true;
        this.settingsService.upsertCompanySettings({
            default_calendar_view: this.bookingSettings.slot_interval.toString(), // or whichever field corresponds to slot_interval in your schema
            // ... map other fields
        } as any).subscribe({
            next: () => {
                this.toastService.success('Configuración', 'Ajustes guardados correctamente');
                this.saving = false;
            },
            error: (err: any) => {
                console.error('Error saving booking settings:', err);
                this.toastService.error('Configuración', 'No se pudieron guardar los ajustes');
                this.saving = false;
            }
        });
    }

    // Role detection
    userRole = this.authService.userRole;
    isClient = computed(() => this.userRole() === 'client');

    // Modal state
    showEventModal = false;
    eventToEdit: any | null = null;
    selectedDate: Date | null = null;
    selectedEventDetails: any | null = null;
    isDeletingEvent = signal(false);
    isUpdatingPayment = signal(false);
    calendarComponent = viewChild<any>('calendarComponent');
    private loadedRange: { start: Date; end: Date } | null = null;

    // Public URL logic
    getPublicBookingUrl(): string {
        const slug = this.companySettings()?.slug;
        if (!slug) return '';
        // In production this would be https://reservas.simplificacrm.es/slug
        // For now we show the official production one or a generic one
        return `https://reservas.simplificacrm.es/${slug}`;
    }

    copyToClipboard(text: string) {
        navigator.clipboard.writeText(text).then(() => {
            this.toastService.success('Copiado', 'Enlace copiado al portapapeles');
        });
    }

    // Cached public user ID to avoid repeated auth.getUser() + users lookup
    private cachedPublicUserId: string | null = null;

    async ngOnInit() {
        // Collapsar la sidebar temporalmente al entrar a Reservas para maximizar el espacio del calendario
        this.sidebarService.setCollapsed(true);

        // Load settings first so defaultView and constraints are ready
        // before the calendar tab starts fetching data
        await Promise.all([
            this.loadBookableServices(),
            this.loadCompanySettings(),
            this.loadAvailabilityConstraints()
        ]);

        // Now subscribe to query params and trigger tab loading
        // (settings are already loaded, so the calendar tab won't race)
        this.queryParamsSub = this.route.queryParams.subscribe(params => {
            const allowedTabs = this.isClient() ? ['services', 'professionals'] : ['services', 'professionals', 'resources', 'availability', 'calendar', 'general'];
            if (params['tab'] && allowedTabs.includes(params['tab'])) {
                this.activeTab = params['tab'] as any;
            } else if (this.isClient() && !['services', 'professionals'].includes(this.activeTab)) {
                this.activeTab = 'services';
            }
            this.handleTabChange(this.activeTab);
        });

        this.setupRealtime();
    }

    ngOnDestroy() {
        this.queryParamsSub?.unsubscribe();
        if (this.realtimeSubscription) {
            this.supabase.getClient().removeChannel(this.realtimeSubscription);
        }
    }

    switchTab(tab: 'services' | 'professionals' | 'resources' | 'availability' | 'calendar' | 'general') {
        this.activeTab = tab;
        this.handleTabChange(tab);
    }

    private async handleTabChange(tab: string) {
        if (tab === 'calendar' && !this.isCalendarLoaded) {
            const start = this.addMonths(new Date(), -1);
            const end = this.addMonths(new Date(), 2);

            // Phase 1: calendar events + lightweight professionals (needed to render)
            await Promise.all([
                this.loadCalendarEvents(start, end),
                this.loadProfessionalsBasic()
            ]);

            // Phase 2: secondary data for modals (deferred, won't block render)
            this.loadClientsBasic();
            this.loadAvailableResources();
            this.loadAvailableCalendars();
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
        }
    }

    setupRealtime() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        this.realtimeSubscription = this.supabase.getClient()
            .channel('company-bookings-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'bookings', filter: `company_id=eq.${companyId}` },
                () => {
                    // Refresh current loaded range silently
                    if (this.loadedRange) {
                        this.loadCalendarEvents(this.loadedRange.start, this.loadedRange.end, true);
                    }
                }
            )
            .subscribe();
    }

    async loadCompanySettings() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        // Run both queries in parallel to avoid sequential waterfall
        const [companyResult, settings] = await Promise.all([
            this.supabase.getClient()
                .from('companies')
                .select('id, name, slug, logo_url, settings')
                .eq('id', companyId)
                .single(),
            new Promise<any>(resolve => {
                this.settingsService.getCompanySettings().subscribe({
                    next: s => resolve(s),
                    error: () => resolve(null)
                });
            })
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
            settings: company.settings
        });

        // Determine which default view to use based on device
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const desktopView = settings?.default_calendar_view;
        const mobileView = settings?.default_calendar_view_mobile;
        const view = isMobile ? (mobileView || 'week') : (desktopView || 'month');

        // Restore persisted enabled views from companies.settings JSONB
        const savedDesktopViews = company.settings?.enabledViews_desktop;
        const savedMobileViews = company.settings?.enabledViews_mobile;

        this.bookingConstraints.update(prev => ({
            ...prev,
            defaultView: view || prev.defaultView,
            ...(savedDesktopViews ? { enabledViews_desktop: savedDesktopViews } : {}),
            ...(savedMobileViews ? { enabledViews_mobile: savedMobileViews } : {})
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
                    const view = isMobile ? (mobileView || 'week') : (desktopView || 'month');

                    if (view) {
                        this.bookingConstraints.update(prev => ({
                            ...prev,
                            defaultView: view
                        }));
                    }
                }
            },
            error: (err) => {
                console.error('Error updating settings', err);
                this.savingSettings.set(false);
            }
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
        minHour: 0,
        maxHour: 24,
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        schedules: [],
        enabledViews: ['month', 'week', '3days', 'day', 'agenda'],
        enabledViews_desktop: ['month', 'week', '3days', 'day', 'agenda'],
        enabledViews_mobile: ['week', '3days', 'day', 'agenda']
    });

    private bookingsService = inject(SupabaseBookingsService);

    /** Resolve and cache the public user ID (avoids repeated auth.getUser + users lookup) */
    private async resolvePublicUserId(): Promise<string | null> {
        if (this.cachedPublicUserId) return this.cachedPublicUserId;

        const client = this.supabase.getClient();
        const { data: { user } } = await client.auth.getUser();
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
        const publicUserId = await this.resolvePublicUserId();
        if (!publicUserId) return;

        this.bookingsService.getAvailabilitySchedules(publicUserId).subscribe({
            next: (schedules: any[]) => {
                if (schedules.length === 0) return; // Keep defaults

                // Find active days
                const workingDays = [...new Set(schedules.map((s: any) => Number(s.day_of_week)))];

                // Find global min/max hours
                // Format is "HH:MM:SS"
                let minH = 24;
                let maxH = 0;

                schedules.forEach((s: any) => {
                    const startH = parseInt(s.start_time.split(':')[0], 10);
                    // For end time, if it's 17:00, we want to show until 17:00 block? 
                    // Usually end_time 17:00 means the slot 16:00-17:00 is the last one?
                    // Or if it visualizes "up to".
                    // Let's parse end hours.
                    let endH = parseInt(s.end_time.split(':')[0], 10);
                    const endM = parseInt(s.end_time.split(':')[1], 10);

                    if (endM > 0) endH++; // If 17:30, we need to show hour 17 (and maybe 18 depending on logic)
                    // Actually, if I show hour 17, it renders 17:00 - 18:00.
                    // If schedule ends at 17:00, the last block is 16:00-17:00.
                    // So we probably want maxH to be the `ceil` hour.

                    if (startH < minH) minH = startH;
                    if (endH > maxH) maxH = endH;
                });

                // Add some buffer? or strict?
                // User said "hours ... must be reduced to the schedule".
                // So strict.

                this.bookingConstraints.update(prev => ({
                    ...prev,
                    minHour: minH,
                    maxHour: maxH,
                    workingDays: workingDays,

                    schedules: schedules.map((s: any) => ({
                        ...s,
                        day_of_week: Number(s.day_of_week)
                    }))
                }));

                // Constraints loaded from availability schedules
            },
            error: (err: any) => console.error('Error loading constraints', err)
        });
    }



    loadProfessionals() {
        this.professionalsService.getProfessionals().subscribe({
            next: (data: Professional[]) => {
                this.professionals.set(data);
                this.isProfessionalsLoaded = true;
            },
            error: (err: any) => console.error('Error loading professionals', err)
        });
    }

    /** Lightweight professionals load for calendar rendering (no nested JOINs) */
    loadProfessionalsBasic() {
        return new Promise<void>((resolve) => {
            this.professionalsService.getProfessionalsBasic().subscribe({
                next: (data: any[]) => {
                    this.professionals.set(data as Professional[]);
                    this.isProfessionalsLoaded = true;
                    resolve();
                },
                error: (err: any) => { console.error('Error loading professionals', err); resolve(); }
            });
        });
    }

    /** Lightweight clients load for calendar dropdowns (no JOINs) */
    loadClientsBasic() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        this.customersService.getClientsBasic(companyId).subscribe({
            next: (data: any[]) => {
                const mapped = data.map((c: any) => ({
                    ...c,
                    displayName: `${c.name || ''} ${c.surname || ''} (${c.email || ''})`.trim()
                }));
                this.clients.set(mapped);
                this.isClientsLoaded = true;
            },
            error: (err: any) => console.error('Error loading clients:', err)
        });
    }

    createEvent(date?: Date, preselectedService?: Service, preselectedProfessional?: Professional) {
        this.selectedDate = date || new Date();
        this.eventToEdit = null;
        
        if (preselectedService || preselectedProfessional) {
            this.eventToEdit = {
                service: preselectedService,
                professional: preselectedProfessional
            };
        }
        
        this.showEventModal = true;
    }

    toggleCalendarView(view: string) {
        const mode = this.viewSettingsMode();
        const companyId = this.authService.currentCompanyId();

        this.bookingConstraints.update(prev => {
            const current = mode === 'desktop'
                ? (prev.enabledViews_desktop || ['month', 'week', '3days', 'day', 'agenda'])
                : (prev.enabledViews_mobile || ['week', '3days', 'day', 'agenda']);

            let next: string[];
            if (current.includes(view)) {
                if (current.length <= 1) return prev;
                next = current.filter(v => v !== view);
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
                this.supabase.getClient()
                    .from('companies')
                    .update({ settings: newSettings })
                    .eq('id', companyId)
                    .then(({ error }) => {
                        if (error) {
                            console.error('Error saving calendar views:', error);
                            this.toastService.error('Configuración', 'No se pudieron guardar las vistas');
                        } else {
                            this.companySettings.update(prev => ({ ...prev, settings: newSettings }));
                        }
                    });
            }

            return update;
        });
    }

    closeModal() {
        this.showEventModal = false;
        this.selectedDate = null;
        this.eventToEdit = null;
    }

    onEventClick(eventClick: any) {
        this.selectedEventDetails = eventClick.event;
    }

    closeEventDetails() {
        this.selectedEventDetails = null;
    }

    onEditEvent() {
        this.eventToEdit = this.selectedEventDetails;
        this.selectedEventDetails = null;
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
            this.toastService.success('Pago Actualizado', `La reserva se ha marcado como ${status === 'paid' ? 'pagada' : 'pendiente'}.`);
            
            // Update local state in selectedEventDetails if it's the same event
            if (this.selectedEventDetails?.id === event.id) {
                this.selectedEventDetails = { 
                    ...this.selectedEventDetails,
                    extendedProps: {
                        ...this.selectedEventDetails.extendedProps,
                        shared: {
                            ...this.selectedEventDetails.extendedProps.shared,
                            paymentStatus: status
                        }
                    }
                };
            }
            
            // Reload calendar silently (Realtime will handle it, but for safety...)
            if (this.loadedRange) {
                await this.loadCalendarEvents(this.loadedRange.start, this.loadedRange.end, true);
            }
        } catch (error: any) {
            console.error('Error updating payment status:', error);
            this.toastService.error('Error', 'No se pudo actualizar el estado de pago.');
        } finally {
            this.isUpdatingPayment.set(false);
        }
    }

    async deleteEvent(event: any) {
        if (!confirm('¿Estás seguro de que deseas eliminar este evento?')) return;
        
        this.isDeletingEvent.set(true);
        try {
            const calendarId = this.googleIntegration()?.metadata?.calendar_id_appointments;
            // Target the calendar ID used for this event, fallback to integration default
            const targetCalendarId = event.extendedProps?.shared?.professionalCalendarId || calendarId;

            // 1. Delete Local Booking if exists
            const localBookingId = event.localBookingId || (event.isLocal ? event.id : null);
            if (localBookingId) {
                await this.bookingsService.deleteBooking(localBookingId);
                // Local booking deleted
            }

            // 2. Delete Google Event if exists
            const googleEventId = event.googleEventId || (event.isGoogle ? event.id : null);
            if (googleEventId && targetCalendarId) {
                const { data, error } = await this.supabase.getClient().functions.invoke('google-auth', {
                    body: { action: 'delete-event', calendarId: targetCalendarId, eventId: googleEventId }
                });

                if (error || !data?.success) {
                    console.error('Delete google event error:', error || data);
                    this.toastService.error('Aviso', 'Se eliminó la reserva local, pero podría haber un problema sincronizando con Google Calendar.');
                }
            }

            this.toastService.success('Evento eliminado', 'El evento ha sido eliminado correctamente.');
            this.selectedEventDetails = null;
            
            // Remove from local calendar events optimistically
            this.calendarEvents.update(evts => evts.filter(e => e.id !== event.id));

        } catch (err: any) {
            this.toastService.error('Error', err.message || 'No se pudo eliminar el evento.');
        } finally {
            this.isDeletingEvent.set(false);
        }
    }

    onEventCreated(createdEvent?: any) {
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
                const svc = this.bookableServices.find(s => s.id === createdEvent.localBooking.service_id);
                if (svc?.booking_color) serviceColor = svc.booking_color;
            } else if (extendedProps.serviceId) {
                const svc = this.bookableServices.find(s => s.id === extendedProps.serviceId);
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
                        professionalName: createdEvent.localBooking?.professional?.display_name || extendedProps.professionalName,
                        resourceName: createdEvent.localBooking?.resource?.name || extendedProps.resourceName
                    }
                }
            };

            this.calendarEvents.update(evts => [...evts, newEvt]);
        }

        // Reload events silently via Realtime or manual fetch
        if (this.loadedRange) {
            this.loadCalendarEvents(this.loadedRange.start, this.loadedRange.end, true);
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
        const oldEvent = currentEvts.find(e => e.id === event.id);
        if (!oldEvent) return;

        // 3. Optimistic Update
        this.calendarEvents.update(evts => evts.map(e => e.id === event.id ? { ...event } : e));

        const client = this.supabase.getClient();
        const integration = this.googleIntegration();

        if (!integration?.metadata?.calendar_id_appointments) {
            // No calendar config — rollback
            this.calendarEvents.update(evts => evts.map(e => e.id === event.id ? oldEvent : e));
            return;
        }

        try {
            // Map to Google Event format
            const googleEvent: any = {
                id: event.id,
                summary: event.title,
                description: event.description,
                start: { dateTime: event.start.toISOString() },
                end: { dateTime: event.end.toISOString() },
                attendees: event.attendees // Include attendees to ensure they persist and maybe trigger notifications
                // location: event.location // if we had it
            };

            const response = await client.functions.invoke('google-auth', {
                body: {
                    action: 'update-event',
                    calendarId: integration.metadata.calendar_id_appointments,
                    event: googleEvent
                }
            });

            if (response.error) {
                console.error('Error updating event in Google Calendar:', response.error);
                this.calendarEvents.update(evts => evts.map(e => e.id === event.id ? oldEvent : e));
                throw response.error;
            }

        } catch (error) {
            console.error('Error in onEventChange:', error);
            this.calendarEvents.update(evts => evts.map(e => e.id === event.id ? oldEvent : e));
        }
    }

    // Track loaded range to prevent unnecessary re-fetches

    onViewChange(view: any) {
        // Skip if a load is already in progress (prevents duplicate on initial mount)
        if (this.isLoadingCalendar()) return;

        // Check if the new view date is within our loaded range with some buffer
        if (!this.loadedRange) {
            const start = this.addMonths(view.date, -1);
            const end = this.addMonths(view.date, 2);
            this.loadCalendarEvents(start, end);
            return;
        }

        // We want to ensure we have at least 1 month buffer around the view date
        const bufferStart = this.addMonths(view.date, -1);
        const bufferEnd = this.addMonths(view.date, 1);

        // If view is outside loaded range, fetch new range
        if (bufferStart < this.loadedRange.start || bufferEnd > this.loadedRange.end) {
            // Expand range significantly to minimize future fetches
            const newStart = this.addMonths(view.date, -2);
            const newEnd = this.addMonths(view.date, 3);
            this.loadCalendarEvents(newStart, newEnd);
        }
    }

    // Helper to add months safely
    private addMonths(date: Date, months: number): Date {
        const d = new Date(date);
        d.setMonth(d.getMonth() + months);
        return d;
    }

    async loadCalendarEvents(start: Date, end: Date, silent = false) {
        // Set range early to prevent duplicate calls from onViewChange
        this.loadedRange = { start, end };
        try {
            if (!silent) this.isLoadingCalendar.set(true);

            const companyId = this.authService.currentCompanyId();
            if (!companyId) return;

            const client = this.supabase.getClient();

            // Fetch local bookings AND resolve Google integration in parallel
            // Bookings query retries once on timeout (57014) to handle transient Supabase load
            const fetchBookingsWithRetry = async () => {
                const params = {
                    companyId,
                    from: start.toISOString(),
                    to: end.toISOString(),
                    limit: 500
                };
                const result = await this.bookingsService.getBookings(params);
                if (result.error) {
                    // Retry once on any error (500, timeout 57014, etc.)
                    console.warn('⚠️ Bookings query failed, retrying...', result.error.code || result.error.message);
                    await new Promise(r => setTimeout(r, 1000));
                    return this.bookingsService.getBookings(params);
                }
                return result;
            };

            const [bookingsResult, integration] = await Promise.all([
                fetchBookingsWithRetry(),
                this.resolveGoogleIntegration(client)
            ]);

            const { data: localBookings, error: localBookingsError } = bookingsResult;

            if (localBookingsError) {
                console.error('Error fetching local bookings:', localBookingsError);
            }

            let allEvents: any[] = [];

            if (localBookings) {
                allEvents = localBookings.map((b: any) => ({
                    id: b.id,
                    title: b.customer_name + ' - ' + (b.service?.name || 'Servicio'),
                    start: new Date(b.start_time),
                    end: new Date(b.end_time),
                    allDay: false,
                    description: b.notes || '',
                    location: b.meeting_link || null,
                    color: b.status === 'cancelled'
                        ? '#9ca3af'
                        : (b.service?.booking_color || '#6366f1'),
                    type: 'appointment',
                    attendees: b.customer_email ? [{ email: b.customer_email }] : [],
                    resourceId: b.resource_id,
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
                            resourceName: b.resource?.name
                        }
                    }
                }));
            }

            if (integration?.metadata?.calendar_id_appointments) {
                const calendarId = integration.metadata.calendar_id_appointments;

                const { data: eventsData, error } = await client.functions.invoke('google-auth', {
                    body: {
                        action: 'list-events',
                        calendarId: calendarId,
                        timeMin: start.toISOString(),
                        timeMax: end.toISOString()
                    }
                });

                if (error) {
                    console.error('Error fetching google events:', error);
                } else if (eventsData?.events) {
                    const newGoogleEvents = eventsData.events.map((e: any) => {
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
                                    localBookingId: localId
                                }
                            }
                        };
                    });

                    // Merge strategy
                    const googleEventsByLocalId = new Map();
                    for (const ge of newGoogleEvents) {
                        if (ge.localBookingId) {
                            googleEventsByLocalId.set(ge.localBookingId, ge);
                        } else {
                            allEvents.push(ge);
                        }
                    }

                    allEvents = allEvents.map((evt: any) => {
                        if (evt.isLocal && evt.id && googleEventsByLocalId.has(evt.id)) {
                            // Link exists. Update the local event with some Google fields or replace it?
                            // Keep local, but mark as synced. We use local ID as the primary reference.
                            const matchingGe = googleEventsByLocalId.get(evt.id);
                            return {
                                ...evt,
                                isSynced: true,
                                googleEventId: matchingGe.id, // Ensure we track the google id
                                start: matchingGe.start,
                                end: matchingGe.end, // Use Google's time if it was moved in GC
                                attendees: matchingGe.attendees.length > 0 ? matchingGe.attendees : evt.attendees
                            };
                        }
                        return evt;
                    });
                }
            }

            const currentEventsMap = new Map();
            allEvents.forEach((e: any) => currentEventsMap.set(e.id, e));
            this.calendarEvents.set(Array.from(currentEventsMap.values()));

            this.loadedRange = { start, end };
            this.isCalendarLoaded = true;
            // Events loaded and merged

        } catch (err) {
            console.error('Failed to load calendar events', err);
            this.loadedRange = null;
        } finally {
            this.isLoadingCalendar.set(false);
        }
    }

    async loadBookableServices() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        this.loading = true;
        this.error = null;

        try {
            const allServices = await this.servicesService.getServices(companyId);
            this.bookableServices = allServices.filter(s => s.is_bookable === true);
        } catch (err: any) {
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
                    displayName: `${c.name || ''} ${c.surname || ''} (${c.email})`.trim()
                }));
                this.clients.set(mapped);
                this.isClientsLoaded = true;
            },
            error: (err: any) => console.error('Error loading clients:', err)
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
                body: { action: 'list-calendars' }
            });
            if (error) {
                console.error('Error fetching google calendars:', error);
                this.isCalendarsLoaded = true; // Mark as loaded even if error to prevent retries
                return;
            }
            if (data && data.calendars) {
                this.availableCalendars.set(data.calendars);
            }
            this.isCalendarsLoaded = true;
        } catch (err) {
            console.error('Failed to fetch total available Google Calendars', err);
            this.isCalendarsLoaded = true;
        }
    }

    loadAvailableResources() {
        this.resourcesService.getResources().subscribe({
            next: (res) => {
                this.availableResources.set(res || []);
                this.isResourcesLoaded = true;
            },
            error: (err) => console.error('Error loading resources:', err)
        });
    }
    formatClientDisplayName(name: string | undefined, email: string | undefined, hasClientId: boolean): string {
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
        const surnames = parts.slice(1).filter(p => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/.test(p));
        
        if (surnames.length === 0) return firstName;

        const initials = surnames
            .map(s => s.charAt(0).toUpperCase() + '.')
            .join('');
        
        return `${firstName} ${initials}`;
    }
}
