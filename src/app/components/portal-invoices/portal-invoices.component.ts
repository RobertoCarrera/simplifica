import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ClientPortalService, ClientPortalInvoice } from '../../services/client-portal.service';
import { formatInvoiceNumber } from '../../models/invoice.model';
import { SupabaseInvoicesService } from '../../services/supabase-invoices.service';
import { ContractProgressDialogComponent, PaymentOption } from '../contract-progress-dialog/contract-progress-dialog.component';
import { ToastService } from '../../services/toast.service';

interface PaymentInfo {
  invoice_id: string;
  invoice_number: string;
  full_invoice_number: string;
  total: number;
  currency: string;
  due_date: string;
  company_name: string;
  payment_options: PaymentOption[];
}

@Component({
  selector: 'app-portal-invoices',
  standalone: true,
  imports: [CommonModule, RouterModule, ContractProgressDialogComponent],
  template: `
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Tus facturas</h1>
        <div *ngIf="dispatcherHealth() as h" class="hidden sm:flex items-center gap-2">
          <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                [ngClass]="h.pending > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'">
            <span class="w-2 h-2 rounded-full mr-1.5" [ngClass]="h.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'"></span>
            {{ h.pending > 0 ? (h.pending + ' en proceso') : 'Envíos OK' }}
          </span>
        </div>
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
                    <button *ngIf="hasPaymentOption(inv)" 
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
  
  <!-- Payment Options Dialog (reusing contract progress dialog) -->
  <app-contract-progress-dialog
    #paymentDialog
    [serviceName]="selectedInvoiceTitle()"
    (localPaymentSelected)="onLocalPaymentSelected()"
    (closed)="onPaymentDialogClosed()">
  </app-contract-progress-dialog>
  `
})
export class PortalInvoicesComponent implements OnInit {
  private portal = inject(ClientPortalService);
  private invoicesSvc = inject(SupabaseInvoicesService);
  private router = inject(Router);
  private toastService = inject(ToastService);

  @ViewChild('paymentDialog') paymentDialog!: ContractProgressDialogComponent;

  invoices = signal<ClientPortalInvoice[]>([]);
  dispatcherHealth = signal<{ pending: number; lastEventAt: string | null; lastAcceptedAt: string | null; lastRejectedAt: string | null; } | null>(null);
  selectedInvoice = signal<ClientPortalInvoice | null>(null);
  selectedInvoiceTitle = signal<string>('');
  loadingPaymentOptions = signal(false);

  async ngOnInit() {
    const { data } = await this.portal.listInvoices();
    this.invoices.set(data || []);
    this.invoicesSvc.getDispatcherHealth().subscribe(h => this.dispatcherHealth.set(h));
  }

  downloadPdf(id: string){
    this.invoicesSvc.getInvoicePdfUrl(id).subscribe({ next: (signed) => window.open(signed, '_blank') });
  }

  displayInvoiceNumber(inv: ClientPortalInvoice): string {
    // Normaliza a prefijo F en la vista del portal
    const raw = inv.full_invoice_number || (inv.invoice_series && inv.invoice_number ? `${inv.invoice_series}-${inv.invoice_number}` : '');
    return formatInvoiceNumber(raw);
  }

  hasPaymentOption(inv: ClientPortalInvoice): boolean {
    // Show pay button if there's a payment token or payment URLs
    return !!(inv.payment_link_token || inv.stripe_payment_url || inv.paypal_payment_url);
  }

  async openPaymentOptions(inv: ClientPortalInvoice) {
    this.selectedInvoice.set(inv);
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

  onPaymentDialogClosed() {
    this.selectedInvoice.set(null);
  }
}
