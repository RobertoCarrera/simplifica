import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientPortalService } from '../../../../services/client-portal.service';
import { formatInvoiceNumber } from '../../../../models/invoice.model';
import { SupabaseInvoicesService } from '../../../../services/supabase-invoices.service';
import { ContractProgressDialogComponent, PaymentOption } from '../../../../shared/components/contract-progress-dialog/contract-progress-dialog.component';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-portal-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ContractProgressDialogComponent],
  template: `
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8">
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
          <ng-container *ngIf="inv.payment_status !== 'paid' && hasPaymentOption(inv)">
            <button 
               (click)="openPaymentDialog(inv)"
               class="px-6 py-3 rounded-lg font-medium text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path>
              </svg>
              Pagar
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
      
      <div *ngIf="hasPaymentOption(inv) && inv.payment_status !== 'paid'" class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-3">
        <svg class="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span class="text-amber-700 dark:text-amber-300 font-medium">Pago pendiente - Selecciona "Pagar" para completar la transacción</span>
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
            <span *ngIf="inv.payment_status === 'pending_local'" class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Pago Local Pendiente</span>
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
  
  <!-- Payment Options Dialog -->
  <app-contract-progress-dialog
    #paymentDialog
    [serviceName]="selectedInvoiceTitle()"
    (closed)="onPaymentDialogClosed()"
    (paymentSelected)="onPaymentSelected($event)">
  </app-contract-progress-dialog>
  `
})
export class PortalInvoiceDetailComponent implements OnInit {
  @ViewChild('paymentDialog') paymentDialog!: ContractProgressDialogComponent;

  private portal = inject(ClientPortalService);
  private invoicesSvc = inject(SupabaseInvoicesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  invoice = signal<any | null>(null);
  invoiceItems = signal<any[]>([]);
  invoiceTotal = signal<number>(0);
  selectedInvoiceTitle = signal('');

  async ngOnInit() {
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

  hasPaymentOption(inv: any): boolean {
    return !!(inv.payment_link_token || inv.stripe_payment_url || inv.paypal_payment_url);
  }

  async openPaymentDialog(inv: any) {
    this.selectedInvoiceTitle.set(`Factura ${this.displayInvoiceNumber(inv)}`);

    // Show dialog with loading state
    this.paymentDialog.visible.set(true);
    this.paymentDialog.steps.set([
      { id: 'loading', label: 'Cargando opciones de pago', status: 'in-progress' }
    ]);
    this.paymentDialog.resultMessage.set('');
    this.paymentDialog.paymentOptions.set([]);

    try {
      // Call the public-payment-info edge function to get payment options
      const paymentInfo = await this.portal.getPaymentInfo(inv.payment_link_token || '');

      if (paymentInfo && paymentInfo.payment_options && paymentInfo.payment_options.length > 0) {
        // Build payment options with URLs from the invoice
        const options: PaymentOption[] = paymentInfo.payment_options.map((opt: any) => {
          let url: string | undefined;
          if (opt.provider === 'stripe' && inv.stripe_payment_url) {
            url = inv.stripe_payment_url;
          } else if (opt.provider === 'paypal' && inv.paypal_payment_url) {
            url = inv.paypal_payment_url;
          }
          return {
            ...opt,
            url
          };
        });

        this.paymentDialog.steps.set([
          { id: 'ready', label: 'Opciones de pago disponibles', status: 'completed' }
        ]);
        this.paymentDialog.completeSuccess({
          success: true,
          paymentOptions: options,
          message: 'Selecciona tu método de pago preferido:'
        });
      } else {
        // Fallback to direct URL if available
        const directUrl = inv.stripe_payment_url || inv.paypal_payment_url;
        if (directUrl) {
          this.paymentDialog.steps.set([
            { id: 'ready', label: 'Pago preparado', status: 'completed' }
          ]);
          this.paymentDialog.completeSuccess({
            success: true,
            paymentUrl: directUrl,
            message: 'Haz clic para completar el pago.'
          });
        } else {
          this.paymentDialog.completeError('loading', 'No hay opciones de pago disponibles', 'Contacta con la empresa para coordinar el pago.');
        }
      }
    } catch (err: any) {
      console.error('Error loading payment options:', err);
      // Fallback to direct URLs if available
      const directUrl = inv.stripe_payment_url || inv.paypal_payment_url;
      if (directUrl) {
        this.paymentDialog.steps.set([
          { id: 'ready', label: 'Pago preparado', status: 'completed' }
        ]);
        this.paymentDialog.completeSuccess({
          success: true,
          paymentUrl: directUrl,
          message: 'Haz clic para completar el pago.'
        });
      } else {
        this.paymentDialog.completeError('loading', 'Error al cargar opciones de pago', 'Por favor, intenta de nuevo más tarde.');
      }
    }
  }

  async onPaymentSelected(option: PaymentOption) {
    const inv = this.invoice();
    if (!inv) return;

    if (option.provider === 'local') {
      // Mark as local payment pending
      try {
        await this.portal.markInvoiceLocalPayment(inv.id);
        this.toast.success('Pago local seleccionado', 'Se ha registrado tu preferencia de pago. La empresa te contactará para coordinar el pago.');
        this.paymentDialog.visible.set(false);
        // Refresh invoice data
        const { data } = await this.portal.getInvoice(inv.id);
        this.invoice.set(data || null);
      } catch (err: any) {
        this.toast.error('Error', 'No se pudo registrar la opción de pago: ' + err.message);
      }
    } else if (option.url) {
      window.open(option.url, '_blank');
      this.paymentDialog.visible.set(false);
    }
  }

  onPaymentDialogClosed() {
    // Could refresh invoice status here
  }
}
