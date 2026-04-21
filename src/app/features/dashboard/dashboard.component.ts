import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AnalyticsService } from '../../services/analytics.service';
import { SupabaseTicketsService, Ticket } from '../../services/supabase-tickets.service';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
import { SupabaseBookingsService, Booking } from '../../services/supabase-bookings.service';
import { Customer } from '../../models/customer';

import { AuthService } from '../../services/auth.service';
import { TicketFormComponent } from '../tickets/ticket-form/ticket-form.component';
import { QuoteFormComponent } from '../quotes/quote-form/quote-form.component';
import { FormNewCustomerComponent } from "../customers/form-new-customer/form-new-customer.component";
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        TicketFormComponent,
        QuoteFormComponent,
        FormNewCustomerComponent,
        TranslocoPipe
    ],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
    private analyticsService = inject(AnalyticsService);
    private ticketsService = inject(SupabaseTicketsService);
    private customersService = inject(SupabaseCustomersService);
    private modulesService = inject(SupabaseModulesService);
    private bookingsService = inject(SupabaseBookingsService);
    public authService = inject(AuthService);

    // Raw KPI data from AnalyticsService
    invoiceKpis = this.analyticsService.getRawInvoiceKpis;
    ticketStatus = this.analyticsService.getTicketCurrentStatus;
    invoiceTrend = this.analyticsService.getInvoiceHistoricalTrend;
    ticketTrend = this.analyticsService.getTicketHistoricalTrend;
    quoteMetrics = this.analyticsService.getQuoteMetrics;
    pipeline = this.analyticsService.getCurrentPipeline;

    // Local data
    recentTickets = signal<Ticket[]>([]);
    recentCustomers = signal<Customer[]>([]);
    todayBookings = signal<Booking[]>([]);
    loadingRecents = signal(true);

    // Modal State
    showTicketForm = signal(false);
    showCustomerForm = signal(false);
    showQuoteForm = signal(false);

    // Module checks
    hasTicketsModule = computed(() => {
        const modules = this.modulesService.modulesSignal();
        return !!modules && modules.some(m => (m.key === 'moduloSAT' || m.key === 'moduloSat') && m.enabled);
    });

    hasBookingsModule = computed(() => {
        const modules = this.modulesService.modulesSignal();
        return !!modules && modules.some(m => m.key === 'moduloReservas' && m.enabled);
    });

    hasInvoicesModule = computed(() => {
        const modules = this.modulesService.modulesSignal();
        return !!modules && modules.some(m => m.key === 'moduloFacturacion' && m.enabled);
    });

    hasQuotesModule = computed(() => {
        const modules = this.modulesService.modulesSignal();
        return !!modules && modules.some(m => m.key === 'moduloPresupuestos' && m.enabled);
    });

    // Greeting based on time of day
    greeting = computed(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'dashboard.goodMorning';
        if (hour < 20) return 'dashboard.goodAfternoon';
        return 'dashboard.goodEvening';
    });

    userName = computed(() => {
        const profile = this.authService.userProfileSignal();
        return profile?.name || profile?.full_name?.split(' ')[0] || '';
    });

    // Today's date formatted
    todayFormatted = computed(() => {
        return new Intl.DateTimeFormat('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long'
        }).format(new Date());
    });

    // Revenue chart bars (last 6 months)
    revenueBars = computed(() => {
        const trend = this.invoiceTrend();
        if (!trend?.length) return [];
        const max = Math.max(...trend.map(t => t.total), 1);
        return trend.map(t => ({
            month: new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(new Date(t.month + '-01')),
            total: t.total,
            height: Math.round((t.total / max) * 100),
            collected: t.collected,
        }));
    });

    // Upcoming bookings (next 3 hours or rest of day)
    upcomingBookings = computed(() => {
        const bookings = this.todayBookings();
        const now = new Date();
        return bookings
            .filter(b => new Date(b.start_time) >= now && b.status !== 'cancelled')
            .slice(0, 5);
    });

    pastBookingsToday = computed(() => {
        const bookings = this.todayBookings();
        const now = new Date();
        return bookings
            .filter(b => new Date(b.start_time) < now && b.status !== 'cancelled')
            .length;
    });

    constructor() { }

    ngOnInit(): void {
        this.refreshDashboard();
    }

    async refreshDashboard() {
        this.loadingRecents.set(true);
        this.analyticsService.refreshIfStale().catch(console.error);

        const companyId = this.authService.companyId();
        const userRole = this.authService.userRole();
        const activeProfessionalId = this.authService.activeProfessionalId();
        const isProfessional = userRole === 'professional' && !!activeProfessionalId;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

        try {
            const promises: Promise<any>[] = [
                // Recent customers — service auto-filters by professional when isProfessional
                firstValueFrom(this.customersService.getCustomers({
                    limit: 5,
                    sortBy: 'created_at',
                    sortOrder: 'desc'
                }, false)),
            ];

            // Tickets (if module enabled)
            if (this.hasTicketsModule()) {
                promises.push(this.ticketsService.getTickets(undefined, 1, 5));
            } else {
                promises.push(Promise.resolve(null));
            }

            // Bookings today (if module enabled) — filter by professional when in professional mode
            if (this.hasBookingsModule() && companyId) {
                promises.push(this.bookingsService.getBookings({
                    companyId,
                    from: todayStart,
                    to: todayEnd,
                    ascending: true,
                    limit: 20,
                    ...(isProfessional ? { professionalId: activeProfessionalId! } : {})
                }));
            } else {
                promises.push(Promise.resolve(null));
            }

            const [customers, ticketResponse, bookingsResponse] = await Promise.all(promises);

            if (customers) this.recentCustomers.set(customers);
            if (ticketResponse?.data) this.recentTickets.set(ticketResponse.data);
            if (bookingsResponse?.data) this.todayBookings.set(bookingsResponse.data);
        } catch (err) {
            console.error('Error loading dashboard', err);
        } finally {
            this.loadingRecents.set(false);
        }
    }

    getPriorityColor(priority: string): string {
        switch (priority?.toLowerCase()) {
            case 'critical': return 'text-red-600 bg-red-50 dark:bg-red-900/20 ring-red-500/10';
            case 'high': return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 ring-orange-500/10';
            case 'normal': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-blue-500/10';
            case 'low': return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 ring-gray-500/10';
            default: return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 ring-gray-500/10';
        }
    }

    getBookingStatusColor(status: string): string {
        switch (status) {
            case 'confirmed': return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400';
            case 'pending': return 'text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400';
            case 'completed': return 'text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
            case 'no_show': return 'text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
            default: return 'text-gray-700 bg-gray-50 dark:bg-gray-900/20 dark:text-gray-400';
        }
    }

    formatTime(isoString: string): string {
        return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoString));
    }

    formatCurrency(value: number): string {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
    }

    // Modal Actions
    openNewTicket() { this.showTicketForm.set(true); }
    openNewCustomer() { this.showCustomerForm.set(true); }
    onTicketSaved() { this.showTicketForm.set(false); this.refreshDashboard(); }
    onCustomerSaved() { this.showCustomerForm.set(false); this.refreshDashboard(); }
}
