import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { ClientPortalService } from '../../services/client-portal.service';

@Component({
    selector: 'app-portal-services',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-4">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Mis Servicios</h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">Gestiona tus servicios contratados y descubre nuevas opciones</p>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading()" class="flex justify-center py-12">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>

        <!-- Contracted Services -->
        <div *ngIf="!loading()" class="mb-10">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <i class="fas fa-check-circle text-green-500 mr-2"></i> Servicios Contratados
          </h2>
          
          <div *ngIf="services().length === 0" 
            class="bg-white dark:bg-slate-800 rounded-xl p-6 text-center border border-gray-200 dark:border-slate-700 mb-6">
            <p class="text-gray-500 dark:text-gray-400">No tienes servicios activos actualmente.</p>
          </div>

          <div *ngIf="services().length > 0" class="space-y-4">
            <div *ngFor="let service of services()" 
              class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
              <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-bold text-lg text-gray-900 dark:text-white">{{ service.name }}</h3>
                    <span *ngIf="service.status === 'paused'" class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Cancelado
                    </span>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ service.description }}</p>
                  
                  <div class="mt-3 flex flex-wrap gap-3 text-sm">
                    <div *ngIf="service.nextBillingDate" class="flex items-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded">
                      <i class="far fa-calendar-alt mr-1.5 text-orange-500"></i>
                      <span *ngIf="service.status === 'accepted'">Próxima factura: {{ service.nextBillingDate | date:'dd/MM/yyyy' }}</span>
                      <span *ngIf="service.status === 'paused'">Activo hasta: {{ service.nextBillingDate | date:'dd/MM/yyyy' }}</span>
                    </div>
                  </div>
                </div>
                
                <div class="text-right min-w-[120px]">
                  <p class="font-bold text-xl text-gray-900 dark:text-white">{{ service.price | currency:'EUR' }}</p>
                  <p *ngIf="service.isRecurring" class="text-xs text-gray-500 mb-2">/ {{ service.billingPeriod }}</p>
                  
                  <button *ngIf="service.status === 'accepted'" 
                    (click)="cancelSubscription(service)"
                    class="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 hover:underline">
                    Dar de baja
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Public Services -->
        <div *ngIf="!loading() && publicServices().length > 0">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <i class="fas fa-store text-blue-500 mr-2"></i> Catálogo de Servicios
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div *ngFor="let service of publicServices()" 
              class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col">
              
              <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-900 dark:text-white">{{ service.name }}</h3>
                <div class="text-right">
                  <span class="font-bold text-blue-600 dark:text-blue-400 text-lg block">
                    {{ service.displayPrice | currency:'EUR' }}
                  </span>
                  <span *ngIf="service.variants?.length > 0 && !service.selectedVariant" class="text-xs text-gray-500">Desde</span>
                </div>
              </div>
              
              <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 line-clamp-2">{{ service.description }}</p>
              
              <!-- Variants Selector -->
              <div *ngIf="service.variants?.length > 0" class="mb-4">
                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Selecciona una opción:</label>
                <select 
                  [ngModel]="service.selectedVariant" 
                  (ngModelChange)="onVariantChange(service, $event)"
                  class="w-full text-sm rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500">
                  <option [ngValue]="variant" *ngFor="let variant of service.variants">
                    {{ variant.name }} - {{ variant.price | currency:'EUR' }}
                  </option>
                </select>
              </div>

              <div *ngIf="service.features" class="mb-4 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg text-xs text-gray-600 dark:text-gray-300 mt-auto">
                <p class="font-semibold mb-1">Características:</p>
                <p>{{ service.features }}</p>
              </div>

              <div class="flex gap-2 mt-4">
                <button *ngIf="service.allow_direct_contracting"
                  (click)="contractService(service)"
                  class="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors shadow-sm">
                  Contratar
                </button>
                <button 
                  (click)="requestService(service)"
                  [class.w-full]="!service.allow_direct_contracting"
                  [class.flex-1]="service.allow_direct_contracting"
                  class="bg-white dark:bg-slate-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 text-sm font-medium py-2 px-3 rounded-lg transition-colors">
                  Solicitar
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
    private portalService = inject(ClientPortalService);

    loading = signal(true);
    services = signal<ContractedService[]>([]);
    publicServices = signal<any[]>([]);
    settings = signal<any>(null);

    ngOnInit(): void {
        this.loadData();
    }

    private async loadData(): Promise<void> {
        this.loading.set(true);
        try {
            await Promise.all([
                this.loadContractedServices(),
                this.loadPublicServices(),
                this.loadSettings()
            ]);
        } finally {
            this.loading.set(false);
        }
    }

    private async loadSettings() {
        const { data } = await this.portalService.getCompanySettings();
        this.settings.set(data);
    }

    private async loadPublicServices() {
        const { data } = await this.portalService.listPublicServices();
        const services = (data || []).map(service => {
            // Initialize display logic
            const hasVariants = service.variants && service.variants.length > 0;
            let selectedVariant = null;
            let displayPrice = service.base_price;

            if (hasVariants) {
                // Sort variants by price ascending
                service.variants.sort((a: any, b: any) => a.price - b.price);
                // Select first variant by default
                selectedVariant = service.variants[0];
                displayPrice = selectedVariant.price;
            }

            return {
                ...service,
                selectedVariant,
                displayPrice
            };
        });
        this.publicServices.set(services);
    }

    onVariantChange(service: any, variant: any) {
        service.selectedVariant = variant;
        service.displayPrice = variant ? variant.price : service.base_price;
    }

    private async loadContractedServices(): Promise<void> {
        try {
            const profile = this.authService.userProfile;
            if (!profile?.client_id) return;

            const supabase = this.supabaseClient.instance;

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
                .in('status', ['accepted', 'paused'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            const contractedServices: ContractedService[] = (data || []).map((quote: any) => ({
                id: quote.id,
                name: quote.title || 'Servicio sin título',
                description: this.getRecurrenceDescription(quote.recurrence_type, quote.recurrence_interval),
                price: quote.total_amount || 0,
                isRecurring: true,
                billingPeriod: this.getBillingPeriodLabel(quote.recurrence_type, quote.recurrence_interval),
                status: quote.status,
                startDate: quote.created_at,
                endDate: quote.recurrence_end_date || undefined,
                nextBillingDate: quote.next_run_at
            }));

            this.services.set(contractedServices);
        } catch (error) {
            console.error('Error loading services:', error);
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
        if (!confirm(`¿Estás seguro de que deseas dar de baja el servicio "${service.name}"? Se mantendrá activo hasta el final del periodo actual.`)) {
            return;
        }

        try {
            const supabase = this.supabaseClient.instance;
            // Mark as paused. The backend/cron should handle not generating new invoices.
            // We assume 'paused' means "cancelled but maybe active until end of period".
            // Ideally we should set recurrence_end_date to next_run_at.
            
            const updates: any = { status: 'paused' };
            if (service.nextBillingDate) {
                updates.recurrence_end_date = service.nextBillingDate;
            }

            const { error } = await supabase
                .from('quotes')
                .update(updates)
                .eq('id', service.id);

            if (error) throw error;

            alert('Servicio dado de baja correctamente.');
            await this.loadContractedServices();
        } catch (error) {
            console.error('Error canceling subscription:', error);
            alert('Error al cancelar el servicio.');
        }
    }

    async requestService(service: any) {
        const variantName = service.selectedVariant ? ` (${service.selectedVariant.name})` : '';
        if (!confirm(`¿Solicitar información sobre "${service.name}${variantName}"? Se generará una solicitud de presupuesto.`)) return;
        
        const { error } = await this.portalService.requestService(service.id, service.selectedVariant?.id);
        if (error) {
            alert('Error al solicitar el servicio: ' + error.message);
        } else {
            alert('Solicitud enviada correctamente. Te contactaremos pronto.');
        }
    }

    async contractService(service: any) {
        const price = service.displayPrice;
        const variantName = service.selectedVariant ? ` (${service.selectedVariant.name})` : '';
        
        if (!confirm(`¿Contratar "${service.name}${variantName}" por ${price}€? Serás redirigido al pago.`)) return;

        const { data, error } = await this.portalService.contractService(service.id, service.selectedVariant?.id);
        if (error) {
            alert('Error al iniciar contratación: ' + error.message);
        } else {
            // If data contains a payment URL, redirect.
            if (data?.paymentUrl) {
                window.location.href = data.paymentUrl;
            } else {
                alert('Servicio contratado correctamente.');
                await this.loadContractedServices();
            }
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
    status: string;
    startDate: string;
    endDate?: string;
    nextBillingDate?: string;
}
