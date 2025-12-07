import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

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

          <!-- Payment method -->
          <div class="mb-6">
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Método de pago:</p>
            <div class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
              <span class="text-2xl">{{ paymentInfo()!.payment.provider === 'paypal' ? '💳' : '💵' }}</span>
              <span class="font-medium text-gray-900 dark:text-gray-100">{{ paymentInfo()!.payment.provider === 'paypal' ? 'PayPal' : 'Stripe' }}</span>
            </div>
          </div>

          <!-- Pay button -->
          <button 
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

          <!-- Security note -->
          <p class="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Pago seguro procesado por {{ paymentInfo()!.payment.provider === 'paypal' ? 'PayPal' : 'Stripe' }}
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
}
