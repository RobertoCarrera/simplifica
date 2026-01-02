import { Component, inject, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ClientPortalService } from '../../../services/client-portal.service';
import { ToastService } from '../../../services/toast.service';
import { ContractProgressDialogComponent } from '../../../shared/components/contract-progress-dialog/contract-progress-dialog.component';
import { PaymentMethodSelectorComponent, PaymentSelection } from '../../../features/payments/selector/payment-method-selector.component';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';
import { PromptModalComponent } from '../../../shared/ui/prompt-modal/prompt-modal.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

@Component({
  selector: 'app-portal-services',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ContractProgressDialogComponent, PaymentMethodSelectorComponent, ConfirmModalComponent, PromptModalComponent, SkeletonComponent],
  template: `
    <!-- Confirm Modal -->
    <app-confirm-modal #confirmModal></app-confirm-modal>
    <app-prompt-modal #promptModal></app-prompt-modal>

    <!-- Contract Progress Dialog -->
    <app-contract-progress-dialog 
      #contractDialog
      (closed)="onContractDialogClosed()"
      (localPaymentSelected)="onLocalPaymentSelectedForContract()"
    ></app-contract-progress-dialog>

    <!-- Payment Method Selector -->
    <app-payment-method-selector
      #paymentSelector
      (selected)="onPaymentMethodSelected($event)"
      (cancelled)="onPaymentSelectionCancelled()"
    ></app-payment-method-selector>

    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-4">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Mis Servicios</h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">Gestiona tus servicios contratados y descubre nuevas opciones</p>
        </div>

        <!-- Loading State -->
        <!-- Loading State -->
        <div *ngIf="loading()" class="grid grid-cols-1 gap-4 mb-8">
          <app-skeleton type="card" height="200px" width="100%"></app-skeleton>
          <app-skeleton type="card" height="200px" width="100%"></app-skeleton>
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
              <div class="flex flex-col gap-4">
                <!-- Header -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-bold text-lg text-gray-900 dark:text-white">{{ service.name }}</h3>
                      <!-- Pending Payment Badge -->
                      <span *ngIf="service.paymentStatus === 'pending'" class="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                         <i class="fas fa-exclamation-circle"></i> Pendiente de Pago
                      </span>
                      <span *ngIf="service.status === 'paused'" class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        Cancelado
                      </span>
                      <span *ngIf="service.selectedVariant" class="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {{ service.selectedVariant.name }}
                      </span>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ service.description }}</p>
                    
                    <div class="mt-3 flex flex-wrap gap-3 text-sm" *ngIf="service.paymentStatus !== 'pending'">
                      <div *ngIf="service.nextBillingDate" class="flex items-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded">
                        <i class="far fa-calendar-alt mr-1.5 text-orange-500"></i>
                        <span *ngIf="service.status === 'accepted'">Próxima factura: {{ service.nextBillingDate | date:'dd/MM/yyyy' }}</span>
                        <span *ngIf="service.status === 'paused'">Activo hasta: {{ service.nextBillingDate | date:'dd/MM/yyyy' }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="text-right min-w-[120px] flex flex-col items-end gap-2">
                    <div>
                      <p class="font-bold text-xl text-gray-900 dark:text-white">{{ service.price | currency:'EUR' }}</p>
                      <p *ngIf="service.isRecurring" class="text-xs text-gray-500">/ {{ service.billingPeriod }}</p>
                    </div>
                    
                    <!-- Cancel Button - Only show if paid and active -->
                    <button *ngIf="service.status === 'accepted' && service.paymentStatus !== 'pending'" 
                      (click)="cancelSubscription(service)"
                      class="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 hover:underline">
                      Dar de baja
                    </button>
                    
                    <!-- Pay Button - Show if pending -->
                    <button *ngIf="service.paymentStatus === 'pending'" 
                        (click)="openPaymentForService(service)"
                        class="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                        <i class="fas fa-credit-card"></i> Pagar ahora
                    </button>
                  </div>
                </div>

                <!-- Contracted Service Features -->
                <div *ngIf="hasServiceFeatures(service)" 
                     class="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-4 border border-gray-100 dark:border-slate-600">
                  <p class="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                    <i class="fas fa-list-check text-green-500 mr-2"></i>
                    Tu plan incluye:
                  </p>
                  <ul class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <li *ngFor="let feat of getAllOrderedFeaturesWithState(getServiceFeatures(service))" 
                        class="flex items-center text-sm"
                        [ngClass]="{ 'opacity-60': feat.state === 'excluded' }">
                      <i class="fas mr-2 text-xs"
                         [ngClass]="{
                           'fa-check text-green-500': feat.state === 'included',
                           'fa-times text-red-400': feat.state === 'excluded'
                         }"></i>
                      <span [ngClass]="{
                        'text-gray-700 dark:text-gray-300': feat.state === 'included',
                        'text-gray-400 dark:text-gray-500 line-through': feat.state === 'excluded'
                      }">{{ feat.name }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Variants Comparison - Hide if pending payment -->
                <div *ngIf="service.variants && service.variants.length > 1 && service.paymentStatus !== 'pending'" class="border-t border-gray-200 dark:border-slate-700 pt-4">
                  <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                    <i class="fas fa-exchange-alt mr-2 text-blue-500"></i>
                    Comparar y cambiar de plan
                  </h4>
                  
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div *ngFor="let variant of service.variants" 
                         (click)="changeVariant(service, variant)"
                         class="cursor-pointer p-3 rounded-lg border transition-all duration-200"
                         [ngClass]="{
                           'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20': service.selectedVariant?.id === variant.id,
                           'border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-slate-700/50': service.selectedVariant?.id !== variant.id
                         }">
                      <div class="flex justify-between items-start mb-2">
                        <div>
                          <p class="font-semibold text-sm text-gray-900 dark:text-white">{{ variant.name }}</p>
                          <p class="text-xs text-gray-500 dark:text-gray-400" *ngIf="variant.billingPeriod === 'monthly'">Mensual</p>
                          <p class="text-xs text-gray-500 dark:text-gray-400" *ngIf="variant.billingPeriod === 'annually'">Anual</p>
                        </div>
                        <div class="text-right">
                          <p class="font-bold text-lg text-gray-900 dark:text-white">{{ variant.price | currency:'EUR' }}</p>
                          <p class="text-xs text-gray-500" *ngIf="variant.billingPeriod === 'monthly'">/mes</p>
                          <p class="text-xs text-gray-500" *ngIf="variant.billingPeriod === 'annually'">/año</p>
                        </div>
                      </div>
                      
                      <ul class="space-y-1 mt-2">
                        <li *ngFor="let feat of getAllOrderedFeaturesWithState(variant.features).slice(0, 4)" 
                            class="text-xs flex items-start"
                            [ngClass]="{
                              'text-gray-600 dark:text-gray-400': feat.state === 'included',
                              'text-gray-400 dark:text-gray-500 line-through': feat.state === 'excluded'
                            }">
                          <i class="fas mr-1.5 mt-0.5 text-[10px]"
                             [ngClass]="{
                               'fa-check text-green-500': feat.state === 'included',
                               'fa-times text-red-500': feat.state === 'excluded'
                             }"></i>
                          <span>{{ feat.name }}</span>
                        </li>
                        <li *ngIf="(variant.features?.included?.length || 0) + (variant.features?.excluded?.length || 0) > 4" 
                            class="text-xs text-gray-500 dark:text-gray-500 italic">
                          +{{ (variant.features?.included?.length || 0) + (variant.features?.excluded?.length || 0) - 4 }} más
                        </li>
                      </ul>
                      
                      <button *ngIf="service.selectedVariant?.id !== variant.id && service.status === 'accepted'"
                              class="mt-3 w-full text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        Cambiar a este plan
                      </button>
                      <div *ngIf="service.selectedVariant?.id === variant.id" 
                           class="mt-3 text-xs font-medium text-green-600 dark:text-green-400 flex items-center justify-center">
                        <i class="fas fa-check-circle mr-1"></i> Plan actual
                      </div>
                    </div>
                  </div>
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
          
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                    <ng-container *ngIf="service.selectedVariant; else defaultTitle">
                      <i class="fas fa-check-circle text-blue-500 mr-2"></i> Incluye en {{ service.selectedVariant.name }}:
                    </ng-container>
                    <ng-template #defaultTitle>
                      <i class="fas fa-star text-yellow-500 mr-2"></i> Características Destacadas
                    </ng-template>
                  </p>

                  <!-- Features List -->
                  <ul class="space-y-2.5">
                    <!-- Show variant features if available -->
                    <ng-container *ngIf="service.selectedVariant?.features && ((service.selectedVariant.features.included?.length ?? 0) > 0 || (service.selectedVariant.features.excluded?.length ?? 0) > 0)">
                      <li *ngFor="let feat of getAllOrderedFeaturesWithState(service.selectedVariant.features)" 
                          class="flex items-start text-sm group"
                          [ngClass]="{ 'opacity-60': feat.state === 'excluded' }">
                        <div class="mt-1 mr-3 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                             [ngClass]="{
                               'bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-900/50': feat.state === 'included',
                               'bg-red-100 dark:bg-red-900/30': feat.state === 'excluded'
                             }">
                          <i class="fas text-[10px]"
                             [ngClass]="{
                               'fa-check text-green-600 dark:text-green-400': feat.state === 'included',
                               'fa-times text-red-500 dark:text-red-400': feat.state === 'excluded'
                             }"></i>
                        </div>
                        <span [ngClass]="{
                          'text-gray-700 dark:text-gray-300 leading-relaxed': feat.state === 'included',
                          'text-gray-500 dark:text-gray-500 line-through leading-relaxed': feat.state === 'excluded'
                        }">{{ feat.name }}</span>
                      </li>
                    </ng-container>
                    
                    <!-- Fallback to service features if variant has no features -->
                    <ng-container *ngIf="!service.selectedVariant?.features || ((service.selectedVariant.features.included?.length ?? 0) === 0 && (service.selectedVariant.features.excluded?.length ?? 0) === 0)">
                      <li *ngFor="let feature of parseFeatures(service.features)" class="flex items-start text-sm group">
                        <div class="mt-1 mr-3 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                          <i class="fas fa-check text-green-600 dark:text-green-400 text-[10px]"></i>
                        </div>
                        <span class="text-gray-700 dark:text-gray-300 leading-relaxed">{{ feature }}</span>
                      </li>
                    </ng-container>
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
  private toastService = inject(ToastService);

  @ViewChild('contractDialog') contractDialog!: ContractProgressDialogComponent;
  @ViewChild('paymentSelector') paymentSelector!: PaymentMethodSelectorComponent;
  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChild('promptModal') promptModal!: PromptModalComponent;

  loading = signal(true);
  services = signal<ContractedService[]>([]);
  publicServices = signal<any[]>([]);
  settings = signal<any>(null);

  // State for payment method selection flow
  private pendingContractService: any = null;
  private pendingPaymentData: any = null;
  private lastCreatedInvoiceId: string | null = null;

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
      return this.getOrderedFeatures(features);
    }
    return [];
  }

  /**
   * Obtiene las características incluidas ordenadas según feature_order
   */
  getOrderedFeatures(features: any): string[] {
    if (!features?.included?.length) return [];

    const featureOrder = features?.feature_order as string[] | undefined;
    if (!featureOrder || featureOrder.length === 0) {
      return features.included;
    }

    // Ordenar según feature_order
    const orderedFeatures: string[] = [];
    for (const feature of featureOrder) {
      if (features.included.includes(feature)) {
        orderedFeatures.push(feature);
      }
    }

    // Añadir cualquier característica que no esté en el orden
    for (const feature of features.included) {
      if (!orderedFeatures.includes(feature)) {
        orderedFeatures.push(feature);
      }
    }

    return orderedFeatures;
  }

  /**
   * Obtiene todas las características ordenadas con su estado (incluida/excluida)
   */
  getAllOrderedFeaturesWithState(features: any): Array<{ name: string; state: 'included' | 'excluded' }> {
    const result: Array<{ name: string; state: 'included' | 'excluded' }> = [];
    const included = features?.included || [];
    const excluded = features?.excluded || [];
    const featureOrder = features?.feature_order as string[] | undefined;
    const seen = new Set<string>();

    // Si hay orden definido, usarlo
    if (featureOrder && featureOrder.length > 0) {
      for (const feature of featureOrder) {
        if (!seen.has(feature)) {
          seen.add(feature);
          if (included.includes(feature)) {
            result.push({ name: feature, state: 'included' });
          } else if (excluded.includes(feature)) {
            result.push({ name: feature, state: 'excluded' });
          }
        }
      }
    }

    // Añadir características que no están en el orden
    for (const feature of included) {
      if (!seen.has(feature)) {
        seen.add(feature);
        result.push({ name: feature, state: 'included' });
      }
    }
    for (const feature of excluded) {
      if (!seen.has(feature)) {
        seen.add(feature);
        result.push({ name: feature, state: 'excluded' });
      }
    }

    return result;
  }

  hasServiceFeatures(service: ContractedService): boolean {
    const features = service.selectedVariant?.features;
    if (!features) return false;
    const included = features.included?.length ?? 0;
    const excluded = features.excluded?.length ?? 0;
    return included > 0 || excluded > 0;
  }

  getServiceFeatures(service: ContractedService): any {
    return service.selectedVariant?.features || {};
  }

  private async loadContractedServices(): Promise<void> {
    try {
      const profile = this.authService.userProfile;
      if (!profile?.client_id) return;

      const supabase = this.supabaseClient.instance;

      // 1. Load quotes with their items AND latest invoice status
      const { data, error } = await supabase
        .from('quotes')
        .select(`
                    id, title, recurrence_type, recurrence_interval,
                    total_amount, currency, status,
                    next_run_at, recurrence_end_date,
                    created_at,
                    items:quote_items(
                        service_id, variant_id, billing_period
                    ),
                    invoices!invoices_source_quote_id_fkey(
                        id, status, payment_status, created_at, invoice_number, invoice_series, full_invoice_number
                    )
                `)
        .eq('client_id', profile.client_id)
        .not('recurrence_type', 'is', null)
        .neq('recurrence_type', 'none')
        .in('status', ['accepted', 'paused'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2. Extract unique service IDs
      const serviceIds = new Set<string>();
      (data || []).forEach((quote: any) => {
        if (quote.items && quote.items.length > 0) {
          quote.items.forEach((item: any) => {
            if (item.service_id) serviceIds.add(item.service_id);
          });
        }
      });

      // 3. Load services and their variants (even if not public, since they are contracted)
      let servicesMap = new Map<string, any>();
      if (serviceIds.size > 0) {
        // Load each service individually to get variants even if not public
        for (const serviceId of serviceIds) {
          const { data: serviceData } = await this.portalService.getServiceWithVariants(serviceId);
          if (serviceData) {
            servicesMap.set(serviceId, serviceData);
          }
        }
      }

      // 4. Map quotes to contracted services with variants
      const contractedServices: ContractedService[] = (data || []).map((quote: any) => {
        const firstItem = quote.items && quote.items.length > 0 ? quote.items[0] : null;
        const serviceId = firstItem?.service_id;
        const variantId = firstItem?.variant_id;
        const service = serviceId ? servicesMap.get(serviceId) : null;

        let variants: any[] = [];
        let selectedVariant = null;

        if (service?.variants) {
          // Map variants from service
          variants = service.variants.map((v: any) => {
            let pricingData = v.pricing;
            if (typeof pricingData === 'string') {
              try { pricingData = JSON.parse(pricingData); } catch (e) { pricingData = []; }
            }
            const firstPrice = pricingData && Array.isArray(pricingData) && pricingData.length > 0 ? pricingData[0] : null;

            // Parse features if string
            let featuresData = v.features;
            if (typeof featuresData === 'string') {
              try { featuresData = JSON.parse(featuresData); } catch (e) { featuresData = { included: [], excluded: [] }; }
            }

            return {
              id: v.id,
              name: v.variant_name || v.name,
              price: firstPrice?.base_price || v.base_price || 0,
              billingPeriod: firstPrice?.billing_period || v.billing_period,
              features: featuresData || { included: [], excluded: [] }
            };
          });
          selectedVariant = variants.find(v => v.id === variantId) || null;
        }

        // Determine payment status from latest invoice
        // We look for any invoice that is pending payment
        let paymentStatus: 'pending' | 'paid' | undefined = undefined;
        let lastInvoiceId: string | undefined = undefined;
        let lastInvoiceNumber: string | undefined = undefined;
        let lastInvoiceTotal: number | undefined = undefined;

        if (quote.invoices && quote.invoices.length > 0) {
          // Sort invoices by date desc
          const invoices = quote.invoices.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          const latestInvoice = invoices[0];
          lastInvoiceId = latestInvoice.id;

          // If latest invoice is pending payment (or pending local)
          if (latestInvoice.payment_status === 'pending' || latestInvoice.payment_status === 'pending_local' || latestInvoice.status === 'draft') {
            paymentStatus = 'pending';
            // Construct formatted number
            const rawNum = latestInvoice.full_invoice_number || (latestInvoice.invoice_series && latestInvoice.invoice_number ? `${latestInvoice.invoice_series}-${latestInvoice.invoice_number}` : latestInvoice.invoice_number);
            lastInvoiceNumber = rawNum;
            lastInvoiceTotal = latestInvoice.total;
          } else if (latestInvoice.payment_status === 'paid') {
            paymentStatus = 'paid';
          }
        }

        return {
          id: quote.id,
          name: quote.title || 'Servicio sin título',
          description: this.getRecurrenceDescription(quote.recurrence_type, quote.recurrence_interval),
          price: quote.total_amount || 0,
          isRecurring: true,
          recurrenceType: quote.recurrence_type as 'monthly' | 'yearly',
          billingPeriod: this.getBillingPeriodLabel(quote.recurrence_type, quote.recurrence_interval),
          status: quote.status,
          startDate: quote.created_at,
          endDate: quote.recurrence_end_date || undefined,
          nextBillingDate: quote.next_run_at,
          serviceId: serviceId,
          variants: variants,
          selectedVariant: selectedVariant,
          paymentStatus: paymentStatus || 'none', // Add this field
          lastInvoiceId: lastInvoiceId,  // Add this field for direct payment link
          lastInvoiceNumber: lastInvoiceNumber,
          lastInvoiceTotal: lastInvoiceTotal
        };
      });

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
    const confirmed = await this.confirmModal.open({
      title: 'Dar de baja servicio',
      message: `¿Estás seguro de que deseas dar de baja el servicio "${service.name}"? Se mantendrá activo hasta el final del periodo actual.`,
      icon: 'fas fa-exclamation-triangle',
      iconColor: 'red',
      confirmText: 'Sí, dar de baja',
      cancelText: 'Cancelar'
    });

    if (!confirmed) {
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

      this.toastService.success('Baja procesada', 'El servicio ha sido dado de baja correctamente.');
      await this.loadContractedServices();
    } catch (error) {
      console.error('Error canceling subscription:', error);
      this.toastService.error('Error', 'No se pudo cancelar el servicio. Por favor, contacta con soporte.');
    }
  }

  async requestService(service: any) {
    const variantName = service.selectedVariant ? ` (${service.selectedVariant.name})` : '';
    const serviceName = `${service.name}${variantName}`;

    const comment = await this.promptModal.open({
      title: 'Solicitar Información',
      message: `¿Deseas añadir algún comentario sobre "${serviceName}"? Te contactaremos pronto.`,
      inputLabel: 'Comentario / Duda',
      inputPlaceholder: 'Escribe aquí tu duda o comentario...',
      multiline: true,
      confirmText: 'Enviar Solicitud',
      cancelText: 'Cancelar'
    });

    if (comment === null) return; // User cancelled

    console.log('Sending service request with comment:', comment);

    const { data, error } = await this.portalService.requestService(service.id, service.selectedVariant?.id, comment);
    if (error) {
      this.toastService.error('Error', 'No se pudo enviar la solicitud: ' + error.message);
    } else {
      // Show custom message from backend if available
      const message = data?.data?.message || 'Solicitud enviada correctamente. Te contactaremos pronto.';
      this.toastService.success('Solicitud enviada', message);
    }
  }

  async contractService(service: any, preferredPaymentMethod?: string, existingInvoiceId?: string) {
    const price = service.displayPrice;
    const variantName = service.selectedVariant ? ` (${service.selectedVariant.name})` : '';
    const serviceName = `${service.name}${variantName}`;

    // Only ask for confirmation if not coming from payment method selection
    if (!preferredPaymentMethod) {
      const confirmed = await this.confirmModal.open({
        title: 'Confirmar Contratación',
        message: `¿Contratar "${serviceName}" por ${price}€?`,
        icon: 'fas fa-shopping-cart',
        iconColor: 'green',
        confirmText: 'Contratar',
        cancelText: 'Cancelar',
        preventCloseOnBackdrop: true
      });

      if (!confirmed) return;
    }

    // Start the visual progress dialog
    this.contractDialog.startProcess(serviceName);

    try {
      // Call the backend with preferred payment method if provided
      // Pass existingInvoiceId to avoid duplicate creation
      const { data, error } = await this.portalService.contractService(
        service.id,
        service.selectedVariant?.id,
        preferredPaymentMethod,
        existingInvoiceId
      );

      if (error) {
        this.contractDialog.completeError('quote', error.message, 'Error al iniciar contratación. Por favor, contacta con nosotros.');
        return;
      }

      const responseData = data?.data || data;

      if (data?.success) {
        // Check if we need payment method selection (multiple providers available)
        // Note: requires_payment_selection is at the top level of the response, not inside data
        if (data?.requires_payment_selection) {
          // Close progress dialog temporarily
          this.contractDialog.visible.set(false);

          // Store service for later
          this.pendingContractService = service;
          this.pendingPaymentData = data;
          console.log('💳 Payment Selection Required. Data:', data);

          // Open payment method selector - data is inside data.data
          const paymentData = data?.data || {};
          console.log('💳 Opening Selector with:', paymentData);

          if (!paymentData.available_providers || paymentData.available_providers.length === 0) {
            console.warn('⚠️ No providers found but payment selection requested');
          }
          this.paymentSelector.open(
            paymentData.total || price,
            paymentData.invoice_number || '',
            paymentData.available_providers || [],
            service.isRecurring || false,
            service.billingPeriod || ''
          );
          return;
        }

        // Move through steps based on response
        if (responseData?.quote) {
          this.contractDialog.nextStep(); // Quote completed
        }

        // Check if invoice was created and store the ID
        if (responseData?.invoice_id) {
          this.lastCreatedInvoiceId = responseData.invoice_id;
          this.contractDialog.nextStep(); // Invoice completed
        } else if (!responseData?.fallback) {
          this.contractDialog.nextStep(); // Invoice completed
        }

        // Handle final result - check for multiple payment options first
        if (responseData?.payment_options_formatted && responseData.payment_options_formatted.length > 0) {
          // Close progress dialog
          this.contractDialog.close();

          // Store pending state for the selector callback
          this.pendingContractService = service;
          this.pendingPaymentData = responseData;

          // Open the unified Payment/Success Modal ("¡Listo!")
          const invNum = responseData.invoice_number;
          const invSeries = responseData.invoice_series;
          const fullInvNum = responseData.full_invoice_number;

          let invoiceNumber = fullInvNum || (invSeries && invNum ? `${invSeries}-${invNum}` : (invNum || ''));
          // If still empty/raw, and we have a fallback? No, just use what we have.

          const total = responseData.total || (service.displayPrice || service.price || 0);

          // Map providers to simple strings
          const rpcProviders = responseData.payment_options_formatted.map((p: any) => p.provider);

          // MERGE with Company Settings to ensure we show all enabled methods
          // The RPC might return only "cash" if it didn't generate links, but we want to allow Stripe/PayPal if enabled.
          const settings = this.settings();
          const storedIntegrations = settings?.payment_integrations || [];
          const enabledProviders = new Set<string>();

          // Add from settings first (Source of Truth for "What is allowed")
          if (Array.isArray(storedIntegrations)) {
            storedIntegrations.forEach((p: any) => {
              const provider = typeof p === 'string' ? p : p.provider;
              enabledProviders.add(provider);
            });
          }

          // Add from RPC (Source of Truth for "What is ready")
          rpcProviders.forEach((p: string) => enabledProviders.add(p));

          // Always ensure Cash is there if not explicitly removed by settings (safe default)
          // But actually, relies on settings is better. 
          // If RPC said CASH, we keep CASH.

          let finalProviders = Array.from(enabledProviders) as ('stripe' | 'paypal' | 'cash')[];

          // If empty (shouldn't happen if settings loaded), fallback to RPC result
          if (finalProviders.length === 0) finalProviders = rpcProviders;

          // Determine recurrence info
          // Check if variant has billing period or if service is recurring
          const variant = service.selectedVariant;
          const billingPeriod = variant?.billingPeriod || service.billingPeriod || '';
          const isRecurring = !!billingPeriod && billingPeriod !== 'one-time';

          this.paymentSelector.open(
            total,
            invoiceNumber,
            finalProviders,
            isRecurring,
            this.getBillingLabel(billingPeriod)
          );
        } else if (responseData?.payment_url) {
          // Single payment URL (legacy/fallback)
          this.contractDialog.completeSuccess({
            success: true,
            paymentUrl: responseData.payment_url,
            message: '¡Todo listo! Haz clic en el botón para completar el pago de forma segura.'
          });
        } else if (data?.fallback) {
          // Fallback case - no payment integration or error
          const message = responseData?.message || 'Tu solicitud ha sido procesada. Te contactaremos para completar el pago.';
          this.contractDialog.completeFallback(message);
        } else {
          // Success without payment URL - Invoice created in Draft/Pending state
          this.contractDialog.completeSuccess({
            success: true,
            message: 'Contratación realizada correctamente. Se ha generado una factura pendiente de pago. Por favor, accede a la sección de Facturas para finalizar el proceso.'
          });
        }
      } else {
        // RPC returned success: false
        console.error('❌ Contract RPC returned failure:', responseData);
        throw new Error(responseData?.error || 'No se pudo procesar la contratación.');
      }
    } catch (err: any) {
      console.error('❌ Error in contractService:', err);
      this.contractDialog.completeError('quote', err?.message || 'Error desconocido', 'Ha ocurrido un error inesperado. Por favor, contacta con nosotros.');
    }
  } // End of contractService method

  async onPaymentMethodSelected(selection: PaymentSelection) {
    if (!this.pendingContractService) return;

    const existingInvoiceId = this.pendingContractService.lastInvoiceId;

    if (selection.provider === 'cash') {
      this.lastCreatedInvoiceId = existingInvoiceId;
      await this.onLocalPaymentSelectedForContract();
    } else {
      // New Flow: Generate link on demand
      try {
        this.toastService.info('Procesando', `Generando enlace de pago para ${selection.provider}...`);

        const { data: responseData, error } = await this.portalService.contractService(
          this.pendingContractService.id,
          this.pendingContractService.selectedVariant?.id,
          selection.provider, // Pass specific provider
          existingInvoiceId
        );

        if (error) throw error;

        console.log('🔍 [DEBUG] Payment Link Generation Response:', responseData);

        // The Edge Function returns format: { success: true, data: { payment_url: '...', payment_options: [...] } }
        // We need to handle both potential flat return (if changed) and nested 'data' property.
        const resultData = responseData.data || responseData;

        // The backend should return the specific URL for this provider
        let url = '';

        // 1. Direct payment_url if checking for the requested provider (preferredPaymentMethod strategy)
        if (resultData.payment_provider === selection.provider && resultData.payment_url) {
          url = resultData.payment_url;
        }

        // 2. Look in payment_options array if available
        if (!url && resultData.payment_options) {
          const option = resultData.payment_options.find((o: any) => o.provider === selection.provider);
          if (option) url = option.url;
        }

        // 3. Fallback to old property names just in case
        if (!url) {
          if (selection.provider === 'stripe') url = resultData.stripe_payment_url || resultData.url;
          if (selection.provider === 'paypal') url = resultData.paypal_payment_url || resultData.url;
        }

        if (url) {
          window.open(url, '_blank');
        } else {
          console.error('❌ URL not found in response:', resultData);
          throw new Error('No se recibió la URL de pago');
        }

      } catch (err: any) {
        console.error('Error generating payment link:', err);
        this.toastService.error('Error', 'No se pudo generar el enlace de pago. Inténtalo de nuevo.');
      }
    }

    // Clear pending state is handled by component lifecycle or navigation usually, 
    // but here we might want to keep it if it failed? 
    // Let's clear on success redirect (browser will reload anyway) or handled by error toast.
  }

  async openPaymentForService(service: ContractedService) {
    if (!service.lastInvoiceId) {
      this.toastService.error('Error', 'No se encontró la factura pendiente. Por favor, ve a la sección de Facturas.');
      return;
    }

    try {
      // 1. Prepare data for selector immediately
      this.pendingContractService = service;
      this.pendingPaymentData = null; // No pre-fetched data anymore

      // Use local service data for display
      const invoiceNumber = service.lastInvoiceNumber || `Servicio: ${service.name}`;
      const total = service.lastInvoiceTotal || service.price;

      // 2. Get active integrations (Fast DB query)
      const { data: integrations } = await this.portalService.getPaymentIntegrations();

      const enabledProviders = new Set<string>();

      if (Array.isArray(integrations)) {
        integrations.forEach((p: any) => {
          if (p.provider && p.is_active) enabledProviders.add(p.provider);
        });
      }

      let providers = Array.from(enabledProviders) as ('stripe' | 'paypal' | 'cash')[];

      // Fallback
      if (providers.length === 0) providers = ['stripe']; // Default if nothing found, though query should work now

      // Always ensure Cash is an option unless we specifically wanted to exclude it
      if (!providers.includes('cash')) providers.push('cash');

      this.paymentSelector.open(
        total,
        invoiceNumber,
        providers,
        service.isRecurring,
        service.billingPeriod
      );
    } catch (err: any) {
      console.error('Error opening payment for service:', err);
      this.toastService.error('Error', 'No se pudo abrir la ventana de pago.');
    }
  }

  onPaymentSelectionCancelled() {
    // User cancelled payment selection - still have quote/invoice created
    if (this.pendingPaymentData) {
      this.toastService.info(
        'Pago pendiente',
        'Tu factura ha sido generada. Puedes completar el pago desde tu área de facturas.',
        8000
      );
    }

    this.pendingContractService = null;
    this.pendingPaymentData = null;
    this.loadContractedServices();
  }

  onContractDialogClosed() {
    // Refresh services list when dialog closes
    this.loadContractedServices();
  }

  async onLocalPaymentSelectedForContract() {
    // When local payment is selected during contract flow
    // Mark the invoice as pending_local
    if (this.lastCreatedInvoiceId) {
      try {
        await this.portalService.markInvoiceLocalPayment(this.lastCreatedInvoiceId);
        this.toastService.success(
          'Pago en local registrado',
          'La empresa será notificada. Coordina el pago directamente con ellos.',
          6000
        );
      } catch (err: any) {
        console.error('Error marking local payment:', err);
        // Still show a positive message since invoice was created
        this.toastService.info(
          'Servicio contratado',
          'Puedes coordinar el pago directamente con la empresa.',
          6000
        );
      }
    } else {
      this.toastService.info(
        'Pago en local seleccionado',
        'Coordina el pago directamente con la empresa.',
        6000
      );
    }
    this.lastCreatedInvoiceId = null;
    this.loadContractedServices();
  }

  async changeVariant(contractedService: ContractedService, newVariant: any) {
    if (contractedService.selectedVariant?.id === newVariant.id) return;
    if (contractedService.status !== 'accepted') {
      this.toastService.warning('No permitido', 'No puedes cambiar de plan en un servicio cancelado.');
      return;
    }

    const currentVariantName = contractedService.selectedVariant?.name || 'actual';
    const newPrice = newVariant.price;
    const priceDiff = newPrice - contractedService.price;
    const diffText = priceDiff > 0 ? `+${priceDiff.toFixed(2)}€` : `${priceDiff.toFixed(2)}€`;

    const confirmed = await this.confirmModal.open({
      title: 'Cambiar de plan',
      message: `¿Cambiar de "${currentVariantName}" a "${newVariant.name}"?\n\nNuevo precio: ${newPrice}€ (${diffText})\n\nEl cambio se aplicará en la próxima facturación.`,
      icon: 'fas fa-exchange-alt',
      iconColor: 'blue',
      confirmText: 'Sí, cambiar plan',
      cancelText: 'Cancelar'
    });

    if (!confirmed) {
      return;
    }

    try {
      const supabase = this.supabaseClient.instance;

      // Update the quote_items to reflect new variant
      const { error } = await supabase
        .from('quote_items')
        .update({
          variant_id: newVariant.id,
          unit_price: newVariant.price,
          description: `${contractedService.name} - ${newVariant.name}`,
          updated_at: new Date().toISOString()
        })
        .eq('quote_id', contractedService.id);

      if (error) throw error;

      // Recalculate quote totals
      const { data: items } = await supabase
        .from('quote_items')
        .select('subtotal, tax_amount, total')
        .eq('quote_id', contractedService.id);

      if (items && items.length > 0) {
        const subtotal = items.reduce((sum: number, item: any) => sum + (item.subtotal || 0), 0);
        const taxAmount = items.reduce((sum: number, item: any) => sum + (item.tax_amount || 0), 0);
        const total = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);

        await supabase
          .from('quotes')
          .update({
            subtotal,
            tax_amount: taxAmount,
            total_amount: total,
            updated_at: new Date().toISOString()
          })
          .eq('id', contractedService.id);
      }

      this.toastService.success('Plan actualizado', 'El nuevo precio se aplicará en la próxima facturación.');
      await this.loadContractedServices();
    } catch (error) {
      console.error('Error changing variant:', error);
      this.toastService.error('Error', 'No se pudo cambiar de plan. Por favor, contacta con soporte.');
    }
  }
} // End of PortalServicesComponent class

// Interfaces
export interface ContractedService {
  id: string;
  name: string;
  description?: string;
  price: number;
  status: 'accepted' | 'paused' | 'cancelled'; // 'accepted' is active
  paymentStatus: 'pending' | 'paid' | 'overdue' | 'none'; // derived from invoices
  recurrenceType: 'monthly' | 'yearly';
  nextBillingDate?: string;
  recurrenceEndDate?: string;
  billingPeriod?: string;
  isRecurring: boolean;
  variants?: ServiceVariant[];
  selectedVariant?: ServiceVariant;
  lastInvoiceId?: string;
  lastInvoiceNumber?: string;
  lastInvoiceTotal?: number;
  displayPrice?: number; // Calculated total including tax
}

interface ServiceVariant {
  id: string;
  name: string;
  price: number;
  description?: string;
  features?: any;
  billingPeriod?: string; // 'monthly' | 'yearly' | 'one-time'
}
