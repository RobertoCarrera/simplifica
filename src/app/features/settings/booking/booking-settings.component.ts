import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';
import { ProfessionalsComponent } from './tabs/professionals/professionals.component';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { SupabaseProfessionalsService, Professional } from '../../../services/supabase-professionals.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';


import { CalendarComponent } from '../../calendar/calendar.component';
import { EventFormComponent } from './event-form/event-form.component';
@Component({
    selector: 'app-booking-settings',
    standalone: true,
    imports: [CommonModule, RouterModule, BookingAvailabilityComponent, ProfessionalsComponent, SkeletonComponent, CalendarComponent, EventFormComponent],
    templateUrl: './booking-settings.component.html',
    styleUrls: ['./booking-settings.component.scss']
})
export class BookingSettingsComponent implements OnInit {
    private servicesService = inject(SupabaseServicesService);
    private authService = inject(AuthService);
    private supabase = inject(SimpleSupabaseService);
    private professionalsService = inject(SupabaseProfessionalsService);
    private customersService = inject(SupabaseCustomersService);

    activeTab: 'services' | 'professionals' | 'availability' | 'calendar' = 'services';
    bookableServices: Service[] = [];
    professionals = signal<Professional[]>([]); // New signal
    clients = signal<any[]>([]); // Clients signal
    calendarEvents: any[] = []; // Typed as any[] initially, will map to CalendarEvent
    loading = true;
    error: string | null = null;

    // Add missing signal
    googleIntegration = signal<any>(null);

    // Modal state
    showEventModal = false;
    selectedDate: Date | null = null;

    // ...

    async ngOnInit() {
        await this.loadBookableServices();
        // Initial load: current month +/- 1 month
        const start = this.addMonths(new Date(), -1);
        const end = this.addMonths(new Date(), 2);
        this.loadCalendarEvents(start, end);
        this.loadProfessionals();
        this.loadAvailabilityConstraints();
        this.loadClients();
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
            next: (schedules) => {
                if (schedules.length === 0) return; // Keep defaults

                // Find active days
                const workingDays = [...new Set(schedules.map(s => Number(s.day_of_week)))];

                // Find global min/max hours
                // Format is "HH:MM:SS"
                let minH = 24;
                let maxH = 0;

                schedules.forEach(s => {
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

                    schedules: schedules.map(s => ({
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
            next: (data) => this.professionals.set(data),
            error: (err) => console.error('Error loading professionals', err)
        });
    }

    createEvent(date?: Date) {
        this.selectedDate = date || new Date();
        this.showEventModal = true;
    }

    closeModal() {
        this.showEventModal = false;
        this.selectedDate = null;
    }

    onEventClick(eventClick: any) {
        // Handle event click - maybe open modal to edit?
        // For now user just said "create event", but usually we want to edit.
        // We can reuse showEventModal if we pass event data?
        // Current event modal is for creation. 
        // Let's at least log it or just ignore if not requested?
        // The error was that template calls it. So we need it.
        // We can just log for now to fix error.
        console.log('Event clicked:', eventClick);
    }

    onEventCreated() {
        // Reload events for current view
        if (this.loadedRange) {
            this.loadCalendarEvents(this.loadedRange.start, this.loadedRange.end);
        } else {
            // Fallback
            const start = this.addMonths(new Date(), -1);
            const end = this.addMonths(new Date(), 2);
            this.loadCalendarEvents(start, end);
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
    private loadedRange: { start: Date, end: Date } | null = null;

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

            // ... (rest of user/integration fetch - consider caching integration too if static)

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


            if (!integration?.metadata?.calendar_id_appointments) {
                console.log('No calendar configuration found');
                return;
            }

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
                return;
            }

            if (eventsData?.events) {
                const newEvents = eventsData.events.map((e: any) => {
                    // ... mapping logic (extracted to helper if possible, but kept inline for now)
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
                        attendees: e.attendees || []
                    };
                });

                // Merge/Deduplicate events? 
                // For simplicity, we can just append and verify unique IDs, or just replace if we trust the range.
                // To avoid duplicates logic complexity and potential bugs, lets replace logic:
                // Actually, replacing might lose events if we move windows.
                // Better: Map by ID.

                const currentEventsMap = new Map(this.calendarEvents.map(e => [e.id, e]));
                newEvents.forEach((e: any) => currentEventsMap.set(e.id, e));
                this.calendarEvents = Array.from(currentEventsMap.values());

                this.loadedRange = { start, end };
                console.log('📅 Loaded Google Events. Total:', this.calendarEvents.length);
            }

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
                next: (data) => {
                    console.log('✅ Clients loaded:', data.length);
                    const mapped = data.map(c => ({
                        ...c,
                        // Map name/apellidos to displayName. Fallback to email if no name.
                        displayName: `${c.name || ''} ${c.apellidos || ''} (${c.email})`.trim()
                    }));
                    this.clients.set(mapped);
                },
                error: (err) => console.error('❌ Error loading clients:', err)
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
}
