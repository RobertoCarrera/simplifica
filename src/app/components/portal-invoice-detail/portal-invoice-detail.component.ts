import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientPortalService } from '../../services/client-portal.service';
import { SupabaseInvoicesService } from '../../services/supabase-invoices.service';

@Component({
  selector: 'app-portal-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
            Factura {{ inv.full_invoice_number || (inv.invoice_series + '-' + inv.invoice_number) }}
          </h1>
        </div>
        <div class="flex gap-3">
          <button class="px-6 py-3 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf()">Descargar PDF</button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Fecha</div>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ inv.invoice_date | date:'dd/MM/yyyy' }}</div>
        </div>
        <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Estado</div>
          <div class="text-base font-semibold text-gray-900 dark:text-gray-100 capitalize">{{ inv.status }}</div>
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
  `
})
export class PortalInvoiceDetailComponent implements OnInit {
  private portal = inject(ClientPortalService);
  private invoicesSvc = inject(SupabaseInvoicesService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  invoice = signal<any | null>(null);
  invoiceItems = signal<any[]>([]);
  invoiceTotal = signal<number>(0);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') as string;
    const { data } = await this.portal.getInvoice(id);
    this.invoice.set(data || null);
    this.invoiceItems.set(data?.items || []);
    this.invoiceTotal.set(Number(data?.total || 0));
  }

  downloadPdf(){
    const inv = this.invoice();
    if (!inv) return;
    this.invoicesSvc.getInvoicePdfUrl(inv.id).subscribe({ next: (signed) => window.open(signed, '_blank') });
  }
}
