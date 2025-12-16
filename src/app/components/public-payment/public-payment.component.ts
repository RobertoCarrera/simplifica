import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

interface PaymentOption {
  provider: string;
  label: string;
  icon: string;
  iconClass: string;
  buttonClass: string;
  available: boolean;
}

interface PaymentInfo {
  invoice: {
    id: string;
    invoice_number: string;
    full_invoice_number?: string;
    total: number;
    currency: string;
    due_date: string;
    payment_status: string;
  };
  company: {
    name: string;
    logo_url?: string;
  };
  client: {
    name: string;
    email?: string;
  };
  payment: {
    provider: string;
    payment_url: string;
    expires_at: string;
    is_expired: boolean;
  };
  payment_options?: PaymentOption[];
}

@Component({
  selector: 'app-public-payment',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <!-- Loading state -->
      <div *ngIf="loading()" class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">Cargando información de pago...</p>
      </div>

      <!-- Error state -->
      <div *ngIf="error()" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div class="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Enlace no válido</h2>
        <p class="text-gray-600 dark:text-gray-400">{{ error() }}</p>
      </div>

      <!-- Already paid state -->
      <div *ngIf="paymentInfo() && paymentInfo()!.invoice.payment_status === 'paid'" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div class="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Factura pagada</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-4">Esta factura ya ha sido pagada. ¡Gracias!</p>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          Factura: {{ paymentInfo()!.invoice.full_invoice_number || paymentInfo()!.invoice.invoice_number }}
        </div>
      </div>

      <!-- Expired state -->
      <div *ngIf="paymentInfo() && paymentInfo()!.payment.is_expired && paymentInfo()!.invoice.payment_status !== 'paid'" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <div class="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Enlace expirado</h2>
        <p class="text-gray-600 dark:text-gray-400 mb-4">Este enlace de pago ha expirado. Por favor, contacta con {{ paymentInfo()!.company.name }} para solicitar un nuevo enlace.</p>
      </div>

      <!-- Payment form -->
      <div *ngIf="paymentInfo() && !paymentInfo()!.payment.is_expired && paymentInfo()!.invoice.payment_status !== 'paid'" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden max-w-md w-full">
        <!-- Header with company info -->
        <div class="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <div class="flex items-center gap-4">
            <img *ngIf="paymentInfo()!.company.logo_url" [src]="paymentInfo()!.company.logo_url" alt="Logo" class="w-12 h-12 rounded-lg bg-white/10 object-contain" />
            <div *ngIf="!paymentInfo()!.company.logo_url" class="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center text-xl font-bold">
              {{ paymentInfo()!.company.name.charAt(0) }}
            </div>
            <div>
              <h1 class="text-xl font-semibold">{{ paymentInfo()!.company.name }}</h1>
              <p class="text-purple-200 text-sm">Pago de factura</p>
            </div>
          </div>
        </div>

        <!-- Invoice details -->
        <div class="p-6">
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Detalles de la factura</h2>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Factura:</span>
                <span class="text-gray-900 dark:text-gray-100 font-medium">{{ paymentInfo()!.invoice.full_invoice_number || paymentInfo()!.invoice.invoice_number }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Cliente:</span>
                <span class="text-gray-900 dark:text-gray-100">{{ paymentInfo()!.client.name }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Vencimiento:</span>
                <span class="text-gray-900 dark:text-gray-100">{{ paymentInfo()!.invoice.due_date | date:'shortDate' }}</span>
              </div>
            </div>
          </div>

          <!-- Total amount -->
          <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
            <div class="text-center">
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Total a pagar</p>
              <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {{ paymentInfo()!.invoice.total | number:'1.2-2' }} {{ paymentInfo()!.invoice.currency }}
              </p>
            </div>
          </div>

          <!-- Payment methods -->
          <div class="mb-6">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Selecciona tu método de pago:</p>
            
            <!-- Multiple payment options -->
            <div *ngIf="hasMultiplePaymentOptions()" class="space-y-3">
              <button *ngFor="let option of paymentInfo()!.payment_options"
                (click)="selectPaymentMethod(option.provider)"
                [disabled]="redirecting()"
                class="w-full py-3 px-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                [ngClass]="option.buttonClass">
                <i [class]="option.icon + ' text-xl ' + option.iconClass"></i>
                {{ option.label }}
                <svg *ngIf="redirecting() && selectedProvider() === option.provider" class="animate-spin h-5 w-5 ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </button>
            </div>

            <!-- Single payment option (legacy) -->
            <div *ngIf="!hasMultiplePaymentOptions()" class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg mb-4">
              <span class="text-2xl">{{ paymentInfo()!.payment.provider === 'paypal' ? '💳' : '💵' }}</span>
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ paymentInfo()!.payment.provider === 'paypal' ? 'PayPal' : 'Stripe' }}</span>
            </div>
            
            <!-- Pay button (legacy single provider) -->
            <button 
              *ngIf="!hasMultiplePaymentOptions()"
              (click)="proceedToPayment()"
              [disabled]="redirecting()"
              class="w-full py-3 px-4 rounded-lg font-semibold text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              [class.bg-blue-600]="paymentInfo()!.payment.provider === 'paypal'"
              [class.hover:bg-blue-700]="paymentInfo()!.payment.provider === 'paypal' && !redirecting()"
              [class.bg-purple-600]="paymentInfo()!.payment.provider === 'stripe'"
              [class.hover:bg-purple-700]="paymentInfo()!.payment.provider === 'stripe' && !redirecting()">
              <svg *ngIf="redirecting()" class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{ redirecting() ? 'Redirigiendo...' : 'Pagar ahora' }}
            </button>
          </div>

          <!-- Local payment confirmation message -->
          <div *ngIf="localPaymentSelected()" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
            <div class="w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="font-semibold text-green-800 dark:text-green-200 mb-1">¡Pago en local seleccionado!</h3>
            <p class="text-sm text-green-700 dark:text-green-300">
              {{ paymentInfo()!.company.name }} ha sido notificado. Te contactarán para coordinar el pago.
            </p>
          </div>

          <!-- Security note -->
          <p class="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Pago seguro
          </p>

          <!-- Link expiration -->
          <p class="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
            Enlace válido hasta {{ paymentInfo()!.payment.expires_at | date:'short' }}
          </p>
        </div>
      </div>
    </div>
  `
})
export class PublicPaymentComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private fnBase = (environment.edgeFunctionsBaseUrl || '').replace(/\/+$/, '');

  loading = signal(true);
  error = signal<string | null>(null);
  paymentInfo = signal<PaymentInfo | null>(null);
  redirecting = signal(false);
  selectedProvider = signal<string | null>(null);
  localPaymentSelected = signal(false);

  hasMultiplePaymentOptions = computed(() => {
    const info = this.paymentInfo();
    return info?.payment_options && info.payment_options.length > 0;
  });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Enlace de pago no válido');
      this.loading.set(false);
      return;
    }

    this.loadPaymentInfo(token);
  }

  async loadPaymentInfo(token: string) {
    try {
      const res = await fetch(`${this.fnBase}/public-payment-info?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        headers: {
          'apikey': environment.supabase.anonKey,
        }
      });

      const json = await res.json();

      if (!res.ok) {
        this.error.set(json?.error || 'No se pudo cargar la información de pago');
        return;
      }

      this.paymentInfo.set(json);
    } catch (e: any) {
      console.error('Error loading payment info', e);
      this.error.set('Error de conexión. Por favor, inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async proceedToPayment() {
    const info = this.paymentInfo();
    if (!info) return;

    this.redirecting.set(true);

    try {
      // Call the redirect endpoint to get fresh payment URL
      const res = await fetch(`${this.fnBase}/public-payment-redirect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': environment.supabase.anonKey,
        },
        body: JSON.stringify({
          token: this.route.snapshot.paramMap.get('token')
        })
      });

      const json = await res.json();

      if (!res.ok) {
        this.error.set(json?.error || 'Error al procesar el pago');
        this.redirecting.set(false);
        return;
      }

      // Redirect to payment provider
      window.location.href = json.payment_url;
    } catch (e: any) {
      console.error('Error redirecting to payment', e);
      this.error.set('Error de conexión. Por favor, inténtalo de nuevo.');
      this.redirecting.set(false);
    }
  }

  async selectPaymentMethod(provider: string) {
    const info = this.paymentInfo();
    if (!info) return;

    this.selectedProvider.set(provider);

    // Handle local payment separately
    if (provider === 'local') {
      this.redirecting.set(true);
      try {
        // Call backend to mark invoice as pending local payment
        const res = await fetch(`${this.fnBase}/public-payment-redirect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': environment.supabase.anonKey,
          },
          body: JSON.stringify({
            token: this.route.snapshot.paramMap.get('token'),
            provider: 'local'
          })
        });

        const json = await res.json();

        if (!res.ok) {
          this.error.set(json?.error || 'Error al procesar la solicitud');
          this.redirecting.set(false);
          return;
        }

        // Show success message instead of redirecting
        this.localPaymentSelected.set(true);
        this.redirecting.set(false);
      } catch (e: any) {
        console.error('Error processing local payment selection', e);
        this.error.set('Error de conexión. Por favor, inténtalo de nuevo.');
        this.redirecting.set(false);
      }
      return;
    }

    // For online payment providers
    this.redirecting.set(true);
    try {
      const res = await fetch(`${this.fnBase}/public-payment-redirect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': environment.supabase.anonKey,
        },
        body: JSON.stringify({
          token: this.route.snapshot.paramMap.get('token'),
          provider: provider
        })
      });

      const json = await res.json();

      if (!res.ok) {
        this.error.set(json?.error || 'Error al procesar el pago');
        this.redirecting.set(false);
        return;
      }

      // Redirect to payment provider
      window.location.href = json.payment_url;
    } catch (e: any) {
      console.error('Error redirecting to payment', e);
      this.error.set('Error de conexión. Por favor, inténtalo de nuevo.');
      this.redirecting.set(false);
    }
  }
}
