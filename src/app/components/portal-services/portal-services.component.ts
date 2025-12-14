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
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div *ngFor="let service of publicServices()" 
              class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all flex flex-col overflow-hidden group/card">
              
              <!-- Header with gradient -->
              <div class="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-6 py-5 relative overflow-hidden">
                <div class="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white opacity-10 rounded-full blur-xl"></div>
                
                <div class="flex justify-between items-start relative z-10">
                  <div class="flex-1 pr-4">
                    <h3 class="font-bold text-white text-xl tracking-tight">{{ service.name }}</h3>
                    <p *ngIf="service.selectedVariant" class="text-blue-100 text-sm mt-1 font-medium">
                      <i class="fas fa-tag mr-1 opacity-70"></i> {{ service.selectedVariant.name }}
                    </p>
                  </div>
                  <div class="text-right bg-white/10 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/20">
                    <ng-container *ngIf="service.displayPrice > 0; else consultPrice">
                      <span class="font-bold text-white text-2xl block leading-none">
                        {{ service.displayPrice | currency:'EUR' }}
                      </span>
                      <div class="text-blue-100 text-xs mt-1 font-medium">
                        <span *ngIf="service.selectedVariant?.billingPeriod === 'monthly'">/mes</span>
                        <span *ngIf="service.selectedVariant?.billingPeriod === 'annually'">/año</span>
                        <span *ngIf="service.variants?.length > 1 && !service.selectedVariant">desde</span>
                      </div>
                    </ng-container>
                    <ng-template #consultPrice>
                      <span class="font-bold text-white text-lg block">Consultar</span>
                    </ng-template>
                  </div>
                </div>
              </div>
              
              <div class="p-6 flex-1 flex flex-col">
                <p *ngIf="service.description" class="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">{{ service.description }}</p>
              
                <!-- Variants Selector (Compact) -->
                <div *ngIf="service.variants?.length > 0" class="mb-6">
                  <div class="flex items-center justify-between mb-3">
                    <label class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Elige tu plan ({{ service.variants.length }} opciones)
                    </label>
                  </div>
                  
                  <div class="flex flex-wrap gap-2">
                    <div *ngFor="let variant of service.variants" 
                         (click)="onVariantChange(service, variant)"
                         class="cursor-pointer px-3 py-2 rounded-lg border transition-all duration-200 flex items-center gap-2"
                         [ngClass]="{
                           'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500 ring-1 ring-blue-500/20': service.selectedVariant?.id === variant.id,
                           'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-slate-700/50': service.selectedVariant?.id !== variant.id
                         }">
                      <div class="w-4 h-4 rounded-full border flex items-center justify-center"
                           [ngClass]="{
                             'border-blue-500 bg-blue-500': service.selectedVariant?.id === variant.id,
                             'border-gray-300 dark:border-gray-500': service.selectedVariant?.id !== variant.id
                           }">
                        <div class="w-1.5 h-1.5 bg-white rounded-full" *ngIf="service.selectedVariant?.id === variant.id"></div>
                      </div>
                      <span class="text-sm font-medium">{{ variant.name }}</span>
                    </div>
                  </div>
                </div>

                <!-- Dynamic Features Section -->
                <div class="mb-6 bg-gray-50 dark:bg-gray-700/30 p-5 rounded-xl border border-gray-100 dark:border-gray-700 mt-auto">
                  <!-- Title changes based on context -->
                  <p class="font-semibold mb-3 text-sm text-gray-900 dark:text-white flex items-center">
                    <ng-container *ngIf="service.variants?.length > 1; else defaultTitle">
                      <i class="fas fa-check-circle text-blue-500 mr-2"></i> Incluye en {{ service.selectedVariant?.name }}:
                    </ng-container>
                    <ng-template #defaultTitle>
                      <i class="fas fa-star text-yellow-500 mr-2"></i> Características Destacadas
                    </ng-template>
                  </p>

                  <!-- Features List -->
                  <ul class="space-y-2.5">
                    <!-- If variant selected, show variant features -->
                    <ng-container *ngIf="service.selectedVariant?.features?.included?.length > 0; else serviceFeatures">
                      <li *ngFor="let feature of service.selectedVariant.features.included" class="flex items-start text-sm group">
                        <div class="mt-1 mr-3 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                          <i class="fas fa-check text-blue-600 dark:text-blue-400 text-[10px]"></i>
                        </div>
                        <span class="text-gray-700 dark:text-gray-300 leading-relaxed">{{ feature }}</span>
                      </li>
                    </ng-container>
                    
                    <!-- Fallback to service features if no variant features or no variants -->
                    <ng-template #serviceFeatures>
                      <li *ngFor="let feature of parseFeatures(service.features)" class="flex items-start text-sm group">
                        <div class="mt-1 mr-3 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                          <i class="fas fa-check text-green-600 dark:text-green-400 text-[10px]"></i>
                        </div>
                        <span class="text-gray-700 dark:text-gray-300 leading-relaxed">{{ feature }}</span>
                      </li>
                    </ng-template>
                  </ul>
                </div>

                <div class="pt-4 flex gap-3">
                  <button *ngIf="service.allow_direct_contracting"
                    (click)="contractService(service)"
                    class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2">
                    <i class="fas fa-shopping-cart"></i>
                    <span>Contratar {{ service.selectedVariant ? service.selectedVariant.name : '' }}</span>
                  </button>
                  
                  <button 
                    (click)="requestService(service)"
                    [class.w-full]="!service.allow_direct_contracting"
                    [class.flex-1]="service.allow_direct_contracting"
                    class="bg-white dark:bg-slate-800 border-2 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-semibold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
                    <i class="fas fa-envelope"></i>
                    <span>Solicitar Info</span>
                  </button>
                </div>
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
        console.log('🔍 RAW public services from DB:', JSON.stringify(data, null, 2));
        
        const services = (data || []).map(service => {
            console.log(`📦 Service "${service.name}":`, {
                variants: service.variants,
                variantsCount: service.variants?.length,
                base_price: service.base_price
            });
            
            // Map variants to expected structure
            const mappedVariants = (service.variants || [])
                .filter((v: any) => v.is_active !== false)
                .map((v: any) => {
                    console.log(`  🏷️ Variant "${v.variant_name}":`, {
                        base_price: v.base_price,
                        pricing: v.pricing,
                        billing_period: v.billing_period
                    });
                    
                    // Extract price from new pricing array if available, fallback to legacy fields
                    let price = v.base_price ?? v.price ?? 0;
                    let billingPeriod = v.billing_period;

                    // Handle pricing if it's a string (JSON stringified)
                    let pricingData = v.pricing;
                    if (typeof pricingData === 'string') {
                        try {
                            pricingData = JSON.parse(pricingData);
                        } catch (e) {
                            console.error('Error parsing pricing JSON:', e);
                            pricingData = [];
                        }
                    }

                    if (pricingData && Array.isArray(pricingData) && pricingData.length > 0) {
                        // Default to the first pricing option found (usually the primary one)
                        // In a more advanced UI we could allow selecting the billing period too
                        const firstOption = pricingData[0];
                        price = firstOption.base_price ?? 0;
                        billingPeriod = firstOption.billing_period;
                        console.log(`    💰 Using pricing array:`, firstOption);
                    }

                    return {
                        id: v.id,
                        name: v.variant_name || v.name,
                        price: price,
                        billingPeriod: billingPeriod,
                        features: v.features || { included: [], excluded: [] },
                        displayConfig: v.display_config || {}
                    };
                })
                .sort((a: any, b: any) => a.price - b.price);

            console.log(`  ✅ Mapped variants for "${service.name}":`, mappedVariants);

            const hasVariants = mappedVariants.length > 0;
            let selectedVariant = null;
            let displayPrice = service.base_price || 0;

            if (hasVariants) {
                // Select first variant by default (lowest price due to sort)
                selectedVariant = mappedVariants[0];
                displayPrice = selectedVariant.price;
            }

            return {
                ...service,
                variants: mappedVariants,
                selectedVariant,
                displayPrice
            };
        });
        console.log('🎯 Final processed services:', services);
        this.publicServices.set(services);
    }

    onVariantChange(service: any, variant: any) {
        service.selectedVariant = variant;
        service.displayPrice = variant ? variant.price : service.base_price;
    }

    getBillingLabel(period: string): string {
        switch (period) {
            case 'monthly': return 'Mensual';
            case 'annually': return 'Anual';
            case 'one-time': return 'Pago único';
            case 'custom': return 'Personalizado';
            default: return period;
        }
    }

    parseFeatures(features: any): string[] {
        if (!features) return [];
        if (Array.isArray(features)) return features;
        if (typeof features === 'string') {
            // Split by comma, semicolon, or newline
            return features.split(/[,;\n]+/).map(f => f.trim()).filter(f => f.length > 0);
        }
        if (typeof features === 'object' && features.included) {
            return features.included;
        }
        return [];
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
