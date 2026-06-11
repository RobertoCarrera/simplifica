import { Component, EventEmitter, Output, signal, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export type PaymentMethodChoice = 'cash' | 'card' | 'bizum' | 'online';

export interface PaymentMethodSelection {
  method: PaymentMethodChoice;
  /** Optional human note (e.g. last 4 of card, bizum reference). */
  note?: string;
}

/**
 * Modal dialog for choosing a payment method when creating a booking
 * with "Crear y marcar como pagado". Lists the four methods the
 * business uses today: efectivo, tarjeta, bizum, online.
 *
 * The methods map directly to the public.payment_method enum values
 * (cash, card, bizum, online) — see the migration that added the
 * latter two. Selecting one emits a PaymentMethodSelection upward;
 * cancelling emits void so the parent can close without saving.
 *
 * Why a dedicated dialog: the event-form's footer is already dense
 * (Cancel / Crear) and adding 4 option buttons there would clutter
 * the UI. The dialog keeps the main flow fast (single click) while
 * offering the "mark as paid" path a deliberate confirmation step.
 */
@Component({
  selector: 'app-payment-method-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        (click)="onBackdropClick($event)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmd-title"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden"
          (click)="$event.stopPropagation()"
        >
          <div class="px-6 pt-6 pb-2">
            <h2
              id="pmd-title"
              class="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Método de pago
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Elige cómo se ha cobrado la reserva.
            </p>
          </div>

          <div class="px-4 py-3 space-y-2">
            @for (opt of options; track opt.value) {
              <button
                type="button"
                (click)="select(opt.value)"
                class="w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                <span
                  class="w-10 h-10 flex items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
                  [innerHTML]="opt.icon"
                ></span>
                <span class="flex-1">
                  <span class="block text-sm font-semibold text-gray-900 dark:text-white">
                    {{ opt.label }}
                  </span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    {{ opt.description }}
                  </span>
                </span>
                <i class="fas fa-chevron-right text-gray-400 text-sm"></i>
              </button>
            }
          </div>

          <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
            <button
              type="button"
              (click)="cancel()"
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
  `],
})
export class PaymentMethodDialogComponent {
  visible = signal(false);

  @Output() selected = new EventEmitter<PaymentMethodSelection>();
  @Output() cancelled = new EventEmitter<void>();

  readonly options: { value: PaymentMethodChoice; label: string; description: string; icon: string }[] = [
    {
      value: 'cash',
      label: 'Efectivo',
      description: 'Pago en metálico en el momento',
      icon: '<i class="fas fa-money-bill-wave text-lg"></i>',
    },
    {
      value: 'card',
      label: 'Tarjeta',
      description: 'Pago con tarjeta (TPV)',
      icon: '<i class="fas fa-credit-card text-lg"></i>',
    },
    {
      value: 'bizum',
      label: 'Bizum',
      description: 'Transferencia instantánea Bizum',
      icon: '<i class="fas fa-mobile-screen text-lg"></i>',
    },
    {
      value: 'online',
      label: 'Online',
      description: 'Cobrado por el portal o Stripe',
      icon: '<i class="fas fa-globe text-lg"></i>',
    },
  ];

  open(): void {
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }

  select(method: PaymentMethodChoice): void {
    this.selected.emit({ method });
    this.close();
  }

  cancel(): void {
    this.cancelled.emit();
    this.close();
  }

  onBackdropClick(event: MouseEvent): void {
    // Only close when the click is on the backdrop itself, not on the
    // dialog content (which calls stopPropagation above).
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) {
      this.cancel();
    }
  }
}
