/**
 * Client Portal — Listado de presupuestos recurrentes
 * ---------------------------------------------------
 * Muestra al cliente (autenticado en el portal) los presupuestos generados
 * automáticamente desde sus servicios contratados. Filtros: estado de pago
 * y recurrencia. Cada fila enlaza al detalle y muestra el botón "Pagar
 * ahora" si el presupuesto lo admite.
 *
 * Renders all the states a list page can be in: loading, error+retry,
 * empty (no budgets yet) and no-filter-results.
 */

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { BudgetPaymentService } from '../../../services/budget-payment.service';
import {
  RecurringBudget,
  RecurringBudgetStatus,
  RecurringBudgetPaymentStatus,
  deriveBudgetPaymentState,
  canPayRecurringBudget,
  PAYMENT_PROVIDER_LABELS,
  RECURRING_BUDGET_STATUS_LABELS,
} from '../../../models/recurring-budget.model';

type FilterPayment = 'all' | 'unpaid' | 'paid' | 'overdue';
type FilterRecurrence = 'all' | 'monthly' | 'weekly' | 'yearly';

@Component({
  selector: 'app-portal-budgets',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  template: `
    <section class="px-4 py-6 md:px-8 max-w-5xl mx-auto">
      <header class="mb-6">
        <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
          Mis presupuestos
        </h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Presupuestos generados automáticamente desde tus servicios contratados.
        </p>
      </header>

      <!-- Filters bar -->
      <div class="flex flex-col md:flex-row gap-3 mb-5">
        <div class="flex-1">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
            Estado de pago
          </label>
          <select
            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
            [value]="filterPayment()"
            (change)="onPaymentFilterChange($any($event.target).value)"
          >
            <option value="all">Todos</option>
            <option value="unpaid">Pendientes</option>
            <option value="overdue">Vencidos</option>
            <option value="paid">Cobrados</option>
          </select>
        </div>
        <div class="flex-1">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
            Periodicidad
          </label>
          <select
            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
            [value]="filterRecurrence()"
            (change)="onRecurrenceFilterChange($any($event.target).value)"
          >
            <option value="all">Todas</option>
            <option value="monthly">Mensual</option>
            <option value="weekly">Semanal</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
        <div class="flex-1">
          <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
            Buscar
          </label>
          <input
            type="search"
            class="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white"
            placeholder="Periodo, descripción…"
            [value]="search()"
            (input)="onSearchChange($any($event.target).value)"
          />
        </div>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="space-y-3" data-testid="loading-skeleton">
          @for (i of [0,1,2]; track i) {
            <div class="h-20 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse"></div>
          }
        </div>
      }

      <!-- Error -->
      @else if (error()) {
        <div
          class="rounded-xl border border-red-200 dark:border-red-900
                 bg-red-50 dark:bg-red-900/20 p-5 text-center"
        >
          <p class="text-sm text-red-700 dark:text-red-300">{{ error() }}</p>
          <button
            (click)="load()"
            class="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg
                   bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            <i class="fas fa-redo"></i> Reintentar
          </button>
        </div>
      }

      <!-- Empty -->
      @else if (budgets().length === 0) {
        <div
          class="rounded-xl border border-dashed border-gray-300 dark:border-slate-700
                 p-10 text-center"
        >
          <i class="fas fa-file-invoice-dollar text-4xl text-gray-300 dark:text-slate-600 mb-3"></i>
          <h2 class="text-lg font-semibold text-gray-700 dark:text-gray-200">
            Aún no tienes presupuestos
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Cuando se generen presupuestos desde tus servicios contratados aparecerán aquí.
          </p>
        </div>
      }

      <!-- Filtered to zero results -->
      @else if (filtered().length === 0) {
        <div
          class="rounded-xl border border-dashed border-gray-300 dark:border-slate-700
                 p-8 text-center"
        >
          <p class="text-sm text-gray-500 dark:text-gray-400">
            No hay presupuestos que coincidan con los filtros.
          </p>
          <button
            (click)="resetFilters()"
            class="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      }

      <!-- Cards (mobile) + table (desktop) -->
      @else {
        <!-- Mobile: cards -->
        <div class="md:hidden space-y-3" data-testid="budget-cards">
          @for (b of filtered(); track b.id) {
            <article
              class="rounded-xl border border-gray-200 dark:border-slate-700
                     bg-white dark:bg-slate-800 p-4 shadow-sm"
            >
              <header class="flex items-center justify-between mb-2">
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    {{ b.period }}
                  </h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ recurrenceLabel(b.recurrence_type) }}
                  </p>
                </div>
                <span [class]="badgeClass(deriveState(b).color)">
                  {{ deriveState(b).label }}
                </span>
              </header>
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-300">Total</span>
                <span class="font-semibold text-gray-900 dark:text-white">
                  {{ b.total | currency:(b.currency || 'EUR') }}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>Vence: {{ formatDate(b.due_date) }}</span>
              </div>
              <div class="mt-3 flex gap-2">
                <a
                  [routerLink]="['/portal/presupuestos', b.id]"
                  class="flex-1 text-center px-3 py-2 rounded-lg border border-gray-200
                         dark:border-slate-700 text-sm text-gray-700 dark:text-gray-200
                         hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Ver detalle
                </a>
                @if (canPay(b)) {
                  <button
                    (click)="onPayClick(b)"
                    class="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white
                           text-sm font-semibold hover:bg-emerald-700"
                  >
                    Pagar ahora
                  </button>
                }
              </div>
            </article>
          }
        </div>

        <!-- Desktop: table -->
        <div class="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-slate-800 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th class="text-left px-4 py-3">Periodo</th>
                <th class="text-left px-4 py-3">Recurrencia</th>
                <th class="text-right px-4 py-3">Total</th>
                <th class="text-left px-4 py-3">Vencimiento</th>
                <th class="text-left px-4 py-3">Estado</th>
                <th class="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (b of filtered(); track b.id) {
                <tr class="border-t border-gray-100 dark:border-slate-700 hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                  <td class="px-4 py-3 font-medium text-gray-900 dark:text-white">
                    {{ b.period }}
                  </td>
                  <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {{ recurrenceLabel(b.recurrence_type) }}
                  </td>
                  <td class="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                    {{ b.total | currency:(b.currency || 'EUR') }}
                  </td>
                  <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {{ formatDate(b.due_date) }}
                  </td>
                  <td class="px-4 py-3">
                    <span [class]="badgeClass(deriveState(b).color)">
                      {{ deriveState(b).label }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="inline-flex gap-2">
                      <a
                        [routerLink]="['/portal/presupuestos', b.id]"
                        class="px-3 py-1.5 rounded-lg border border-gray-200
                               dark:border-slate-700 text-xs text-gray-700 dark:text-gray-200
                               hover:bg-gray-50 dark:hover:bg-slate-700"
                      >
                        Ver detalle
                      </a>
                      @if (canPay(b)) {
                        <button
                          (click)="onPayClick(b)"
                          class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white
                                 text-xs font-semibold hover:bg-emerald-700"
                        >
                          Pagar ahora
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class PortalBudgetsComponent implements OnInit {
  private budgetService = inject(BudgetPaymentService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  error = signal<string | null>(null);
  budgets = signal<RecurringBudget[]>([]);

  filterPayment = signal<FilterPayment>('all');
  filterRecurrence = signal<FilterRecurrence>('all');
  search = signal<string>('');

  filtered = computed(() => {
    const all = this.budgets();
    const fp = this.filterPayment();
    const fr = this.filterRecurrence();
    const q = this.search().toLowerCase().trim();

    return all.filter((b) => {
      if (fr !== 'all' && b.recurrence_type !== fr) return false;
      if (fp !== 'all') {
        const state = deriveBudgetPaymentState(b).key;
        if (fp === 'overdue' && state !== 'overdue' && state !== 'unpaid') return false;
        if (fp !== 'overdue' && state !== fp) return false;
      }
      if (q && !`${b.period} ${b.notes ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  ngOnInit(): void {
    this.load();

    // Read filter from query params (so deep links work)
    this.route.queryParamMap.subscribe((p) => {
      const fp = p.get('payment') as FilterPayment | null;
      const fr = p.get('recurrence') as FilterRecurrence | null;
      if (fp && ['all', 'unpaid', 'paid', 'overdue'].includes(fp)) this.filterPayment.set(fp);
      if (fr && ['all', 'monthly', 'weekly', 'yearly'].includes(fr)) this.filterRecurrence.set(fr);
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.budgetService.listClientBudgets();
      this.budgets.set(data);
    } catch (e: any) {
      this.error.set(e?.message || 'No se pudieron cargar los presupuestos.');
    } finally {
      this.loading.set(false);
    }
  }

  onPaymentFilterChange(v: string): void {
    this.filterPayment.set(v as FilterPayment);
    this.syncQueryParams();
  }
  onRecurrenceFilterChange(v: string): void {
    this.filterRecurrence.set(v as FilterRecurrence);
    this.syncQueryParams();
  }
  onSearchChange(v: string): void {
    this.search.set(v);
  }

  resetFilters(): void {
    this.filterPayment.set('all');
    this.filterRecurrence.set('all');
    this.search.set('');
    this.syncQueryParams();
  }

  private syncQueryParams(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        payment: this.filterPayment() === 'all' ? null : this.filterPayment(),
        recurrence: this.filterRecurrence() === 'all' ? null : this.filterRecurrence(),
      },
      queryParamsHandling: 'merge',
    });
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  deriveState = deriveBudgetPaymentState;
  canPay = canPayRecurringBudget;

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  recurrenceLabel(r: string): string {
    switch (r) {
      case 'monthly': return 'Mensual';
      case 'weekly':  return 'Semanal';
      case 'yearly':  return 'Anual';
      default:        return r;
    }
  }

  badgeClass(color: 'green' | 'red' | 'amber' | 'blue' | 'gray'): string {
    const map: Record<string, string> = {
      green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      red:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      gray:  'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    };
    return `inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[color] || map['gray']}`;
  }

  /**
   * User clicked "Pagar ahora". Strategy: open the public payment page in a
   * new tab. That page is unauthenticated and self-contained — it shows all
   * available payment methods, handles the Stripe/PayPal redirect, and
   * displays the receipt download after success.
   */
  async onPayClick(b: RecurringBudget): Promise<void> {
    try {
      // Make sure we have a token (or mint one if none yet)
      const result = await this.budgetService.createPaymentLink(b.id, 'cash', 30);
      if (result.shareable_link) {
        window.open(result.shareable_link, '_blank', 'noopener');
      } else if (result.payment_url) {
        window.open(result.payment_url, '_blank', 'noopener');
      } else {
        this.error.set('No se pudo abrir la página de pago.');
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Error al abrir la página de pago.');
    }
  }
}
