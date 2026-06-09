/**
 * Public Budget Payment Page
 * --------------------------
 * Página de pago SIN autenticación. Solo necesita el token opaco del link
 * (enviado al cliente por email o al que llegó desde el botón "Pagar ahora").
 * Muestra la información del presupuesto, los métodos de pago disponibles y
 * la confirmación tras el retorno del provider (Stripe/PayPal).
 *
 * Estados: loading, error (token inválido/expirado), not-found, paid,
 * not-paid (selector de método), processing (tras click), success, cancelled.
 */

import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { BudgetPaymentService, PublicBudgetPaymentInfo } from '../../../../services/budget-payment.service';
import { PAYMENT_PROVIDER_LABELS } from '../../../../models/recurring-budget.model';
import { isTrustedPaymentUrl } from '../../../../shared/payment-url.utils';
import { environment } from '../../../../environments/environment';

type PageState =
  | 'loading'
  | 'error'
  | 'not-found'
  | 'paid'
  | 'expired'
  | 'select-method'
  | 'processing'
  | 'success'
  | 'cancelled';

type PaymentProvider = 'stripe' | 'paypal' | 'cash' | 'bank_transfer';

@Component({
  selector: 'app-public-budget-payment',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  template: `
    <main
      class="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200
             dark:from-gray-900 dark:to-gray-800
             flex items-center justify-center p-4"
    >
      <!-- Loading -->
      @if (state() === 'loading') {
        <div class="text-center" data-testid="public-loading">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p class="text-gray-600 dark:text-gray-400">Cargando información de pago…</p>
        </div>
      }

      <!-- Error / not-found / expired -->
      @else if (state() === 'error' || state() === 'not-found' || state() === 'expired') {
        <div
          class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-8 text-center"
        >
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <i class="fas fa-exclamation-triangle text-2xl text-red-600 dark:text-red-400"></i>
          </div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
            @if (state() === 'expired') { Link de pago expirado }
            @else if (state() === 'not-found') { Link no encontrado }
            @else { Error }
          </h1>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {{ errorMessage() || 'No hemos podido cargar la información del pago.' }}
          </p>
          <p class="mt-4 text-xs text-gray-400">
            Si crees que es un error, contacta con la empresa que te emitió el presupuesto.
          </p>
        </div>
      }

      <!-- Paid -->
      @else if (state() === 'paid' && info()) {
        <div
          class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-8 text-center"
          data-testid="public-paid"
        >
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <i class="fas fa-check text-2xl text-emerald-600 dark:text-emerald-400"></i>
          </div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-2">¡Pago confirmado!</h1>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            El presupuesto <strong>{{ info()!.budget.period }}</strong> está cobrado.
          </p>
          @if (info()!.receipt_url) {
            <a
              [href]="info()!.receipt_url"
              target="_blank"
              rel="noopener"
              class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg
                     bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              <i class="fas fa-file-pdf"></i> Descargar recibo
            </a>
          }
        </div>
      }

      <!-- Main: select payment method -->
      @else if (info()) {
        <div
          class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
        >
          <!-- Header -->
          <header class="p-6 border-b border-gray-100 dark:border-slate-700 flex items-center gap-3">
            @if (info()!.company.logo_url) {
              <img [src]="info()!.company.logo_url" alt="" class="h-10 w-10 rounded-full object-cover" />
            } @else {
              <div class="h-10 w-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
                {{ companyInitial() }}
              </div>
            }
            <div>
              <h1 class="text-base font-semibold text-gray-900 dark:text-white">
                {{ info()!.company.name }}
              </h1>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Pago de presupuesto
              </p>
            </div>
          </header>

          <!-- Amount -->
          <div class="px-6 py-5 text-center border-b border-gray-100 dark:border-slate-700">
            <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Periodo {{ info()!.budget.period }}
            </p>
            <p class="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
              {{ info()!.budget.total | currency:info()!.budget.currency }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Subtotal {{ info()!.budget.subtotal | currency:info()!.budget.currency }}
              · IVA {{ info()!.budget.tax_rate }}%
            </p>
          </div>

          <!-- Lines summary -->
          @if (info()!.lines.length > 0) {
            <details class="px-6 py-3 border-b border-gray-100 dark:border-slate-700">
              <summary class="text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:underline">
                Ver detalle ({{ info()!.lines.length }} líneas)
              </summary>
              <ul class="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">
                @for (line of info()!.lines; track line.id) {
                  <li class="flex justify-between">
                    <span>{{ line.description }}</span>
                    <span class="font-medium">
                      {{ line.line_total | currency:info()!.budget.currency }}
                    </span>
                  </li>
                }
              </ul>
            </details>
          }

          <!-- Payment options -->
          <div class="p-6 space-y-3">
            @if (state() === 'cancelled') {
              <div
                class="mb-3 rounded-lg border border-amber-200 dark:border-amber-900
                       bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300"
              >
                Has cancelado el pago. Puedes elegir otro método a continuación.
              </div>
            }

            @for (opt of info()!.payment_options; track opt.provider) {
              @if (opt.available) {
                <button
                  (click)="onSelectProvider(opt.provider)"
                  [disabled]="state() === 'processing'"
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                         text-white font-semibold transition disabled:opacity-50"
                  [class]="opt.buttonClass"
                  [attr.data-testid]="'btn-pay-' + opt.provider"
                >
                  <i [class]="opt.icon" class="text-lg w-5"></i>
                  <span class="flex-1 text-left">{{ opt.label }}</span>
                  @if (state() === 'processing' && processingProvider() === opt.provider) {
                    <i class="fas fa-spinner fa-spin"></i>
                  } @else {
                    <i class="fas fa-chevron-right text-sm opacity-70"></i>
                  }
                </button>
              } @else if (opt.reason) {
                <div
                  class="w-full flex items-center gap-3 px-4 py-3 rounded-xl
                         bg-gray-100 dark:bg-slate-700 text-gray-400 text-sm"
                >
                  <i [class]="opt.icon" class="text-lg w-5 opacity-50"></i>
                  <span class="flex-1 text-left">{{ opt.label }}</span>
                  <span class="text-xs">{{ opt.reason }}</span>
                </div>
              }
            }
          </div>

          <!-- Footer -->
          <footer class="px-6 py-3 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-100 dark:border-slate-700 text-center">
            <p class="text-xs text-gray-400">
              Pago seguro · {{ info()!.company.name }}
            </p>
          </footer>
        </div>
      }
    </main>
  `,
})
export class PublicBudgetPaymentComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private budgetService = inject(BudgetPaymentService);
  private platformId = inject(PLATFORM_ID);

  state = signal<PageState>('loading');
  errorMessage = signal<string | null>(null);
  info = signal<PublicBudgetPaymentInfo | null>(null);
  processingProvider = signal<PaymentProvider | null>(null);

  companyInitial = computed(() => {
    const name = this.info()?.company?.name || '?';
    return name.trim().charAt(0).toUpperCase();
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      // SSR: just wait
      return;
    }

    const token = this.route.snapshot.paramMap.get('token');
    const status = this.route.snapshot.queryParamMap.get('status');
    const provider = this.route.snapshot.queryParamMap.get('provider');

    if (!token) {
      this.state.set('not-found');
      this.errorMessage.set('Falta el token de pago.');
      return;
    }

    if (status === 'cancelled') {
      this.state.set('cancelled');
    } else if (status === 'success') {
      this.state.set('success');
    }

    this.load(token);
  }

  async load(token: string): Promise<void> {
    this.state.set('loading');
    this.errorMessage.set(null);
    try {
      const info = await this.budgetService.getPublicPaymentInfo(token);
      this.info.set(info);
      if (info.budget.is_paid) {
        this.state.set('paid');
      } else if (info.budget.is_expired) {
        this.state.set('expired');
        this.errorMessage.set('El link de pago ha caducado. Solicita uno nuevo a la empresa.');
      } else {
        this.state.set(this.state() === 'cancelled' ? 'cancelled' : 'select-method');
      }
    } catch (e: any) {
      this.errorMessage.set(e?.message || 'No se pudo cargar la información del pago.');
      this.state.set(e?.message?.includes('no encontrado') ? 'not-found' : 'error');
    }
  }

  async onSelectProvider(provider: PaymentProvider): Promise<void> {
    const info = this.info();
    if (!info) return;

    this.processingProvider.set(provider);
    this.state.set('processing');
    this.errorMessage.set(null);

    try {
      const token = this.route.snapshot.paramMap.get('token') || '';

      if (provider === 'stripe' || provider === 'paypal') {
        // Ask the public-budget-payment-redirect endpoint for a fresh
        // payment URL. It mints a Stripe checkout session or a PayPal
        // order and returns the URL we should redirect to.
        const res = await fetch(`${this.fnBase()}/public-budget-payment-redirect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({ token, provider }),
        });
        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.errorMessage.set(json?.error || 'No se pudo iniciar el pago.');
          this.state.set('select-method');
          this.processingProvider.set(null);
          return;
        }
        const url = json?.payment_url as string | undefined;
        if (!url || !isTrustedPaymentUrl(url)) {
          this.errorMessage.set('URL de pago no válida.');
          this.state.set('select-method');
          this.processingProvider.set(null);
          return;
        }
        window.location.href = url;
        return;
      }

      if (provider === 'bank_transfer' || provider === 'cash') {
        // The public-budget-payment-redirect returns a friendly message
        // for these (no external URL). We just display it.
        const res = await fetch(`${this.fnBase()}/public-budget-payment-redirect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({ token, provider }),
        });
        const json: any = await res.json().catch(() => ({}));
        this.errorMessage.set(
          json?.message
          || (provider === 'cash'
            ? 'Para pagar en efectivo, acércate a la empresa. Una vez recibido, se confirmará el pago desde el panel.'
            : 'Para pagar por transferencia, contacta con la empresa para obtener los datos bancarios. Una vez recibida, se confirmará el pago desde el panel.'),
        );
        this.state.set('select-method');
        this.processingProvider.set(null);
        return;
      }
    } catch (e: any) {
      this.errorMessage.set(e?.message || 'Error al procesar el pago.');
      this.state.set('select-method');
      this.processingProvider.set(null);
    }
  }

  /**
   * Returns the edge functions base URL. The page is unauthenticated so
   * we use the configured edgeFunctionsBaseUrl (which points at the
   * Supabase project, not the Angular dev server).
   */
  private fnBase(): string {
    return (environment as any).edgeFunctionsBaseUrl
      || (environment as any).supabaseFunctionsUrl
      || `${(environment as any).supabase?.url}/functions/v1`;
  }
}
