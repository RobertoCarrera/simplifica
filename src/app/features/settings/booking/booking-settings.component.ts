import { Component, OnInit, inject, signal, OnDestroy, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
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


import { CalendarComponent } from '../../calendar/calendar.component';
import { EventFormComponent } from './event-form/event-form.component';
@Component({
    selector: 'app-booking-settings',
    standalone: true,
    imports: [CommonModule, RouterModule, BookingAvailabilityComponent, ProfessionalsComponent, ResourcesComponent, SkeletonComponent, CalendarComponent, EventFormComponent],
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

    activeTab: 'services' | 'professionals' | 'resources' | 'availability' | 'calendar' | 'general' = 'services';
    bookableServices: Service[] = [];
    professionals = signal<Professional[]>([]); // New signal
    clients = signal<any[]>([]); // Clients signal
    calendarEvents: any[] = []; // Typed as any[] initially, will map to CalendarEvent
    loading = true;
    error: string | null = null;

    // Add missing signal
    googleIntegration = signal<any>(null);
    availableCalendars = signal<any[]>([]); // New signal for calendars
    availableResources = signal<Resource[]>([]); // New signal for resources
    companySettings = signal<any>(null);
    savingSettings = signal(false);

    // Modal state
    showEventModal = false;
    eventToEdit: any | null = null;
    selectedDate: Date | null = null;
    selectedEventDetails: any | null = null;
    isDeletingEvent = signal(false);
    isUpdatingPayment = signal(false);
    calendarComponent = viewChild<CalendarComponent>('calendarComponent');
    private loadedRange: { start: Date; end: Date } | null = null;

    async ngOnInit() {
        this.queryParamsSub = this.route.queryParams.subscribe(params => {
            if (params['tab'] && ['services', 'professionals', 'resources', 'availability', 'calendar'].includes(params['tab'])) {
                this.activeTab = params['tab'];
            }
        });

        await this.loadBookableServices();
        // Initial load: current month +/- 1 month
        const start = this.addMonths(new Date(), -1);
        const end = this.addMonths(new Date(), 2);
        this.loadCalendarEvents(start, end);
        this.loadProfessionals();
        this.loadAvailabilityConstraints();
        this.loadClients();
        this.loadAvailableCalendars();
        this.loadAvailableResources();
        this.loadCompanySettings();
    }

    ngOnDestroy() {
        this.queryParamsSub?.unsubscribe();
    }

    loadCompanySettings() {
        this.settingsService.getCompanySettings().subscribe({
            next: (settings) => this.companySettings.set(settings),
            error: (err) => console.error('Error loading company settings', err)
        });
    }

    updateGeneralSettings(key: string, value: any) {
        this.savingSettings.set(true);
        this.settingsService.upsertCompanySettings({ [key]: value } as any).subscribe({
            next: (settings) => {
                this.companySettings.set(settings);
                this.savingSettings.set(false);
            },
            error: (err) => {
                console.error('Error updating settings', err);
                this.savingSettings.set(false);
            }
        });
    }

    // ... helper methods ...

    // ... helper methods ...

    // Availability Constraints
    bookingConstraints = signal<{
        minHour: number;
        maxHour: number;
        workingDays: number[];
        schedules?: any[];
    }>({
        minHour: 0,
        maxHour: 24,
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        schedules: []
    });

    private bookingsService = inject(SupabaseBookingsService);

    async loadAvailabilityConstraints() {
        const client = this.supabase.getClient();
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        // We need the public user id again - technically we could cache this public user ID
        // But for cleaner flow, let's just reuse the service if available or fetch again.
        // Actually, we can use the bookingsService directly which requires 'userId' (public UUID).
        // Let's get the public ID first clearly.

        const { data: publicUser } = await client
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (!publicUser) return;

        this.bookingsService.getAvailabilitySchedules(publicUser.id).subscribe({
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

                this.bookingConstraints.set({
                    minHour: minH,
                    maxHour: maxH,
                    workingDays: workingDays,

                    schedules: schedules.map((s: any) => ({
                        ...s,
                        day_of_week: Number(s.day_of_week)
                    }))
                });

                console.log('🔒 Availability Constraints:', this.bookingConstraints());
            },
            error: (err: any) => console.error('Error loading constraints', err)
        });
    }



    loadProfessionals() {
        this.professionalsService.getProfessionals().subscribe({
            next: (data: Professional[]) => this.professionals.set(data),
            error: (err: any) => console.error('Error loading professionals', err)
        });
    }

    createEvent(date?: Date) {
        this.selectedDate = date || new Date();
        this.showEventModal = true;
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
            
            // Reload calendar
            if (this.loadedRange) {
                await this.loadCalendarEvents(this.loadedRange.start, this.loadedRange.end);
            } else {
                // Fallback to current month if no range is loaded
                const start = this.addMonths(new Date(), -1);
                const end = this.addMonths(new Date(), 2);
                await this.loadCalendarEvents(start, end);
            }
        } catch (error: any) {
            console.error('Error updating payment status:', error);
            this.toastService.error('Error', 'No se pudo actualizar el estado de pago: ' + (error.message || 'Error desconocido'));
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
                console.log(`✅ Local booking ${localBookingId} deleted`);
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
            this.calendarEvents = this.calendarEvents.filter(e => e.id !== event.id);

        } catch (err: any) {
            this.toastService.error('Error', err.message || 'No se pudo eliminar el evento.');
        } finally {
            this.isDeletingEvent.set(false);
        }
    }

    onEventCreated(createdEvent?: any) {
        this.showEventModal = false;

        if (createdEvent) {
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

            this.calendarEvents = [...this.calendarEvents, newEvt];
        }

        // Reload events for current view after a slight delay for eventual consistency
        if (this.loadedRange) {
            console.log('🔄 Reloading events after creation...');
            setTimeout(() => {
                this.loadCalendarEvents(this.loadedRange!.start, this.loadedRange!.end);
            }, 1000);
        } else {
            // Fallback
            const start = this.addMonths(new Date(), -1);
            const end = this.addMonths(new Date(), 2);
            setTimeout(() => {
                this.loadCalendarEvents(start, end);
            }, 1000);
        }
    }

    async onEventChange(event: any) {
        console.log('🔄 Event changed:', event);

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
        const oldEvent = this.calendarEvents.find(e => e.id === event.id);
        if (!oldEvent) return;

        // 3. Optimistic Update
        console.log('⚡ Optimistic Update for:', event.title, 'New Start:', event.start);
        // Create a new reference for the array AND the event to trigger change detection
        this.calendarEvents = this.calendarEvents.map(e => e.id === event.id ? { ...event } : e);

        const client = this.supabase.getClient();
        const integration = this.googleIntegration();

        if (!integration?.metadata?.calendar_id_appointments) {
            console.warn('⚠️ No calendar config for update - Reverting.');
            // Rollback
            this.calendarEvents = this.calendarEvents.map(e => e.id === event.id ? oldEvent : e);
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
                console.error('❌ Error updating event in Google Calendar (Supabase Error):', response.error);
                // Rollback on API error
                this.calendarEvents = this.calendarEvents.map(e => e.id === event.id ? oldEvent : e);
                console.log('↩️ Rolled back event due to API error');
                throw response.error;
            }

            console.log('✅ Event updated in Google Calendar (Success)');

        } catch (error) {
            console.error('❌ Exception in onEventChange:', error);
            // Rollback on Exception
            this.calendarEvents = this.calendarEvents.map(e => e.id === event.id ? oldEvent : e);
            console.log('↩️ Rolled back event due to Exception');
        }
    }

    // Track loaded range to prevent unnecessary re-fetches

    onViewChange(view: any) {
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
            console.log('🔄 Fetching new events range for', view.date);
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

    async loadCalendarEvents(start: Date, end: Date) {
        try {
            // Don't set global loading=true to prevent flashing entire UI
            // Maybe add a subtle loading indicator if needed

            const client = this.supabase.getClient();
            const { data: { user } } = await client.auth.getUser();

            if (!user) return;

            const companyId = this.authService.currentCompanyId();
            if (!companyId) return;

            // 1. Fetch Local Bookings
            const { data: localBookings, error: localBookingsError } = await this.bookingsService.getBookings({
                from: start.toISOString(),
                to: end.toISOString()
            });

            if (localBookingsError) {
                console.error('Error fetching local bookings:', localBookingsError);
            }

            let allEvents: any[] = [];

            if (localBookings) {
                allEvents = localBookings.map((b: any) => ({
                    id: b.id, // local booking ID
                    title: b.customer_name + ' - ' + (b.service?.name || 'Servicio'),
                    start: new Date(b.start_time),
                    end: new Date(b.end_time),
                    allDay: false,
                    description: b.notes || '',
                    location: b.meeting_link || null,
                    color: b.status === 'cancelled' 
                        ? '#9ca3af' 
                        : (b.service?.booking_color || b.booking_type?.color || '#6366f1'),
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
                            professionalName: b.professional?.display_name || (b.professional?.user?.name ? (b.professional.user.name + (b.professional.user.surname ? ' ' + b.professional.user.surname : '')) : undefined),
                            resourceName: b.resource?.name
                        }
                    }
                }));
            }

            // Optimization: If googleIntegration is already set, skip fetching it
            let integration = this.googleIntegration();

            if (!integration) {
                const { data: publicUser } = await client
                    .from('users')
                    .select('id')
                    .eq('auth_user_id', user.id)
                    .maybeSingle();

                if (!publicUser) return;

                const { data: integ } = await client
                    .from('integrations')
                    .select('metadata')
                    .eq('user_id', publicUser.id)
                    .eq('provider', 'google_calendar')
                    .maybeSingle();

                integration = integ;
                this.googleIntegration.set(integration);
            }

            if (integration?.metadata?.calendar_id_appointments) {
                const calendarId = integration.metadata.calendar_id_appointments;

                console.log(`📅 Fetching Google Events: ${start.toISOString()} to ${end.toISOString()}`);

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
            this.calendarEvents = Array.from(currentEventsMap.values());

            this.loadedRange = { start, end };
            console.log('📅 Loaded Events. Total:', this.calendarEvents.length);

        } catch (err) {
            console.error('Failed to load calendar events', err);
        }
    }

    async loadBookableServices() {
        const companyId = this.authService.currentCompanyId();
        console.log('🔍 loadBookableServices - companyId:', companyId);

        if (!companyId) {
            console.warn('⚠️ No companyId found, waiting...');
            // Retry after a small delay in case auth hasn't loaded yet
            setTimeout(() => this.loadBookableServices(), 500);
            return;
        }

        this.loading = true;
        this.error = null;

        try {
            console.log('📡 Fetching services for company:', companyId);
            const allServices = await this.servicesService.getServices(companyId);
            console.log('📦 All services received:', allServices.length, allServices);

            this.bookableServices = allServices.filter(s => s.is_bookable === true);
            console.log('✅ Bookable services:', this.bookableServices.length, this.bookableServices);
        } catch (err: any) {
            console.error('❌ Error loading bookable services:', err);
            this.error = 'Error al cargar los servicios reservables';
        } finally {
            this.loading = false;
        }
    }

    async loadClients() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        try {
            console.log('📡 Fetching clients for company:', companyId);
            // getCustomers automatically filters by current companyId from AuthService
            this.customersService.getCustomers({}).subscribe({
                next: (data: any[]) => {
                    console.log('✅ Clients loaded:', data.length);
                    const mapped = data.map((c: any) => ({
                        ...c,
                        // Map name/surname to displayName. Fallback to email if no name.
                        displayName: `${c.name || ''} ${c.surname || ''} (${c.email})`.trim()
                    }));
                    this.clients.set(mapped);
                },
                error: (err: any) => console.error('❌ Error loading clients:', err)
            });

        } catch (err) {
            console.error('❌ Exception loading clients:', err);
        }
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
                return;
            }
            if (data && data.calendars) {
                this.availableCalendars.set(data.calendars);
            }
        } catch (err) {
            console.error('Failed to fetch total available Google Calendars', err);
        }
    }

    loadAvailableResources() {
        this.resourcesService.getResources().subscribe({
            next: (res) => this.availableResources.set(res),
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
