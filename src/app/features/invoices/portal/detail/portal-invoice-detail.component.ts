import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientPortalService } from '../../../../services/client-portal.service';
import { formatInvoiceNumber } from '../../../../models/invoice.model';
import { SupabaseInvoicesService } from '../../../../services/supabase-invoices.service';
import { PaymentMethodSelectorComponent, PaymentSelection } from '../../../../features/payments/selector/payment-method-selector.component';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-portal-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, PaymentMethodSelectorComponent],
  template: `
  <div class="h-full p-4 sm:p-6 lg:p-8 transition-colors duration-200">
    <div class="max-w-5xl mx-auto" *ngIf="invoice() as inv; else loadingTpl">
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <a routerLink="/portal/facturas" class="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Volver a facturas
          </a>
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Factura {{ displayInvoiceNumber(inv) }}
          </h1>
        </div>
        <div class="flex gap-3">
          <!-- Payment Button - Show if not paid -->
          <ng-container *ngIf="inv.payment_status !== 'paid' && inv.payment_status !== 'pending_local'">
            <button 
               (click)="openPaymentSelector(inv)"
               class="px-6 py-3 rounded-lg font-medium text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
              </svg>
              Pagar ahora
            </button>
          </ng-container>
          <button class="px-6 py-3 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf()">Descargar PDF</button>
        </div>
      </div>

      <!-- Payment Status Banner -->
      <div *ngIf="inv.payment_status === 'paid'" class="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3">
        <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span class="text-green-700 dark:text-green-300 font-medium">Esta factura está pagada</span>
      </div>
      
      <div *ngIf="(inv.payment_status === 'pending' || inv.payment_status === null) && inv.status !== 'cancelled' && inv.status !== 'void'" class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
        <svg class="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span class="text-amber-700 dark:text-amber-300 font-medium">Pago pendiente - Selecciona "Pagar ahora" para completar la transacción</span>
      </div>

       <div *ngIf="inv.payment_status === 'pending_local'" class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-3">
        <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <div class="flex flex-col">
           <span class="text-blue-700 dark:text-blue-300 font-bold">Pago local solicitado</span>
           <span class="text-blue-600 dark:text-blue-400 text-sm">Has indicado que pagarás en efectivo o localmente. Pónte en contacto con la administración.</span>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Fecha</div>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ inv.invoice_date | date:'dd/MM/yyyy' }}</div>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Estado</div>
          <div class="flex items-center gap-2">
            <span class="text-base font-semibold text-gray-900 dark:text-gray-100 capitalize">{{ getStatusLabel(inv.status) }}</span>
            <span *ngIf="inv.payment_status === 'paid'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Pagada</span>
            <span *ngIf="inv.payment_status === 'pending'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pago Pendiente</span>
            <span *ngIf="inv.payment_status === 'pending_local'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Pago Local / Efectivo</span>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Conceptos</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead class="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cantidad</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Precio</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IVA</th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              <tr *ngFor="let it of invoiceItems()" class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                  <div class="font-medium">{{ it.description }}</div>
                </td>
                <td class="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{{ it.quantity }}</td>
                <td class="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{{ it.unit_price | number:'1.2-2' }} €</td>
                <td class="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{{ it.tax_rate }}%</td>
                <td class="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{{ it.total | number:'1.2-2' }} €</td>
              </tr>
              <tr *ngIf="invoiceItems().length === 0">
                <td colspan="5" class="px-6 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin conceptos.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Importe Total</div>
        <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">{{ invoiceTotal() | number:'1.2-2' }} €</div>
      </div>
    </div>
  </div>
  <ng-template #loadingTpl>
    <div class="p-8 text-center text-gray-600 dark:text-gray-400">Cargando...</div>
  </ng-template>
  
  <app-payment-method-selector #paymentSelector (selected)="onPaymentMethodSelected($event)"></app-payment-method-selector>
  `
})
export class PortalInvoiceDetailComponent implements OnInit {
  @ViewChild('paymentSelector') paymentSelector!: PaymentMethodSelectorComponent;

  private portal = inject(ClientPortalService);
  private invoicesSvc = inject(SupabaseInvoicesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  invoice = signal<any | null>(null);
  invoiceItems = signal<any[]>([]);
  invoiceTotal = signal<number>(0);

  async ngOnInit() {
    this.loadInvoice();
  }

  async loadInvoice() {
    const id = this.route.snapshot.paramMap.get('id') as string;
    const { data } = await this.portal.getInvoice(id);
    this.invoice.set(data || null);
    this.invoiceItems.set(data?.items || []);
    this.invoiceTotal.set(Number(data?.total || 0));
  }

  downloadPdf() {
    const inv = this.invoice();
    if (!inv) return;
    this.invoicesSvc.getInvoicePdfUrl(inv.id).subscribe({ next: (signed) => window.open(signed, '_blank') });
  }

  displayInvoiceNumber(inv: any): string {
    const raw = inv?.full_invoice_number || (inv?.invoice_series && inv?.invoice_number ? `${inv.invoice_series}-${inv.invoice_number}` : '');
    return formatInvoiceNumber(raw);
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      'draft': 'Borrador',
      'approved': 'Aprobada',
      'issued': 'Emitida',
      'sent': 'Enviada',
      'paid': 'Pagada',
      'partial': 'Parcial',
      'overdue': 'Vencida',
      'cancelled': 'Cancelada',
      'void': 'Anulada'
    };
    return map[status] || status;
  }

  async openPaymentSelector(inv: any) {
    try {
      // 1. Get enabled providers from direct table query (Source of Truth)
      const { data: integrations } = await this.portal.getPaymentIntegrations();

      const enabledProviders = new Set<string>();
      if (Array.isArray(integrations)) {
        integrations.forEach((p: any) => {
          if (p.provider && p.is_active) enabledProviders.add(p.provider);
        });
      }

      // Build the list based on WHAT IS ENABLED in the company
      let providers: ('stripe' | 'paypal' | 'cash')[] = [];
      if (enabledProviders.has('stripe')) providers.push('stripe');
      if (enabledProviders.has('paypal')) providers.push('paypal');


      // Always allow cash in detail view unless we want to hide it explicitly? 
      // For consistency with other views, we add it if not explicitly disabled.
      // But let's trust the set. If the set is empty (rare), we might need fallback.
      if (!providers.includes('cash')) providers.push('cash');

      // 2. Open selector
      this.paymentSelector.open(
        inv.total || 0,
        this.displayInvoiceNumber(inv),
        providers,
        false, // Is Recurring? Maybe check items? For paying an invoice, it's usually one-time charge even if subscription
        'one-time'
      );
    } catch (err) {
      console.error('Error opening payment selector:', err);
      this.toast.error('Error', 'No se pudieron cargar las opciones de pago.');
    }
  }

  async onPaymentMethodSelected(selection: PaymentSelection) {
    const inv = this.invoice();
    if (!inv) return;

    if (selection.provider === 'cash') {
      // Mark as pending local
      try {
        await this.portal.markInvoiceLocalPayment(inv.id);
        this.toast.success('Pago local registrado', 'Se ha notificado a la administración.');
        this.loadInvoice(); // Refresh status
      } catch (e: any) {
        this.toast.error('Error', 'No se pudo registrar el pago local: ' + e.message);
      }
    } else {
      // Online payment (Stripe/PayPal)
      try {
        // Use contractService to generate payment link for EXISTING invoice
        const { data, error } = await this.portal.contractService(
          null as any, // serviceId not needed
          null as any, // variantId not needed
          selection.provider,
          inv.id
        );

        if (error) throw error;

        // client-request-service returns { approvalUrl } for PayPal or { url } for Stripe
        // contractService wrapper returns { data: { payment_url: ... } } or similar structure?
        // Let's check ClientPortalService.contractService implementation again
        // It returns { data, error } from invoke.
        // The Edge Function returns { url } for Stripe and { approvalUrl } for PayPal.

        const res = data?.data || data; // handle unwrapping if needed
        const url = res?.payment_url || res?.url || res?.approvalUrl;

        if (url) {
          window.location.href = url; // or window.open
        } else {
          this.toast.error('Error', 'No se recibió la URL de pago.');
        }

      } catch (e: any) {
        this.toast.error('Error', 'Error al iniciar el pago: ' + e.message);
      }
    }
  }
}
