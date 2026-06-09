/**
 * Client Portal — Detalle de presupuesto recurrente
 * --------------------------------------------------
 * Muestra el desglose completo (líneas, subtotal, IVA, total), la
 * información de pago (link, expiración, estado, histórico de pagos) y
 * el botón "Pagar ahora" cuando aplica. Permite descargar el recibo en PDF
 * una vez cobrado.
 *
 * Renders all the states a detail page can be in: loading, error+retry,
 * not-found, plus the payment-action states (idle, paying, success, error).
 */

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { BudgetPaymentService } from '../../../../services/budget-payment.service';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import {
  RecurringBudget,
  RecurringBudgetPayment,
  RecurringBudgetPaymentStatus,
  canPayRecurringBudget,
  canDownloadReceipt,
  deriveBudgetPaymentState,
  PAYMENT_PROVIDER_LABELS,
} from '../../../../models/recurring-budget.model';

type ActionState = 'idle' | 'paying' | 'downloading' | 'error';

@Component({
  selector: 'app-portal-budget-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  template: `
    <section class="px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <nav class="text-xs text-gray-500 dark:text-gray-400 mb-4">
        <a routerLink="/portal/presupuestos" class="hover:underline">← Volver a presupuestos</a>
      </nav>

      <!-- Loading -->
      @if (loading()) {
        <div class="space-y-3" data-testid="loading-skeleton">
          <div class="h-8 w-1/2 rounded bg-gray-100 dark:bg-slate-800 animate-pulse"></div>
          <div class="h-32 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse"></div>
          <div class="h-20 rounded-xl bg-gray-100 dark:bg-slate-800 animate-pulse"></div>
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

      <!-- Not found -->
      @else if (!budget()) {
        <div
          class="rounded-xl border border-dashed border-gray-300 dark:border-slate-700
                 p-10 text-center"
        >
          <i class="fas fa-file-invoice-dollar text-4xl text-gray-300 dark:text-slate-600 mb-3"></i>
          <h2 class="text-lg font-semibold text-gray-700 dark:text-gray-200">
            Presupuesto no encontrado
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Es posible que haya sido cancelado o que el enlace haya caducado.
          </p>
          <a
            routerLink="/portal/presupuestos"
            class="mt-4 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Volver al listado
          </a>
        </div>
      }

      <!-- Detail -->
      @else {
        <article>
          <header class="mb-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                  Presupuesto {{ budget()!.period }}
                </h1>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {{ recurrenceLabel(budget()!.recurrence_type) }} ·
                  emitido {{ formatDate(budget()!.issue_date) }}
                </p>
              </div>
              <span [class]="badgeClass(state().color)">
                {{ state().label }}
              </span>
            </div>
          </header>

          <!-- Totals card -->
          <div
            class="rounded-xl border border-gray-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 p-5 mb-4"
          >
            <dl class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-gray-500 dark:text-gray-400 text-xs">Subtotal</dt>
                <dd class="font-semibold text-gray-900 dark:text-white">
                  {{ budget()!.subtotal | currency:(budget()!.currency || 'EUR') }}
                </dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400 text-xs">IVA ({{ budget()!.tax_rate }}%)</dt>
                <dd class="font-semibold text-gray-900 dark:text-white">
                  {{ budget()!.tax_amount | currency:(budget()!.currency || 'EUR') }}
                </dd>
              </div>
              <div class="col-span-2 pt-3 border-t border-gray-100 dark:border-slate-700">
                <dt class="text-gray-500 dark:text-gray-400 text-xs">Total</dt>
                <dd class="text-2xl font-bold text-gray-900 dark:text-white">
                  {{ budget()!.total | currency:(budget()!.currency || 'EUR') }}
                </dd>
              </div>
            </dl>
            <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
              @if (budget()!.payment_status === 'paid' && budget()!.paid_at) {
                <i class="fas fa-check-circle text-emerald-500"></i>
                Cobrado el {{ formatDateTime(budget()!.paid_at) }}
                @if (budget()!.payment_provider) {
                  · {{ providerLabel(budget()!.payment_provider) }}
                }
              } @else {
                Vence el {{ formatDate(budget()!.due_date) }}
              }
            </div>
          </div>

          <!-- Lines -->
          <div
            class="rounded-xl border border-gray-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 p-5 mb-4"
          >
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              Detalle
            </h2>
            <ul class="divide-y divide-gray-100 dark:divide-slate-700">
              @for (line of (budget()!.lines || []); track line.id) {
                <li class="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-900 dark:text-white truncate">
                      {{ line.description }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      {{ line.quantity }} ×
                      {{ line.unit_price | currency:(budget()!.currency || 'EUR') }}
                      <span *ngIf="line.tax_rate"> · IVA {{ line.tax_rate }}%</span>
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-semibold text-gray-900 dark:text-white">
                      {{ line.line_total | currency:(budget()!.currency || 'EUR') }}
                    </p>
                  </div>
                </li>
              }
            </ul>
          </div>

          <!-- Payment actions -->
          <div
            class="rounded-xl border border-gray-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 p-5 mb-4"
            data-testid="payment-actions"
          >
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              Pago
            </h2>

            @if (canPay(budget()!)) {
              <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">
                Para pagar este presupuesto, abre la página de pago segura.
                Podrás elegir entre tarjeta (Stripe), PayPal, transferencia
                bancaria o pago presencial.
              </p>
              <button
                (click)="onPayClick()"
                [disabled]="action() === 'paying'"
                class="w-full md:w-auto inline-flex items-center justify-center gap-2
                       px-5 py-3 rounded-lg bg-emerald-600 text-white font-semibold
                       hover:bg-emerald-700 disabled:opacity-50"
                data-testid="btn-pagar-ahora"
              >
                <i class="fas fa-lock"></i>
                {{ action() === 'paying' ? 'Abriendo…' : 'Pagar ahora' }}
              </button>
            } @else if (state().key === 'paid') {
              <p class="text-sm text-emerald-700 dark:text-emerald-300">
                <i class="fas fa-check-circle"></i> Este presupuesto ya está pagado.
              </p>
            } @else if (state().key === 'cancelled') {
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Este presupuesto fue cancelado.
              </p>
            } @else {
              <p class="text-sm text-gray-500 dark:text-gray-400">
                No hay acciones de pago disponibles para este presupuesto.
              </p>
            }

            @if (action() === 'error' && actionError()) {
              <p class="mt-2 text-sm text-red-600 dark:text-red-400">
                {{ actionError() }}
              </p>
            }
          </div>

          <!-- Payment history -->
          @if (payments().length > 0) {
            <div
              class="rounded-xl border border-gray-200 dark:border-slate-700
                     bg-white dark:bg-slate-800 p-5 mb-4"
            >
              <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                Histórico de pagos
              </h2>
              <ul class="divide-y divide-gray-100 dark:divide-slate-700">
                @for (p of payments(); track p.id) {
                  <li class="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p class="font-medium text-gray-900 dark:text-white">
                        {{ providerLabel(p.provider) }}
                        @if (p.provider_reference) {
                          <span class="text-xs text-gray-400 ml-1">
                            · {{ p.provider_reference }}
                          </span>
                        }
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ formatDateTime(p.paid_at) }}
                      </p>
                    </div>
                    <div class="text-right">
                      <p class="font-semibold text-gray-900 dark:text-white">
                        {{ p.amount | currency:(p.currency || budget()!.currency || 'EUR') }}
                      </p>
                      @if (p.status === 'succeeded') {
                        <p class="text-xs text-emerald-600 dark:text-emerald-400">Cobrado</p>
                      } @else if (p.status === 'refunded') {
                        <p class="text-xs text-gray-500">Devuelto</p>
                      } @else {
                        <p class="text-xs text-gray-500">{{ p.status }}</p>
                      }
                    </div>
                  </li>
                }
              </ul>

              @if (canDownloadReceipt(budget()!)) {
                <button
                  (click)="onDownloadReceipt()"
                  [disabled]="action() === 'downloading'"
                  class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg
                         bg-blue-600 text-white text-sm font-medium
                         hover:bg-blue-700 disabled:opacity-50"
                  data-testid="btn-descargar-recibo"
                >
                  <i class="fas fa-file-pdf"></i>
                  {{ action() === 'downloading' ? 'Generando…' : 'Descargar recibo (PDF)' }}
                </button>
              }
            </div>
          }
        </article>
      }
    </section>
  `,
})
export class PortalBudgetDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private budgetService = inject(BudgetPaymentService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  loading = signal(true);
  error = signal<string | null>(null);
  budget = signal<RecurringBudget | null>(null);
  payments = signal<RecurringBudgetPayment[]>([]);

  action = signal<ActionState>('idle');
  actionError = signal<string | null>(null);

  state = computed(() => {
    const b = this.budget();
    return b ? deriveBudgetPaymentState(b) : { key: 'unpaid' as const, label: '—', color: 'gray' as const };
  });

  ngOnInit(): void {
    this.route.params.subscribe((p) => {
      const id = p['id'];
      if (id) this.load(id);
    });
  }

  async load(id?: string): Promise<void> {
    const budgetId = id || this.route.snapshot.params['id'];
    if (!budgetId) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [budget, payments] = await Promise.all([
        this.budgetService.getBudget(budgetId),
        this.budgetService.loadPaymentHistory(budgetId).catch(() => []),
      ]);
      this.budget.set(budget);
      this.payments.set(payments);
    } catch (e: any) {
      this.error.set(e?.message || 'No se pudo cargar el presupuesto.');
    } finally {
      this.loading.set(false);
    }
  }

  async onPayClick(): Promise<void> {
    const b = this.budget();
    if (!b) return;
    this.action.set('paying');
    this.actionError.set(null);
    try {
      // Mint a payment link with cash as a placeholder — the public page
      // will let the user choose the actual method. The minting itself
      // is what we need to get a token.
      const result = await this.budgetService.createPaymentLink(b.id, 'cash', 30);
      const url = result.shareable_link || result.payment_url;
      if (!url) throw new Error('No se pudo generar el link de pago.');
      window.open(url, '_blank', 'noopener');
      this.action.set('idle');
    } catch (e: any) {
      this.action.set('error');
      this.actionError.set(e?.message || 'No se pudo abrir la página de pago.');
    }
  }

  async onDownloadReceipt(): Promise<void> {
    const b = this.budget();
    if (!b) return;
    this.action.set('downloading');
    this.actionError.set(null);
    try {
      const { url } = await this.budgetService.getReceiptDownloadUrl(b.id);
      window.open(url, '_blank', 'noopener');
      this.action.set('idle');
    } catch (e: any) {
      this.action.set('error');
      this.actionError.set(e?.message || 'No se pudo generar el recibo.');
    }
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  canPay = canPayRecurringBudget;
  canDownloadReceipt = canDownloadReceipt;

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch { return iso; }
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
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

  providerLabel(p: string | null | undefined): string {
    if (!p) return '—';
    return PAYMENT_PROVIDER_LABELS[p as keyof typeof PAYMENT_PROVIDER_LABELS] || p;
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
}
