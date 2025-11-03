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
    <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Facturación</h1>
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

  ngOnInit(): void {
    this.invoicesService.getInvoices().subscribe({
      next: (list) => this.invoices.set(list || []),
      error: (err) => console.error('Error loading invoices', err)
    });
  }

  downloadPdf(invoiceId: string){
    const url = `${environment.edgeFunctionsBaseUrl}/invoices-pdf?invoice_id=${invoiceId}&download=1`;
    window.open(url, '_blank');
  }
}
