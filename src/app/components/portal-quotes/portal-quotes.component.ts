import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { ClientPortalService, ClientPortalQuote } from '../../services/client-portal.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-portal-quotes',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="p-4 sm:p-6">
      <h1 class="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Presupuestos</h1>

      <!-- Loading state -->
      <div *ngIf="loading()" class="text-gray-500 dark:text-gray-400">Cargando presupuestos…</div>

      <!-- Error state -->
      <div *ngIf="error()" class="p-3 rounded border border-red-300 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-900/20 dark:text-red-200">
        {{ error() }}
      </div>

      <!-- Empty state -->
      <div *ngIf="!loading() && !error() && quotes().length === 0" class="p-4 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
        No tienes presupuestos disponibles todavía.
      </div>

      <!-- Quotes table -->
      <div *ngIf="!loading() && !error() && quotes().length > 0" class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Número</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Título</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Válido hasta</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            <tr *ngFor="let q of quotes()" class="hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer" [routerLink]="['/portal/presupuestos', q.id]">
              <td class="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{{ displayQuoteNumber(q) }}</td>
              <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ q.title }}</td>
              <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ q.quote_date | date:'dd/MM/yyyy' }}</td>
              <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ q.valid_until | date:'dd/MM/yyyy' }}</td>
              <td class="px-4 py-2 text-sm">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                      [ngClass]="statusClass(q.status)">
                  {{ statusLabel(q.status) }}
                </span>
              </td>
              <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">{{ q.total_amount | number:'1.2-2' }} €</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class PortalQuotesComponent implements OnInit, OnDestroy {
  private svc = inject(ClientPortalService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  quotes = signal<ClientPortalQuote[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  subscription: RealtimeChannel | null = null;

  async ngOnInit() {
    this.loading.set(true);
    const { data, error } = await this.svc.listQuotes();
    if (error) {
      this.error.set(error.message || 'Error al cargar presupuestos');
    } else {
      this.quotes.set(data);
    }
    this.loading.set(false);
    
    // Handle optional ?open=<id> to navigate directly
    const openId = this.route.snapshot.queryParamMap.get('open');
    if (openId && (this.quotes() || []).some(q => q.id === openId)) {
      // Navigate to detail route without reloading
      this.router.navigate(['/portal/presupuestos', openId]);
    }

    // Setup Realtime
    this.subscription = await this.svc.subscribeToClientQuotes((payload) => {
      if (payload.eventType === 'INSERT') {
        // Add new quote to the list
        // Ensure it matches ClientPortalQuote interface
        const newQuote = payload.new as ClientPortalQuote;
        this.quotes.update(list => [newQuote, ...list]);
      } else if (payload.eventType === 'UPDATE') {
        // Update existing quote
        this.quotes.update(list => list.map(q => q.id === payload.new.id ? { ...q, ...payload.new } : q));
      }
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  displayQuoteNumber(q: ClientPortalQuote): string {
    return q.full_quote_number || '';
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Borrador',
      pending: 'Pendiente',
      sent: 'Enviado',
      viewed: 'Visto',
      accepted: 'Aceptado',
      rejected: 'Rechazado',
      expired: 'Expirado',
      invoiced: 'Facturado',
      cancelled: 'Cancelado'
    };
    return labels[status] || status;
  }

  statusClass(status: string): string {
    const base = 'text-xs';
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      viewed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
      accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      invoiced: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    };
    return `${base} ${map[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`;
  }
}
