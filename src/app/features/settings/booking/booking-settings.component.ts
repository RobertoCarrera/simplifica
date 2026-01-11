import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BookingAvailabilityComponent } from './tabs/availability/booking-availability.component';
import { ProfessionalsComponent } from './tabs/professionals/professionals.component';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

import { CalendarPageComponent } from '../../calendar/page/calendar-page.component';

@Component({
    selector: 'app-booking-settings',
    standalone: true,
    imports: [CommonModule, RouterModule, BookingAvailabilityComponent, ProfessionalsComponent, SkeletonComponent, CalendarPageComponent],
    templateUrl: './booking-settings.component.html',
    styleUrls: ['./booking-settings.component.scss']
})
export class BookingSettingsComponent implements OnInit {
    private servicesService = inject(SupabaseServicesService);
    private authService = inject(AuthService);
    private bookingsService = inject(SupabaseBookingsService); // Added injection

    activeTab: 'calendar' | 'services' | 'professionals' | 'availability' | 'schedules' = 'calendar';
    bookableServices: Service[] = [];
    loading = true;
    error: string | null = null;

    async ngOnInit() {
        await this.loadBookableServices();
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
