import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PaymentMethod {
  provider: 'stripe' | 'paypal';
  name: string;
  icon: string;
  description: string;
  supportsInstallments?: boolean;
  installmentOptions?: { months: number; label: string }[];
}

export interface PaymentSelection {
  provider: 'stripe' | 'paypal';
  installments?: number;
}

@Component({
  selector: 'app-payment-method-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Modal Overlay -->
    <div *ngIf="visible()" 
         class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      
      <!-- Modal Container -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg transform transition-all animate-modal-appear">
        
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                {{ _isRecurring() ? '🔄 Configurar suscripción' : '💳 Selecciona método de pago' }}
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span *ngIf="_isRecurring()">
                  Suscripción: <span class="font-semibold text-gray-900 dark:text-white">{{ amount | currency:'EUR' }}</span>
                  <span class="text-orange-500 font-medium">/ {{ _billingPeriod() }}</span>
                </span>
                <span *ngIf="!_isRecurring()">
                  Total a pagar: <span class="font-semibold text-gray-900 dark:text-white">{{ amount | currency:'EUR' }}</span>
                </span>
              </p>
            </div>
            <button (click)="cancel()"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        <!-- Payment Methods -->
        <div class="p-6 space-y-4">
          <!-- Stripe Option -->
          <button *ngIf="hasStripe()"
                  (click)="selectMethod('stripe')"
                  class="w-full p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 group"
                  [ngClass]="{
                    'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20': selectedProvider() === 'stripe',
                    'border-gray-200 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-700': selectedProvider() !== 'stripe'
                  }">
            <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <i class="fab fa-stripe-s text-white text-2xl"></i>
            </div>
            <div class="flex-1 text-left">
              <p class="font-semibold text-gray-900 dark:text-white">Tarjeta de crédito/débito</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Visa, Mastercard, American Express</p>
            </div>
            <div *ngIf="selectedProvider() === 'stripe'" class="text-indigo-500">
              <i class="fas fa-check-circle text-xl"></i>
            </div>
          </button>

          <!-- PayPal Option -->
          <button *ngIf="hasPayPal()"
                  (click)="selectMethod('paypal')"
                  class="w-full p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 group"
                  [ngClass]="{
                    'border-blue-500 bg-blue-50 dark:bg-blue-900/20': selectedProvider() === 'paypal',
                    'border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-700': selectedProvider() !== 'paypal'
                  }">
            <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <i class="fab fa-paypal text-white text-2xl"></i>
            </div>
            <div class="flex-1 text-left">
              <p class="font-semibold text-gray-900 dark:text-white">PayPal</p>
              <p class="text-sm text-gray-500 dark:text-gray-400">Paga con tu cuenta PayPal</p>
            </div>
            <div *ngIf="selectedProvider() === 'paypal'" class="text-blue-500">
              <i class="fas fa-check-circle text-xl"></i>
            </div>
          </button>

          <!-- Installments Section (when Stripe selected and available) -->
          <div *ngIf="selectedProvider() === 'stripe' && showInstallments()" 
               class="mt-4 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <i class="fas fa-calendar-alt mr-2 text-indigo-500"></i>
              Opciones de pago
            </p>
            <div class="space-y-2">
              <button (click)="selectInstallments(1)"
                      class="w-full p-3 rounded-lg border transition-all text-left flex justify-between items-center"
                      [ngClass]="{
                        'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30': selectedInstallments() === 1,
                        'border-gray-200 dark:border-slate-600 hover:border-indigo-300': selectedInstallments() !== 1
                      }">
                <span class="text-gray-700 dark:text-gray-300">Pago único</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ amount | currency:'EUR' }}</span>
              </button>
              
              <!-- Future: Installment options from Stripe -->
              <!-- 
              <button *ngFor="let opt of installmentOptions"
                      (click)="selectInstallments(opt.months)"
                      class="w-full p-3 rounded-lg border transition-all text-left flex justify-between items-center"
                      [ngClass]="{
                        'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30': selectedInstallments() === opt.months,
                        'border-gray-200 dark:border-slate-600 hover:border-indigo-300': selectedInstallments() !== opt.months
                      }">
                <span class="text-gray-700 dark:text-gray-300">{{ opt.label }}</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ amount / opt.months | currency:'EUR' }}/mes</span>
              </button>
              -->
            </div>
          </div>
        </div>

        <!-- Recurring Service Info Banner -->
        <div *ngIf="_isRecurring()" class="mx-6 mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <div class="flex items-start gap-2">
            <i class="fas fa-info-circle text-orange-500 mt-0.5"></i>
            <div class="text-sm text-orange-700 dark:text-orange-300">
              <p class="font-medium">Suscripción recurrente</p>
              <p class="text-xs mt-1">Se te cobrará automáticamente cada {{ _billingPeriod() }}. Puedes cancelar en cualquier momento desde tu área de servicios.</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-b-2xl">
          <button (click)="confirmSelection()"
                  [disabled]="!selectedProvider()"
                  class="w-full py-3 px-4 rounded-xl font-semibold shadow-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  [ngClass]="{
                    'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white': selectedProvider() === 'stripe',
                    'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white': selectedProvider() === 'paypal',
                    'bg-gray-300 dark:bg-slate-600 text-gray-500': !selectedProvider()
                  }">
            <i class="fas fa-lock mr-1"></i>
            {{ _isRecurring() ? 'Iniciar suscripción' : 'Continuar al pago' }}
            <i class="fas fa-arrow-right text-sm"></i>
          </button>
          
          <p class="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">
            <i class="fas fa-shield-alt mr-1"></i>
            Pago 100% seguro y encriptado
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }
    
    @keyframes modal-appear {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .animate-modal-appear {
      animation: modal-appear 0.2s ease-out forwards;
    }
  `]
})
export class PaymentMethodSelectorComponent {
  @Input() amount = 0;
  @Input() invoiceNumber = '';
  @Input() availableProviders: ('stripe' | 'paypal')[] = [];
  @Input() isRecurring = false;
  @Input() billingPeriod = '';
  
  @Output() selected = new EventEmitter<PaymentSelection>();
  @Output() cancelled = new EventEmitter<void>();

  visible = signal(false);
  selectedProvider = signal<'stripe' | 'paypal' | null>(null);
  selectedInstallments = signal(1);
  _isRecurring = signal(false);
  _billingPeriod = signal('');


  hasStripe = computed(() => this.availableProviders.includes('stripe'));
  hasPayPal = computed(() => this.availableProviders.includes('paypal'));
  // Don't show installments for recurring services (doesn't make sense to pay monthly service in installments)
  showInstallments = computed(() => !this._isRecurring() && this.amount >= 50);

  open(amount: number, invoiceNumber: string, providers: ('stripe' | 'paypal')[], isRecurring = false, billingPeriod = '') {
    this.amount = amount;
    this.invoiceNumber = invoiceNumber;
    this.availableProviders = providers;
    this._isRecurring.set(isRecurring);
    this._billingPeriod.set(billingPeriod);
    
    // Auto-select if only one provider
    if (providers.length === 1) {
      this.selectedProvider.set(providers[0]);
    } else {
      this.selectedProvider.set(null);
    }
    
    this.selectedInstallments.set(1);
    this.visible.set(true);
  }

  selectMethod(provider: 'stripe' | 'paypal') {
    this.selectedProvider.set(provider);
    if (provider === 'paypal') {
      this.selectedInstallments.set(1); // PayPal doesn't support installments through our system
    }
  }

  selectInstallments(months: number) {
    this.selectedInstallments.set(months);
  }

  confirmSelection() {
    const provider = this.selectedProvider();
    if (provider) {
      this.selected.emit({
        provider,
        installments: this.selectedInstallments()
      });
      this.visible.set(false);
    }
  }

  cancel() {
    this.visible.set(false);
    this.cancelled.emit();
  }
}
