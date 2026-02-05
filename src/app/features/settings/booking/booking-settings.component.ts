import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';
import { ProfessionalsComponent } from './tabs/professionals/professionals.component';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { SupabaseProfessionalsService, Professional } from '../../../services/supabase-professionals.service';
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

    activeTab: 'services' | 'professionals' | 'availability' | 'calendar' = 'services';
    bookableServices: Service[] = [];
    professionals = signal<Professional[]>([]); // New signal
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
    }

    // ... helper methods ...

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
                    .single();

                if (!publicUser) return;

                const { data: integ } = await client
                    .from('integrations')
                    .select('metadata')
                    .eq('user_id', publicUser.id)
                    .eq('provider', 'google_calendar')
                    .single();

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
                        type: 'appointment'
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
