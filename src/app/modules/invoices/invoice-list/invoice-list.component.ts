import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { Invoice } from '../../../models/invoice.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
  <div class="p-4">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Facturación</h1>
      <div *ngIf="dispatcherHealth() as h" class="flex items-center gap-2">
        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              [ngClass]="h.pending > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'">
          <span class="w-2 h-2 rounded-full mr-1.5" [ngClass]="h.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'"></span>
          {{ h.pending > 0 ? (h.pending + ' eventos pendientes') : 'Dispatcher OK' }}
        </span>
        <button class="text-sm px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700" (click)="runDispatcher()">Ejecutar</button>
      </div>
    </div>
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200">Facturas</h2>
        <a class="text-sm text-blue-600 hover:underline" routerLink="/presupuestos">Ir a Presupuestos</a>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Número</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Cliente</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Fecha</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Total</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            @for (inv of invoices(); track inv.id) {
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td class="px-4 py-2 text-sm text-gray-800 dark:text-gray-200">{{ inv.full_invoice_number || (inv.invoice_series + '-' + inv.invoice_number) }}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ inv.client?.name || inv.client_id }}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ inv.invoice_date }}</td>
                <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">{{ inv.total | number:'1.2-2' }} {{ inv.currency || 'EUR' }}</td>
                <td class="px-4 py-2 text-right">
                  <a class="text-blue-600 hover:underline mr-3" [routerLink]="['/facturacion', inv.id]">Ver</a>
                  <button class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf(inv.id)">PDF</button>
                </td>
              </tr>
            }
            @empty {
              <tr>
                <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No hay facturas todavía.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  </div>
  `
})
export class InvoiceListComponent implements OnInit {
  private invoicesService = inject(SupabaseInvoicesService);
  invoices = signal<Invoice[]>([]);
  dispatcherHealth = signal<{ pending: number; lastEventAt: string | null; lastAcceptedAt: string | null; lastRejectedAt: string | null; } | null>(null);

  ngOnInit(): void {
    this.invoicesService.getInvoices().subscribe({
      next: (list) => this.invoices.set(list || []),
      error: (err) => console.error('Error loading invoices', err)
    });
    this.invoicesService.getDispatcherHealth().subscribe({
      next: (h) => this.dispatcherHealth.set(h),
      error: () => this.dispatcherHealth.set({ pending: 0, lastEventAt: null, lastAcceptedAt: null, lastRejectedAt: null })
    });
  }

  downloadPdf(invoiceId: string){
    this.invoicesService.getInvoicePdfUrl(invoiceId).subscribe({
      next: (signed) => window.open(signed, '_blank'),
      error: (e) => console.error('PDF error', e)
    });
  }

  runDispatcher(){
    this.invoicesService.runDispatcherNow().subscribe({
      next: () => this.invoicesService.getDispatcherHealth().subscribe(h => this.dispatcherHealth.set(h)),
      error: (e) => console.error('Dispatcher error', e)
    });
  }
}
