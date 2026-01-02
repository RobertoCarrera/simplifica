import { Component, Input, Output, EventEmitter, signal, computed, inject, Renderer2 } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';

export interface PaymentMethod {
  provider: 'stripe' | 'paypal' | 'cash';
  name: string;
  icon: string;
  description: string;
  supportsInstallments?: boolean;
  installmentOptions?: { months: number; label: string }[];
}

export interface PaymentSelection {
  provider: 'stripe' | 'paypal' | 'cash';
  installments?: number;
}

@Component({
  selector: 'app-payment-method-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Modal Overlay -->
    <div *ngIf="visible()" 
         class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-300">
      
      <!-- Modal Container -->
      <div class="bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md transform transition-all animate-modal-appear border border-slate-700 overflow-hidden text-center relative">
        
        <!-- Close Button -->
        <button (click)="cancel()" class="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10">
          <i class="fas fa-times text-lg"></i>
        </button>

        <!-- Header -->
        <div class="pt-8 pb-4 px-6 flex flex-col items-center">
            <div class="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-0 opacity-0 hidden"></div> <!-- keeping structure but hidden if needed -->
            
            <h3 class="text-2xl font-bold text-white flex items-center gap-2">
                <div class="w-7 h-7 bg-emerald-500 rounded flex items-center justify-center text-slate-900 text-sm">
                    <i class="fas fa-check"></i>
                </div>
                {{ title() }}
            </h3>
            <p *ngIf="displayInvoiceNumber()" class="text-gray-400 mt-1">Factura {{ displayInvoiceNumber() }}</p>
            <p *ngIf="!displayInvoiceNumber() && subtitle()" class="text-gray-400 mt-1">{{ subtitle() }}</p>

            <div *ngIf="isRecurring()" class="mt-2 text-sm text-gray-500">
              Suscripción: <span class="text-white font-bold">{{ amount | currency:'EUR' }}</span> / {{ billingPeriod() }}
            </div>
             <div *ngIf="!isRecurring()" class="mt-2 text-sm text-gray-500">
              Total: <span class="text-white font-bold">{{ amount | currency:'EUR' }}</span>
            </div>
        </div>

        <!-- Success/Info Banner -->
        <div class="px-6 mb-6">
            <div class="bg-slate-900/50 rounded-xl p-4 flex items-center gap-4 text-left border border-slate-700">
                <div class="w-10 h-10 rounded-full bg-emerald-900/40 text-emerald-500 flex-shrink-0 flex items-center justify-center">
                    <i class="fas fa-check"></i>
                </div>
                <div>
                     <p class="text-emerald-500 font-bold text-sm">Opciones de pago disponibles</p>
                </div>
            </div>
        </div>

        <div class="px-6 mb-4 text-left">
            <div class="bg-emerald-900/20 text-emerald-400 p-4 rounded-lg text-sm border border-emerald-900/50">
                Selecciona tu método de pago preferido:
            </div>
        </div>

        <!-- Payment Methods -->
        <div class="p-6 pt-0 space-y-3">
          
          <!-- Stripe Option (Purple) -->
          <button *ngIf="hasStripe()"
                  (click)="onSelect('stripe')"
                  class="w-full p-4 rounded-xl flex items-center justify-between group transition-all duration-300 shadow-lg hover:shadow-purple-500/20 border-0"
                  class="w-full p-4 rounded-xl flex items-center gap-4 group transition-all duration-300 shadow-lg hover:scale-[1.02] border-0 text-white relative overflow-hidden bg-gradient-to-r from-purple-600 to-indigo-700">
            
            <!-- Branding Icon/Logo -->
            <div class="z-10 flex items-center gap-2">
                <i class="fab fa-stripe text-3xl text-white"></i> 
            </div>
             
             <!-- Label -->
            <div class="z-10 font-bold text-lg flex-1 text-left pl-2">
                Pagar con Tarjeta (Stripe)
            </div>

            <!-- Arrow -->
            <div class="z-10">
                <i class="fas fa-arrow-right text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all"></i>
            </div>
          </button>

          <!-- PayPal Option (Blue) -->
           <button *ngIf="hasPayPal()"
                  (click)="onSelect('paypal')"
                  class="w-full p-4 rounded-xl flex items-center gap-4 group transition-all duration-300 shadow-lg hover:scale-[1.02] border-0 text-white relative overflow-hidden bg-blue-600 hover:bg-blue-500">
            
            <div class="z-10 flex items-center gap-2">
                 <i class="fab fa-paypal text-2xl text-white"></i>
            </div>
             
            <div class="z-10 font-bold text-lg flex-1 text-left pl-2">
                Pagar con PayPal
            </div>

            <div class="z-10">
                <i class="fas fa-arrow-right text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all"></i>
            </div>
          </button>

          <!-- Cash Option (Green) -->
          <button *ngIf="hasCash()"
                  (click)="onSelect('cash')"
                  class="w-full p-4 rounded-xl flex items-center gap-4 group transition-all duration-300 shadow-lg hover:scale-[1.02] border-0 text-white relative overflow-hidden bg-emerald-500 hover:bg-emerald-400">
            
            <div class="z-10 flex items-center gap-2">
                 <i class="fas fa-money-bill-wave text-2xl text-white"></i>
            </div>
             
            <div class="z-10 font-bold text-lg flex-1 text-left pl-2">
                Pagar en Local / Efectivo
            </div>

             <!-- No arrow for cash usually? Or keeping consistecy -->
             <div class="z-10 opacity-0"> <!-- spacer -->
                 <i class="fas fa-arrow-right"></i>
             </div>
          </button>
        </div>

        <div class="pb-6 px-6 text-xs text-slate-500">
            Selecciona tu método de pago preferido
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
  private renderer = inject(Renderer2);
  private document = inject(DOCUMENT);

  @Input() amount = 0;
  @Input() invoiceNumber = '';
  _availableProviders = signal<('stripe' | 'paypal' | 'cash')[]>([]);

  @Input()
  set availableProviders(value: ('stripe' | 'paypal' | 'cash')[]) {
    this._availableProviders.set(value);
  }

  @Output() selected = new EventEmitter<PaymentSelection>();
  @Output() cancelled = new EventEmitter<void>();

  visible = signal(false);
  isRecurring = signal(false);
  billingPeriod = signal('');
  title = signal('¡Listo!');
  subtitle = signal('');

  hasStripe = computed(() => this._availableProviders().includes('stripe'));
  hasPayPal = computed(() => this._availableProviders().includes('paypal'));
  hasCash = computed(() => this._availableProviders().includes('cash'));

  displayInvoiceNumber() {
    return this.invoiceNumber || '---';
  }

  open(amount: number, invoiceNumber: string, providers: ('stripe' | 'paypal' | 'cash')[], isRecurring = false, billingPeriod = '', titleOverride = '¡Listo!', subtitleOverride = '') {
    this.amount = amount;
    this.invoiceNumber = invoiceNumber;
    this._availableProviders.set(providers);
    this.isRecurring.set(isRecurring);
    this.billingPeriod.set(billingPeriod);
    this.title.set(titleOverride);
    this.subtitle.set(subtitleOverride);
    this.visible.set(true);
    this.renderer.addClass(this.document.body, 'overflow-hidden');
  }

  onSelect(provider: 'stripe' | 'paypal' | 'cash') {
    // If installments are needed for Stripe, we could show a secondary step or modal. 
    // For now, based on the UI requested (Click -> Pay), we emit immediately for simple flows, 
    // or we could keep the 2-step if complex config is needed.
    // The user's new UI looks like direct buttons.
    // Let's assume direct selection triggers the action for now to match the "clean" buttons.

    // However, if we need installments logic, we can add it later. 
    // The request said "UNIFICA... para que se vean algo parecdigo a lo que te adjunto".
    // The attachment shows big buttons "Pagar con ...".

    this.selected.emit({
      provider,
      installments: 1
    });
    this.close();
  }

  cancel() {
    this.cancelled.emit();
    this.close();
  }

  private close() {
    this.visible.set(false);
    this.renderer.removeClass(this.document.body, 'overflow-hidden');
  }
}
