import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientPortalService } from '../../services/client-portal.service';

@Component({
  selector: 'app-portal-quote-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="p-4 sm:p-6" *ngIf="!loading(); else loadingTpl">
      <ng-container *ngIf="quote(); else emptyTpl">
        <div class="mb-4 flex items-center justify-between">
          <h1 class="text-xl font-semibold text-gray-800 dark:text-gray-100">Presupuesto {{ quote()?.full_quote_number }}</h1>
          <a routerLink="/portal/presupuestos" class="text-blue-600 hover:underline">Volver</a>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div class="p-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div class="text-sm text-gray-500 dark:text-gray-400">Título</div>
            <div class="text-base text-gray-900 dark:text-gray-100">{{ quote()?.title }}</div>
          </div>
          <div class="p-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div class="text-sm text-gray-500 dark:text-gray-400">Estado</div>
            <div class="text-base"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" [ngClass]="statusClass(quote()?.status)">{{ statusLabel(quote()?.status) }}</span></div>
          </div>
          <div class="p-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div class="text-sm text-gray-500 dark:text-gray-400">Fecha</div>
            <div class="text-base text-gray-900 dark:text-gray-100">{{ quote()?.quote_date | date:'dd/MM/yyyy' }}</div>
          </div>
          <div class="p-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div class="text-sm text-gray-500 dark:text-gray-400">Válido hasta</div>
            <div class="text-base text-gray-900 dark:text-gray-100">{{ quote()?.valid_until | date:'dd/MM/yyyy' }}</div>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descripción</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cantidad</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Precio</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IVA</th>
                <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              <tr *ngFor="let it of quote()?.items || []">
                <td class="px-4 py-2 text-sm text-gray-800 dark:text-gray-200">{{ it.description }}</td>
                <td class="px-4 py-2 text-sm text-right text-gray-800 dark:text-gray-200">{{ it.quantity }}</td>
                <td class="px-4 py-2 text-sm text-right text-gray-800 dark:text-gray-200">{{ it.unit_price | number:'1.2-2' }} €</td>
                <td class="px-4 py-2 text-sm text-right text-gray-800 dark:text-gray-200">{{ it.tax_rate }}%</td>
                <td class="px-4 py-2 text-sm text-right text-gray-800 dark:text-gray-200">{{ it.total | number:'1.2-2' }} €</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex justify-end">
          <div class="text-lg font-semibold text-gray-900 dark:text-gray-100">Total: {{ quote()?.total_amount | number:'1.2-2' }} €</div>
        </div>
      </ng-container>
    </div>

    <ng-template #loadingTpl>
      <div class="p-6 text-gray-500 dark:text-gray-400">Cargando presupuesto…</div>
    </ng-template>

    <ng-template #emptyTpl>
      <div class="p-6 text-gray-500 dark:text-gray-400">Presupuesto no encontrado o sin acceso.</div>
    </ng-template>
  `,
})
export class PortalQuoteDetailComponent implements OnInit {
  private svc = inject(ClientPortalService);
  private route = inject(ActivatedRoute);

  quote = signal<any | null>(null);
  loading = signal<boolean>(true);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') as string;
    const { data } = await this.svc.getQuote(id);
    this.quote.set(data);
    this.loading.set(false);
  }

  statusLabel(status?: string | null): string {
    const labels: Record<string, string> = {
      draft: 'Borrador',
      sent: 'Enviado',
      viewed: 'Visto',
      accepted: 'Aceptado',
      rejected: 'Rechazado',
      expired: 'Expirado',
      invoiced: 'Facturado',
      cancelled: 'Cancelado'
    };
    return (status && labels[status]) || (status || '');
  }

  statusClass(status?: string | null): string {
    const base = 'text-xs';
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      viewed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
      accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      invoiced: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    };
    return `${base} ${status ? map[status] : map['draft']}`;
  }
}
