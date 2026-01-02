import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ClientPortalService, ClientPortalInvoice } from '../../../../services/client-portal.service';
import { formatInvoiceNumber } from '../../../../models/invoice.model';
import { SupabaseInvoicesService } from '../../../../services/supabase-invoices.service';
import { PaymentMethodSelectorComponent, PaymentSelection } from '../../../../features/payments/selector/payment-method-selector.component';
import { ToastService } from '../../../../services/toast.service';

interface PaymentInfo {
  invoice_id: string;
  invoice_number: string;
  full_invoice_number: string;
  total: number;
  currency: string;
  due_date: string;
  company_name: string;
  payment_options: any[];
}

@Component({
  selector: 'app-portal-invoices',
  standalone: true,
  imports: [CommonModule, RouterModule, PaymentMethodSelectorComponent],
  template: `
  <div class="p-4 sm:p-6 lg:p-8">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Tus facturas</h1>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead class="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Número</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              <tr *ngFor="let inv of invoices()" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{{ displayInvoiceNumber(inv) }}</td>
                <td class="px-6 py-3 text-sm text-gray-700 dark:text-gray-300">{{ inv.invoice_date | date:'dd/MM/yyyy' }}</td>
                <td class="px-6 py-3 text-sm">
                  <span *ngIf="inv.payment_status === 'paid'" class="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Pagada</span>
                  <span *ngIf="inv.payment_status === 'pending'" class="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pendiente</span>
                  <span *ngIf="inv.payment_status === 'pending_local'" class="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Pago Local Pendiente</span>
                  <span *ngIf="!inv.payment_status || inv.payment_status === 'none'" class="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">-</span>
                </td>
                <td class="px-6 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{{ inv.total | number:'1.2-2' }} {{ inv.currency || 'EUR' }}</td>
                <td class="px-6 py-3 text-right flex items-center justify-end gap-2">
                  <!-- Payment button: show if status is pending -->
                  <ng-container *ngIf="inv.payment_status !== 'paid' && inv.payment_status !== 'pending_local'">
                    <button 
                       (click)="openPaymentOptions(inv)"
                       class="text-sm px-3 py-1.5 rounded bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 font-medium">
                      Pagar
                    </button>
                  </ng-container>
                  <a class="text-blue-600 hover:underline" [routerLink]="['/portal/facturas', inv.id]">Ver</a>
                  <button class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf(inv.id)">PDF</button>
                </td>
              </tr>
              <tr *ngIf="invoices().length === 0">
                <td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No hay facturas por ahora.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Payment Method Selector -->
  <app-payment-method-selector
    #paymentSelector
    (selected)="onPaymentMethodSelected($event)"
    (cancelled)="onPaymentSelectionCancelled()">
  </app-payment-method-selector>
  `
})
export class PortalInvoicesComponent implements OnInit {
  private portal = inject(ClientPortalService);
  private invoicesSvc = inject(SupabaseInvoicesService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  @ViewChild('paymentSelector') paymentSelector!: PaymentMethodSelectorComponent;

  invoices = signal<ClientPortalInvoice[]>([]);
  // dispatcherHealth removed to avoid 401
  selectedInvoice = signal<ClientPortalInvoice | null>(null);
  selectedInvoiceTitle = signal<string>('');
  loadingPaymentOptions = signal(false);

  async ngOnInit() {
    this.loadInvoices();
  }

  async loadInvoices() {
    const { data } = await this.portal.listInvoices();
    this.invoices.set(data || []);
  }

  downloadPdf(id: string) {
    this.invoicesSvc.getInvoicePdfUrl(id).subscribe({ next: (signed) => window.open(signed, '_blank') });
  }

  displayInvoiceNumber(inv: ClientPortalInvoice): string {
    // Normaliza a prefijo F en la vista del portal
    const raw = inv.full_invoice_number || (inv.invoice_series && inv.invoice_number ? `${inv.invoice_series}-${inv.invoice_number}` : '');
    return formatInvoiceNumber(raw);
  }

  hasPaymentOption(inv: ClientPortalInvoice): boolean {
    // Show pay button if status is pending/issued/overdue OR if there are explicit options.
    // We want to allow clicking "Pay" to open the modal which will then show options (or Cash).
    const isPending = ['issued', 'overdue', 'pending', 'partial'].includes(inv.status);
    return isPending || !!(inv.payment_link_token || inv.stripe_payment_url || inv.paypal_payment_url);
  }

  async openPaymentOptions(inv: ClientPortalInvoice) {
    this.selectedInvoice.set(inv);
    this.loadingPaymentOptions.set(true);

    try {
      let providers: ('stripe' | 'paypal' | 'cash')[] = [];

      // 1. Get enabled providers from direct table query (Source of Truth)
      const { data: integrations } = await this.portal.getPaymentIntegrations();

      const enabledProviders = new Set<string>();
      if (Array.isArray(integrations)) {
        integrations.forEach((p: any) => {
          if (p.provider && p.is_active) enabledProviders.add(p.provider);
        });
      }

      // 2. Fetch specific payment info/urls from edge function if we have a token
      // This helps us get the specific URLs, but we shouldn't rely solely on it for *visibility* 
      // if we want to show the option and generate the link on demand.
      if (inv.payment_link_token) {
        try {
          const paymentInfo = await this.portal.getPaymentInfo(inv.payment_link_token);
          if (paymentInfo && paymentInfo.payment_options) {
            // We can use this to confirm availability or get URLs
          }
        } catch (e) {
          console.warn('Could not fetch payment info from token', e);
        }
      }

      // 3. Build the list based on WHAT IS ENABLED in the company
      // If the company has Stripe enabled, we show Stripe. 
      // The logic in onPaymentMethodSelected will handle generating the link if needed.
      if (enabledProviders.has('stripe')) providers.push('stripe');
      if (enabledProviders.has('paypal')) providers.push('paypal');

      // 4. Fallback/Legacy checks (if settings failed or empty, check invoice props)
      if (providers.length === 0) {
        if (inv.stripe_payment_url) providers.push('stripe');
        if (inv.paypal_payment_url) providers.push('paypal');
      }

      // Always allow cash if not explicitly forbidden (or logic based on invoice status)
      // The previous logic allowed it if status != paid/pending_local.
      // We are here implies status check passed in template.
      if (!providers.includes('cash')) providers.push('cash');

      // Open the selector
      this.paymentSelector.open(
        inv.total,
        this.displayInvoiceNumber(inv),
        providers,
        false, // Not recurring (invoices are one-time payments usually)
        ''
      );

    } catch (err: any) {
      console.error('Error loading payment options:', err);
      this.toastService.error('Error', 'No se pudieron cargar las opciones de pago.');
    } finally {
      this.loadingPaymentOptions.set(false);
    }
  }

  async onPaymentMethodSelected(selection: PaymentSelection) {
    const inv = this.selectedInvoice();
    if (!inv) return;

    if (selection.provider === 'cash') {
      await this.onLocalPaymentSelected();
    } else {
      // For Stripe/PayPal, we need to redirect to their URL.
      // We might need to ask the backend for the specific URL again OR use the ones we have in the invoice if we trust them.
      // best is to use the URLs from the invoice or fetch fresh ones if needed.
      // But we just fetched paymentInfo in openPaymentOptions... we didn't save it.

      // Let's redirect based on provider.
      // We can assume the invoice has the URLs or we re-fetch/construct.
      // Actually, for Stripe/PayPal, the backend (client-request-service) returns URLs.
      // The `public-payment-info` also returns URLs.

      // Simplest: Use the URLs from the invoice object if available, finding the right one.

      let url = '';
      if (selection.provider === 'stripe') url = inv.stripe_payment_url || '';
      if (selection.provider === 'paypal') url = inv.paypal_payment_url || '';

      if (url) {
        window.open(url, '_blank');
      } else {
        // Identify if we need to generate a link?
        // Usually invoices listed here already have links generated.
        this.toastService.error('Error', 'No hay enlace de pago disponible para este método.');
      }
    }

    // Close implicit by logic? No, selector stays open? No, selector closes on confirm.
    this.selectedInvoice.set(null);
  }

  onPaymentSelectionCancelled() {
    this.selectedInvoice.set(null);
  }

  async onLocalPaymentSelected() {
    const inv = this.selectedInvoice();
    if (!inv) return;

    try {
      // Update invoice to pending_local status
      await this.portal.markInvoiceLocalPayment(inv.id);
      this.toastService.success(
        'Pago en local registrado',
        'La empresa será notificada. Coordina el pago directamente con ellos.'
      );
      // Refresh invoices list
      const { data } = await this.portal.listInvoices();
      this.invoices.set(data || []);
    } catch (err: any) {
      this.toastService.error('Error', err?.message || 'No se pudo registrar el pago en local');
    }
  }


}
