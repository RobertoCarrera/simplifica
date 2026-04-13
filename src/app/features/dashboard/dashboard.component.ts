import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AnalyticsService } from '../../services/analytics.service';
import { SupabaseTicketsService, Ticket } from '../../services/supabase-tickets.service';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
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
    // ⚡ Bolt Optimization: Use OnPush strategy to minimize unnecessary change detection cycles.
    // This component relies on Signals for reactivity, which works perfectly with OnPush.
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
    private analyticsService = inject(AnalyticsService);
    private ticketsService = inject(SupabaseTicketsService);
    private customersService = inject(SupabaseCustomersService);
    private modulesService = inject(SupabaseModulesService);
    public authService = inject(AuthService);

    // Kpis from AnalyticsService
    invoiceMetrics = this.analyticsService.getInvoiceMetrics;
    ticketMetrics = this.analyticsService.getTicketMetrics;
    quoteMetrics = this.analyticsService.getQuoteMetrics;

    // Local Recents Data
    recentTickets = signal<Ticket[]>([]);
    recentCustomers = signal<Customer[]>([]);
    loadingRecents = signal(true);

    // Modal State
    showTicketForm = signal(false);
    showCustomerForm = signal(false);
    showQuoteForm = signal(false);

    // Module check
    hasTicketsModule = computed(() => {
        const modules = this.modulesService.modulesSignal();
        return !!modules && modules.some(m => (m.key === 'moduloSAT' || m.key === 'moduloSat') && m.enabled);
    });

    constructor() { }

    ngOnInit(): void {
        // Initial load
        this.refreshDashboard();
    }

    async refreshDashboard() {
        this.loadingRecents.set(true);

        // Analytics refresh (fire-and-forget — AnalyticsService already loaded in constructor,
        // this only re-triggers if data is stale)
        this.analyticsService.refreshIfStale().catch(console.error);

        try {
            // Fetch tickets and customers in parallel
            const [ticketResponse, customers] = await Promise.all([
                this.hasTicketsModule()
                    ? this.ticketsService.getTickets(undefined, 1, 5)
                    : Promise.resolve(null),
                firstValueFrom(this.customersService.getCustomers({
                    limit: 5,
                    sortBy: 'created_at',
                    sortOrder: 'desc'
                }, false))
            ]);

            if (ticketResponse?.data) {
                this.recentTickets.set(ticketResponse.data);
            }
            if (customers) {
                this.recentCustomers.set(customers);
            }
        } catch (err) {
            console.error('Error loading dashboard recents', err);
        } finally {
            this.loadingRecents.set(false);
        }
    }

    getPriorityColor(priority: string): string {
        switch (priority?.toLowerCase()) {
            case 'critical': return 'text-red-600 bg-red-50 ring-red-500/10';
            case 'high': return 'text-orange-600 bg-orange-50 ring-orange-500/10';
            case 'normal': return 'text-blue-600 bg-blue-50 ring-blue-500/10';
            case 'low': return 'text-gray-600 bg-gray-50 ring-gray-500/10';
            default: return 'text-gray-600 bg-gray-50 ring-gray-500/10';
        }
    }

    // Modal Actions
    openNewTicket() {
        this.showTicketForm.set(true);
    }

    openNewCustomer() {
        this.showCustomerForm.set(true);
    }

    onTicketSaved() {
        this.showTicketForm.set(false);
        this.refreshDashboard();
    }

    onCustomerSaved() {
        this.showCustomerForm.set(false);
        this.refreshDashboard();
    }
}
