import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseClientService } from '../../services/supabase-client.service';

@Component({
    selector: 'app-portal-services',
    standalone: true,
    imports: [CommonModule, RouterModule],
    template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-4">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Mis Servicios</h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">Servicios contratados y suscripciones activas</p>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading()" class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>

        <!-- Empty State -->
        <div *ngIf="!loading() && services().length === 0" 
          class="bg-white dark:bg-slate-800 rounded-xl p-8 text-center border border-gray-200 dark:border-slate-700">
          <i class="fas fa-tools text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No tienes servicios contratados</h3>
          <p class="text-gray-500 dark:text-gray-400">Cuando contrates servicios, aparecerán aquí.</p>
        </div>

        <!-- Services List -->
        <div *ngIf="!loading() && services().length > 0" class="space-y-4">
          <div *ngFor="let service of services()" 
            class="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">{{ service.name }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ service.description }}</p>
                <div class="flex items-center gap-2 mt-2">
                  <span *ngIf="service.isRecurring" 
                    class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    <i class="fas fa-sync-alt mr-1"></i> Recurrente
                  </span>
                  <span *ngIf="!service.isRecurring" 
                    class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <i class="fas fa-check mr-1"></i> Puntual
                  </span>
                </div>
              </div>
              <div class="text-right">
                <p class="font-semibold text-gray-900 dark:text-white">{{ service.price | currency:'EUR' }}</p>
                <p *ngIf="service.isRecurring" class="text-xs text-gray-500">/ {{ service.billingPeriod }}</p>
                <button *ngIf="service.isRecurring && service.canCancel" 
                  (click)="cancelSubscription(service)"
                  class="mt-2 text-xs text-red-600 hover:text-red-700 dark:text-red-400">
                  Dar de baja
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class PortalServicesComponent implements OnInit {
    private authService = inject(AuthService);
    private supabaseClient = inject(SupabaseClientService);

    loading = signal(true);
    services = signal<ContractedService[]>([]);

    ngOnInit(): void {
        this.loadServices();
    }

    private async loadServices(): Promise<void> {
        this.loading.set(true);
        try {
            const profile = this.authService.userProfile;
            if (!profile?.client_id) {
                console.warn('No client_id found in user profile');
                this.services.set([]);
                return;
            }

            // Use authenticated Supabase client
            const supabase = this.supabaseClient.instance;

            // Load recurring quotes for this client
            const { data, error } = await supabase
                .from('quotes')
                .select(`
                    id, title, recurrence_type, recurrence_interval,
                    total_amount, currency, status,
                    next_run_at, recurrence_end_date,
                    created_at
                `)
                .eq('client_id', profile.client_id)
                .not('recurrence_type', 'is', null)
                .neq('recurrence_type', 'none')
                .in('status', ['accepted', 'active', 'paused'])
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Transform to ContractedService format
            const contractedServices: ContractedService[] = (data || []).map((quote: any) => ({
                id: quote.id,
                name: quote.title || 'Servicio sin título',
                description: this.getRecurrenceDescription(quote.recurrence_type, quote.recurrence_interval),
                price: quote.total_amount || 0,
                isRecurring: true,
                billingPeriod: this.getBillingPeriodLabel(quote.recurrence_type, quote.recurrence_interval),
                canCancel: quote.status === 'accepted' || quote.status === 'active',
                startDate: quote.created_at,
                endDate: quote.recurrence_end_date || undefined
            }));

            this.services.set(contractedServices);
        } catch (error) {
            console.error('Error loading services:', error);
            this.services.set([]);
        } finally {
            this.loading.set(false);
        }
    }

    private getRecurrenceDescription(type: string, interval: number): string {
        const intervalText = interval > 1 ? ` cada ${interval}` : '';
        switch (type) {
            case 'weekly': return `Facturación semanal${intervalText}`;
            case 'monthly': return `Facturación mensual${intervalText}`;
            case 'quarterly': return `Facturación trimestral${intervalText}`;
            case 'yearly': return `Facturación anual${intervalText}`;
            default: return 'Servicio recurrente';
        }
    }

    private getBillingPeriodLabel(type: string, interval: number): string {
        if (interval > 1) {
            switch (type) {
                case 'weekly': return `${interval} semanas`;
                case 'monthly': return `${interval} meses`;
                case 'quarterly': return `${interval} trimestres`;
                case 'yearly': return `${interval} años`;
                default: return 'periodo';
            }
        }
        switch (type) {
            case 'weekly': return 'semana';
            case 'monthly': return 'mes';
            case 'quarterly': return 'trimestre';
            case 'yearly': return 'año';
            default: return 'periodo';
        }
    }

    async cancelSubscription(service: ContractedService): Promise<void> {
        if (!confirm(`¿Estás seguro de que deseas cancelar el servicio "${service.name}"?`)) {
            return;
        }

        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabaseUrl = 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
            const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdXR5amJxZmpybHprcHJ2eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU4NzM2ODIsImV4cCI6MjA0MTQ0OTY4Mn0.o8Pm2wCgSiRlstXP82tjBrIHQOCvQZYtKs6qd6yZb-o';
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Pause the recurrence by updating status
            const { error } = await supabase
                .from('quotes')
                .update({ status: 'paused' })
                .eq('id', service.id);

            if (error) throw error;

            alert('Servicio cancelado correctamente. No se generarán más facturas.');
            await this.loadServices(); // Reload list
        } catch (error) {
            console.error('Error canceling subscription:', error);
            alert('Error al cancelar el servicio. Por favor, contacta con soporte.');
        }
    }
}

interface ContractedService {
    id: string;
    name: string;
    description: string;
    price: number;
    isRecurring: boolean;
    billingPeriod?: string;
    canCancel: boolean;
    startDate: string;
    endDate?: string;
}
