import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';
import { ProfessionalsComponent } from './tabs/professionals/professionals.component';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';


import { CalendarComponent } from '../../calendar/calendar.component';

@Component({
    selector: 'app-booking-settings',
    standalone: true,
    imports: [CommonModule, RouterModule, BookingAvailabilityComponent, ProfessionalsComponent, SkeletonComponent, CalendarComponent],
    templateUrl: './booking-settings.component.html',
    styleUrls: ['./booking-settings.component.scss']
})
export class BookingSettingsComponent implements OnInit {
    private servicesService = inject(SupabaseServicesService);
    private authService = inject(AuthService);
    private supabase = inject(SimpleSupabaseService);

    activeTab: 'services' | 'professionals' | 'availability' | 'calendar' = 'services';
    bookableServices: Service[] = [];
    calendarEvents: any[] = []; // Typed as any[] initially, will map to CalendarEvent
    loading = true;
    error: string | null = null;

    async ngOnInit() {
        await this.loadBookableServices();
        this.loadCalendarEvents();
    }

    async loadCalendarEvents() {
        try {
            const client = this.supabase.getClient();
            const { data: { user } } = await client.auth.getUser();

            if (!user) return;

            // 1. Get Integration Settings to find selected calendar
            // We need the public user id first to query integrations table which uses public user id
            const { data: publicUser } = await client
                .from('users')
                .select('id')
                .eq('auth_user_id', user.id)
                .single();

            if (!publicUser) return;

            const { data: integration } = await client
                .from('integrations')
                .select('metadata')
                .eq('user_id', publicUser.id)
                .eq('provider', 'google_calendar')
                .single();

            if (!integration?.metadata?.calendar_id_appointments) {
                console.log('No calendar configuration found');
                return;
            }

            const calendarId = integration.metadata.calendar_id_appointments;

            // 2. Fetch Events via Edge Function
            // Calculate time range (e.g., current month +/- 1 month, or just fetch a broad range)
            const start = new Date();
            start.setMonth(start.getMonth() - 1);
            const end = new Date();
            end.setMonth(end.getMonth() + 2);

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
                this.calendarEvents = eventsData.events.map((e: any) => {
                    const isAllDay = !!e.start.date;
                    let start: Date;
                    let end: Date;

                    if (isAllDay) {
                        // Parse YYYY-MM-DD as local midnight to avoid timezone shifts
                        const [sY, sM, sD] = e.start.date.split('-').map(Number);
                        start = new Date(sY, sM - 1, sD);

                        const [eY, eM, eD] = e.end.date.split('-').map(Number);
                        end = new Date(eY, eM - 1, eD);
                    } else {
                        start = new Date(e.start.dateTime);
                        end = new Date(e.end.dateTime);
                    }

                    return {
                        id: e.id,
                        title: e.summary || '(Sin título)',
                        start,
                        end,
                        allDay: isAllDay,
                        description: e.description,
                        location: e.location,
                        color: e.colorId ? undefined : '#4285F4', // Use Google default if no color map
                        type: 'appointment'
                    };
                });
                console.log('📅 Loaded Google Events:', this.calendarEvents.length);
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
