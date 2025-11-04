import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ClientPortalService, ClientPortalInvoice } from '../../services/client-portal.service';
import { SupabaseInvoicesService } from '../../services/supabase-invoices.service';

@Component({
  selector: 'app-portal-invoices',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
              <tr *ngFor="let inv of invoices()" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-6 py-3 text-sm text-gray-900 dark:text-gray-100">{{ inv.full_invoice_number || (inv.invoice_series + '-' + inv.invoice_number) }}</td>
                <td class="px-6 py-3 text-sm text-gray-700 dark:text-gray-300">{{ inv.invoice_date | date:'dd/MM/yyyy' }}</td>
                <td class="px-6 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{{ inv.total | number:'1.2-2' }} {{ inv.currency || 'EUR' }}</td>
                <td class="px-6 py-3 text-right">
                  <a class="text-blue-600 hover:underline mr-3" [routerLink]="['/portal/facturas', inv.id]">Ver</a>
                  <button class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf(inv.id)">PDF</button>
                </td>
              </tr>
              <tr *ngIf="invoices().length === 0">
                <td colspan="4" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No hay facturas por ahora.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  `
})
export class PortalInvoicesComponent implements OnInit {
  private portal = inject(ClientPortalService);
  private invoicesSvc = inject(SupabaseInvoicesService);
  private router = inject(Router);

  invoices = signal<ClientPortalInvoice[]>([]);
  dispatcherHealth = signal<{ pending: number; lastEventAt: string | null; lastAcceptedAt: string | null; lastRejectedAt: string | null; } | null>(null);

  async ngOnInit() {
    const { data } = await this.portal.listInvoices();
    this.invoices.set(data || []);
    this.invoicesSvc.getDispatcherHealth().subscribe(h => this.dispatcherHealth.set(h));
  }

  downloadPdf(id: string){
    this.invoicesSvc.getInvoicePdfUrl(id).subscribe({ next: (signed) => window.open(signed, '_blank') });
  }
}
