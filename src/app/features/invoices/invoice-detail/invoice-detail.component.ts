import { Component, OnInit, inject, signal, computed, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import {
  PaymentIntegrationsService,
  PaymentIntegration,
} from '../../../services/payment-integrations.service';
import { ToastService } from '../../../services/toast.service';
import { Invoice, formatInvoiceNumber, InvoiceStatus } from '../../../models/invoice.model';
import { environment } from '../../../../environments/environment';
import { IssueVerifactuButtonComponent } from '../issue-verifactu-button/issue-verifactu-button.component';
import { VerifactuBadgeComponent } from '../verifactu-badge/verifactu-badge.component';
import { firstValueFrom } from 'rxjs';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';
import { ViewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    IssueVerifactuButtonComponent,
    VerifactuBadgeComponent,
    ConfirmModalComponent,
    TranslocoPipe,
  ],
  template: `
    @if (invoice(); as inv) {
      <app-confirm-modal #confirmModal></app-confirm-modal>
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h1
            class="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-3"
          >
            {{ 'invoices.factura' | transloco }} {{ formatNumber(inv) }}
            @if (inv && isVerifactuEnabled()) {
              <app-verifactu-badge [invoice]="inv"></app-verifactu-badge>
            }
          </h1>
          <div class="flex items-center gap-3">
            <!-- Dispatcher health pill -->
            <!-- <span *ngIf="dispatcherHealth() as h"
          class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
          [ngClass]="h.pending > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'">
          <span class="w-2 h-2 rounded-full mr-1.5"
          [ngClass]="h.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'"></span>
          {{ h.pending > 0 ? (h.pending + ' pendientes') : 'Dispatcher OK' }}
        </span> -->
            <a
              class="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              routerLink="/facturacion"
              >{{ 'invoices.volver' | transloco }}</a
            >
            <button
              class="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
              (click)="downloadPdf(inv.id)"
            >
              {{ 'invoices.descargarPdf' | transloco }}
            </button>
            @if (canCancel(inv)) {
              <button
                class="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700"
                (click)="cancelInvoice(inv.id)"
              >
                {{ 'invoices.anular' | transloco }}
              </button>
            }
            @if (canRectify(inv)) {
              <button
                class="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                (click)="rectify(inv.id)"
              >
                {{ 'invoices.rectificar' | transloco }}
              </button>
            }
            @if (canMarkAsPaid(inv)) {
              <button
                class="px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 flex items-center gap-1.5"
                (click)="markAsPaid(inv)"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {{ 'invoices.marcarPagada' | transloco }}
              </button>
            }
            @if (canSendEmail()) {
              <button
                class="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                [disabled]="sendingEmail()"
                (click)="sendEmail(inv.id)"
              >
                {{ sendingEmail() ? ('invoices.enviando' | transloco) : ('invoices.enviarEmail' | transloco) }}
              </button>
            }
            <!-- Send Payment Link Button -->
            @if (canSendPaymentLink(inv)) {
              <button
                class="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 flex items-center gap-1.5"
                [disabled]="generatingPaymentLink()"
                (click)="openPaymentLinkModal()"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                {{ generatingPaymentLink() ? ('invoices.generando' | transloco) : ('invoices.enlacePago' | transloco) }}
              </button>
            }
            <!-- Hide button if sending/pending or accepted - Only show if Verifactu module is enabled -->
            @if (
              isVerifactuEnabled() &&
              (inv.status === 'draft' || inv.status === 'approved') &&
              verifactuMeta()?.status !== 'accepted' &&
              verifactuMeta()?.status !== 'sending' &&
              verifactuMeta()?.status !== 'pending'
            ) {
              <app-issue-verifactu-button [invoiceId]="inv.id" (issued)="onIssued()">
              </app-issue-verifactu-button>
            }
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4"
          >
            <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">{{ 'invoices.datos' | transloco }}</h2>
            <p class="text-sm text-gray-600 dark:text-gray-300">{{ 'invoices.fecha' | transloco }}: {{ inv.invoice_date }}</p>
            <p class="text-sm text-gray-600 dark:text-gray-300">{{ 'invoices.vencimiento' | transloco }}: {{ inv.due_date }}</p>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ 'invoices.estado' | transloco }}: {{ getStatusLabel(inv.status) }}
            </p>
          </div>
          <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4"
          >
            <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">{{ 'invoices.importes' | transloco }}</h2>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ 'invoices.baseImponible' | transloco }} {{ inv.subtotal | number: '1.2-2' }} {{ inv.currency }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ 'invoices.iva' | transloco }} {{ inv.tax_amount | number: '1.2-2' }} {{ inv.currency }}
            </p>
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ pricesIncludeTax() ? ('invoices.importe' | transloco) : ('invoices.total' | transloco) }}:
              {{ getDisplayAmount(inv) | number: '1.2-2' }} {{ inv.currency }}
            </p>
          </div>
          <!-- VeriFactu Status - Only visible if Verifactu module is enabled -->
          @if (isVerifactuEnabled()) {
            <div
              class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 md:col-span-2"
            >
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200">
                  {{ 'invoices.estadoVerifactu' | transloco }}
                </h2>
                <div class="flex gap-2 items-center">
                  <!-- Info badge for auto-dispatch -->
                  @if (
                    verifactuMeta()?.status === 'pending' || verifactuMeta()?.status === 'sending'
                  ) {
                    <div
                      class="flex items-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded border border-amber-200 dark:border-amber-800"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{{ 'invoices.envioAutomatico' | transloco }}</span>
                    </div>
                  }
                </div>
              </div>
              @if (verifactuMeta(); as meta) {
                <div>
                  <div class="flex items-center gap-3 mb-3">
                    <span class="text-sm text-gray-600 dark:text-gray-300">{{ 'invoices.serieNumero' | transloco }}</span>
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100"
                      >{{ meta.series }}-{{ meta.number }}</span
                    >
                    <span
                      class="ml-auto inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                      [ngClass]="statusChipClass(meta.status)"
                      >{{ getStatusLabel(meta.status) }}</span
                    >
                  </div>
                  <div class="flex flex-wrap items-center gap-4 mb-3">
                    <div class="text-sm text-gray-700 dark:text-gray-300">
                      {{ 'invoices.intentos' | transloco }}
                      <span class="font-medium text-gray-900 dark:text-gray-100">{{
                        attemptsDisplay()
                      }}</span>
                    </div>
                    <div class="text-sm text-gray-700 dark:text-gray-300">
                      {{ 'invoices.proximoIntento' | transloco }}
                      <span class="font-medium text-gray-900 dark:text-gray-100">{{
                        nextRetryDisplay()
                      }}</span>
                    </div>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <!-- Hidden Hash ID as requested -->
                    <!-- <div>
                <div class="text-xs text-gray-500 dark:text-gray-400">Hash</div>
                <div class="text-sm text-gray-800 dark:text-gray-200 truncate">{{ meta.chained_hash }}</div>
              </div> -->
                    <div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">{{ 'invoices.emitida' | transloco }}</div>
                      <div class="text-sm text-gray-800 dark:text-gray-200">
                        {{ meta.issue_time | date: 'short' }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">{{ 'invoices.creada' | transloco }}</div>
                      <div class="text-sm text-gray-800 dark:text-gray-200">
                        {{ meta.created_at | date: 'short' }}
                      </div>
                    </div>
                  </div>
                  <div class="mt-4">
                    <div class="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                      {{ 'invoices.ultimosEventos' | transloco }}
                    </div>
                    <div
                      class="overflow-hidden rounded border border-gray-200 dark:border-gray-700"
                    >
                      <table class="min-w-full text-sm">
                        <thead
                          class="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300"
                        >
                          <tr>
                            <th class="text-left px-3 py-2 font-medium">{{ 'invoices.fecha' | transloco }}</th>
                            <th class="text-left px-3 py-2 font-medium">{{ 'invoices.tipo' | transloco }}</th>
                            <th class="text-left px-3 py-2 font-medium">{{ 'invoices.estadoCol' | transloco }}</th>
                            <th class="text-left px-3 py-2 font-medium">{{ 'invoices.intentosCol' | transloco }}</th>
                            <th class="text-left px-3 py-2 font-medium">{{ 'invoices.errorCol' | transloco }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (ev of verifactuEvents(); track ev.id) {
                            <tr class="border-t border-gray-100 dark:border-gray-700/60">
                              <td class="px-3 py-2 text-gray-800 dark:text-gray-200">
                                {{ ev.created_at | date: 'short' }}
                              </td>
                              <td class="px-3 py-2 text-gray-800 dark:text-gray-200">
                                {{ ev.event_type }}
                              </td>
                              <td class="px-3 py-2">
                                <span
                                  class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                  [ngClass]="statusChipClass(ev.status)"
                                  >{{ getStatusLabel(ev.status) }}</span
                                >
                              </td>
                              <td class="px-3 py-2 text-gray-800 dark:text-gray-200">
                                {{ (ev.attempts || 0) + 1 }}
                              </td>
                              <td
                                class="px-3 py-2 text-gray-600 dark:text-gray-300 truncate max-w-[24ch]"
                              >
                                {{ ev.last_error || '-' }}
                              </td>
                            </tr>
                          } @empty {
                            <tr>
                              <td colspan="5" class="px-3 py-3 text-gray-500 dark:text-gray-400">
                                {{ 'invoices.sinEventos' | transloco }}
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              } @else {
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  {{ 'invoices.noHayMetadatos' | transloco }}
                </p>
              }
            </div>
          }
        </div>
      </div>
    }

    <!-- Payment Link Modal -->
    @if (showPaymentLinkModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/50" (click)="closePaymentLinkModal()"></div>
        <div
          class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        >
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {{ 'invoices.enviarEnlacePago' | transloco }}
          </h3>
          <!-- No integrations warning -->
          @if (availableProviders().length === 0) {
            <div class="text-center py-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-12 w-12 mx-auto text-amber-500 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p class="text-gray-700 dark:text-gray-300 mb-2">
                {{ 'invoices.noHayPasarelas' | transloco }}
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {{ 'invoices.configurarPasarelas' | transloco }}
              </p>
              <button
                class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                (click)="closePaymentLinkModal()"
              >
                {{ 'invoices.cerrar' | transloco }}
              </button>
            </div>
          }
          <!-- Provider selection -->
          @if (availableProviders().length > 0 && !generatedPaymentLink()) {
            <div>
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >{{ 'invoices.seleccionarPasarela' | transloco }}</label
                >
                <div class="grid grid-cols-2 gap-3">
                  @for (p of availableProviders(); track p) {
                    <button
                      (click)="selectedProvider.set(p.provider)"
                      class="p-3 rounded border-2 transition-colors flex flex-col items-center"
                      [ngClass]="
                        selectedProvider() === p.provider
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-600'
                      "
                    >
                      <span class="text-2xl mb-1">{{ p.provider === 'paypal' ? '💳' : '💵' }}</span>
                      <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{
                        p.provider === 'paypal' ? 'PayPal' : 'Stripe'
                      }}</span>
                      @if (p.is_sandbox) {
                        <span class="text-xs text-amber-600 dark:text-amber-400">Sandbox</span>
                      }
                    </button>
                  }
                </div>
              </div>
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >{{ 'invoices.validoDurante' | transloco }}</label
                >
                <select
                  [(ngModel)]="expirationDays"
                  class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                >
                  <option [value]="1">{{ 'invoices.dia1' | transloco }}</option>
                  <option [value]="3">{{ 'invoices.dia3' | transloco }}</option>
                  <option [value]="7">{{ 'invoices.dia7' | transloco }}</option>
                  <option [value]="14">{{ 'invoices.dia14' | transloco }}</option>
                  <option [value]="30">{{ 'invoices.dia30' | transloco }}</option>
                </select>
              </div>
              <div class="flex justify-end gap-3">
                <button
                  class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  (click)="closePaymentLinkModal()"
                >
                  {{ 'invoices.cancelar' | transloco }}
                </button>
                <button
                  class="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                  [disabled]="!selectedProvider() || generatingPaymentLink()"
                  (click)="generatePaymentLink()"
                >
                  {{ generatingPaymentLink() ? ('invoices.generando' | transloco) : ('invoices.generarEnlace' | transloco) }}
                </button>
              </div>
            </div>
          }
          <!-- Generated link display -->
          @if (generatedPaymentLink()) {
            <div class="text-center">
              <div
                class="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-8 w-8 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p class="text-gray-700 dark:text-gray-300 mb-2">{{ 'invoices.enlaceGenerado' | transloco }}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {{ 'invoices.validoHasta' | transloco }} {{ generatedPaymentLink()?.expires_at | date: 'short' }}
              </p>
              <div class="bg-gray-100 dark:bg-gray-700 rounded p-3 mb-4">
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">{{ 'invoices.enlaceCompartir' | transloco }}</p>
                <input
                  type="text"
                  readonly
                  [value]="generatedPaymentLink()?.shareable_link"
                  class="w-full text-sm bg-transparent border-0 text-gray-800 dark:text-gray-200 text-center truncate"
                  #linkInput
                />
              </div>
              <div class="flex flex-col gap-2">
                <button
                  class="w-full px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-2"
                  (click)="copyLinkToClipboard()"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  {{ copiedLink() ? ('invoices.copiado' | transloco) : ('invoices.copiarEnlace' | transloco) }}
                </button>
                @if (invoice()?.client?.email) {
                  <button
                    class="w-full px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-60"
                    [disabled]="sendingPaymentEmail()"
                    (click)="sendPaymentEmail()"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    {{ sendingPaymentEmail() ? ('invoices.enviando' | transloco) : ('invoices.enviarEmailCliente' | transloco) }}
                  </button>
                }
                <button
                  class="w-full px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                  (click)="closePaymentLinkModal()"
                >
                  {{ 'invoices.cerrar' | transloco }}
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class InvoiceDetailComponent implements OnDestroy {
  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invoicesService = inject(SupabaseInvoicesService);
  private quotesService = inject(SupabaseQuotesService);
  private modulesService = inject(SupabaseModulesService);
  private settingsService = inject(SupabaseSettingsService);
  private paymentService = inject(PaymentIntegrationsService);
  private toast = inject(ToastService);
  private zone = inject(NgZone);
  private translocoService = inject(TranslocoService);
  invoice = signal<Invoice | null>(null);
  verifactuMeta = signal<any | null>(null);
  verifactuEvents = signal<any[]>([]);
  vfConfig = signal<{ maxAttempts: number; backoffMinutes: number[] } | null>(null);
  sendingEmail = signal(false);
  dispatcherHealth = signal<{
    pending: number;
    lastEventAt: string | null;
    lastAcceptedAt: string | null;
    lastRejectedAt: string | null;
  } | null>(null);
  private refreshInterval: any;
  private realtimeSub: { unsubscribe: () => void } | null = null;

  // Tax configuration
  pricesIncludeTax = signal<boolean>(false);

  // Payment link modal state
  showPaymentLinkModal = signal(false);
  generatingPaymentLink = signal(false);
  availableProviders = signal<PaymentIntegration[]>([]);
  selectedProvider = signal<'paypal' | 'stripe' | null>(null);
  expirationDays = 7;
  generatedPaymentLink = signal<{
    shareable_link: string;
    expires_at: string;
    token: string;
    provider: string;
  } | null>(null);
  copiedLink = signal(false);
  sendingPaymentEmail = signal(false);

  now = signal(Date.now());

  // Module-based visibility
  isVerifactuEnabled = computed(() => {
    const modules = this.modulesService.modulesSignal();
    if (!modules) return false;
    const mod = modules.find((m) => m.key === 'moduloVerifactu');
    return mod?.enabled ?? false;
  });

  attemptsDisplay = computed(() => {
    const last = this.latestRelevantEvent();
    const cfg = this.vfConfig();
    const max = cfg?.maxAttempts ?? 7;
    // If we have an event, at least 1 attempt has been made.
    // attempts in DB usually means "retries" (0 = 1st attempt).
    // So we show attempts + 1.
    const used = last ? (last.attempts ?? 0) + 1 : 0;

    if (last?.status === 'accepted' || last?.status === 'sent') return '-';
    return `${Math.min(used, max)}/${max}`;
  });

  nextRetryDisplay = computed(() => {
    // Depend on this.now() to trigger updates
    const _now = this.now();
    const last = this.latestRelevantEvent();
    if (!last) return '-';
    if (last.status === 'accepted' || last.status === 'sent') return '-';
    const cfg = this.vfConfig();
    const max = cfg?.maxAttempts ?? 7;
    const backoff = cfg?.backoffMinutes ?? [0, 1, 5, 15, 60, 180, 720];
    const attempts = last.attempts ?? 0;
    if (attempts >= max) return '—';
    const idx = Math.min(attempts, backoff.length - 1);
    const waitMin = backoff[idx] ?? 0;
    const lastTs = last.sent_at
      ? new Date(last.sent_at).getTime()
      : new Date(last.created_at).getTime();
    const eta = lastTs + waitMin * 60_000;
    const diff = eta - _now;
    if (diff <= 0) return 'inminente';
    const mins = Math.ceil(diff / 60_000);
    if (mins < 60) return `~${mins} min`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `~${hours} h ${rem} min` : `~${hours} h`;
  });

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadTaxSettings();

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'series') {
      try {
        const inv = await firstValueFrom(this.invoicesService.getInvoice(id));
        this.invoice.set(inv);
        await this.refreshVerifactu(id);
        this.realtimeSub = this.invoicesService.subscribeToVerifactuChanges(id, () => {
          this.refreshVerifactu(id);
        });
      } catch (err) {
        console.error('Error loading invoice', err);
      }
    }

    if (!this.modulesService.modulesSignal()) {
      firstValueFrom(this.modulesService.fetchEffectiveModules()).catch(e => console.warn('Error fetching modules', e));
    }

    firstValueFrom(this.invoicesService.getVerifactuConfig())
      .then(cfg => this.vfConfig.set(cfg))
      .catch(e => console.warn('VF config err', e));

    firstValueFrom(this.invoicesService.getDispatcherHealth())
      .then(h => this.dispatcherHealth.set(h))
      .catch(() => this.dispatcherHealth.set({
        pending: 0,
        lastEventAt: null,
        lastAcceptedAt: null,
        lastRejectedAt: null,
      }));

    this.zone.runOutsideAngular(() => {
      this.refreshInterval = setInterval(() => {
        this.now.set(Date.now());
        const id = this.route.snapshot.paramMap.get('id');
        if (id) this.refreshVerifactu(id);
      }, 5000);
    });
  }

  ngOnDestroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.realtimeSub) this.realtimeSub.unsubscribe();
  }

  async downloadPdf(invoiceId: string) {
    try {
      const signed = await firstValueFrom(this.invoicesService.getInvoicePdfUrl(invoiceId));
      window.open(signed, '_blank');
    } catch (e: any) {
      this.toast.error('No se pudo generar el PDF', e?.message || String(e));
    }
  }

  private async loadTaxSettings(): Promise<void> {
    try {
      const [app, company] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings()),
      ]);
      const effectivePricesIncludeTax =
        company?.prices_include_tax ?? app?.default_prices_include_tax ?? false;
      this.pricesIncludeTax.set(effectivePricesIncludeTax);
    } catch (err) {
      console.error('Error loading tax settings:', err);
      this.pricesIncludeTax.set(false);
    }
  }

  getDisplayAmount(invoice: Invoice): number {
    // SIEMPRE mostramos el total real (lo que paga el cliente)
    return invoice.total || 0;
  }

  async refreshVerifactu(invoiceId: string) {
    try {
      const meta = await firstValueFrom(this.invoicesService.getVerifactuMeta(invoiceId));
      this.verifactuMeta.set(meta);
    } catch (e) {
      console.warn('VF meta err', e)
    }
    try {
      const list = await firstValueFrom(this.invoicesService.getVerifactuEvents(invoiceId));
      this.verifactuEvents.set(list || []);
    } catch (e) {
      console.warn('VF events err', e)
    }
  }

  getStatusLabel(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'void') return this.translocoService.translate('invoices.anulada');
    if (s === 'pending') return this.translocoService.translate('invoices.pending');
    if (s === 'sending') return this.translocoService.translate('invoices.sending');
    if (s === 'sent') return this.translocoService.translate('invoices.enviada');
    if (s === 'accepted') return this.translocoService.translate('invoices.aceptada');
    if (s === 'rejected') return this.translocoService.translate('invoices.rechazada');
    if (s === 'approved') return this.translocoService.translate('invoices.aprobada');
    if (s === 'final') return this.translocoService.translate('invoices.emitida');
    return status;
  }

  statusChipClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'accepted' || s === 'sent' || s === 'final')
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
    if (s === 'rejected') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    if (s === 'sending' || s === 'pending')
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    if (s === 'void') return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }

  private latestRelevantEvent(): any | null {
    const list = this.verifactuEvents();
    if (!list || list.length === 0) return null;
    // Prefer the most recent pending event (queued for retry), otherwise the most recent event
    const pending = list.find((ev) => ev.status === 'pending');
    return pending || list[0];
  }

  async cancelInvoice(invoiceId: string) {
    const confirmed = await this.confirmModal.open({
      title: 'Anular Factura',
      message: '¿Estás seguro de que deseas anular esta factura? Se enviará la solicitud de anulación a la AEAT y este proceso es irreversible.',
      icon: 'fas fa-exclamation-triangle',
      iconColor: 'red',
      confirmText: 'Anular Factura',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    try {
      await firstValueFrom(this.invoicesService.cancelInvoiceWithAEAT(invoiceId));
      this.toast.success('Anulación enviada', 'Se ha solicitado la anulación a AEAT');
      // Reload invoice and verifactu state
      const inv = await firstValueFrom(this.invoicesService.getInvoice(invoiceId));
      this.invoice.set(inv);
      await this.refreshVerifactu(invoiceId);
    } catch (e: any) {
      const msg = 'Error al anular: ' + (e?.message || e);
      this.toast.error('Error', msg);
      console.error(msg);
    }
  }

  async rectify(invoiceId: string) {
    const reason = prompt(
      'Introduce el motivo de la rectificación:\n\n(Requerido por VeriFactu. Ej: "Error en cantidad", "Precio incorrecto", "Factura de prueba emitida por error")',
    );

    if (!reason || reason.trim() === '') {
      this.toast.error('Motivo requerido', 'Debes introducir un motivo para la rectificación');
      return;
    }

    try {
      const quoteId = await firstValueFrom(this.quotesService.createRectificationQuote(invoiceId, reason.trim()));
      this.toast.success(
        'Rectificación creada',
        'Se ha generado el presupuesto de rectificación',
      );
      this.router.navigate(['/presupuestos', quoteId]);
    } catch (e: any) {
      const msg = 'No se pudo crear la rectificación: ' + (e?.message || e);
      this.toast.error('Error', msg);
    }
  }

  async sendEmail(invoiceId: string) {
    const inv = this.invoice();
    const to = inv?.client?.email?.trim();
    if (!to) {
      this.toast.error('No se puede enviar', 'El cliente no tiene email configurado');
      return;
    }
    const num = this.formatNumber(inv || undefined) || undefined;
    const subject = num ? `Tu factura ${num}` : 'Tu factura';
    const message =
      'Te enviamos tu factura. Puedes descargar el PDF desde el enlace seguro proporcionado.';
    this.sendingEmail.set(true);
    try {
      await firstValueFrom(this.invoicesService.sendInvoiceEmail(invoiceId, to, subject, message));
      this.toast.success('Email enviado', 'La factura ha sido enviada');
    } catch (e: any) {
      const msg = 'Error al enviar email: ' + (e?.message || e);
      this.toast.error('Error al enviar', msg);
    } finally {
      this.sendingEmail.set(false);
    }
  }

  // Only allow showing the "Enviar por email" button when appropriate
  // - If Verifactu module is enabled: require VeriFactu status 'accepted' or 'sent'
  // - If Verifactu module is disabled: allow for any approved/issued/sent/paid invoice
  canSendEmail(): boolean {
    const inv = this.invoice();
    if (!inv) return false;
    const status = inv.status as string;
    // Don't show for drafts, voided or cancelled invoices
    if (status === 'draft' || status === 'void' || status === 'cancelled') return false;

    // If Verifactu module is disabled, allow email for approved/issued/sent/paid invoices
    if (!this.isVerifactuEnabled()) {
      return ['approved', 'issued', 'sent', 'paid'].includes(status);
    }

    // If Verifactu is enabled, require a completed VeriFactu status: 'accepted' or 'sent'
    const meta = this.verifactuMeta();
    const s = (meta?.status || '').toLowerCase();
    return s === 'accepted' || s === 'sent';
  }

  // Normaliza el número mostrado de la factura a prefijo F
  formatNumber(inv?: Invoice | null): string {
    if (!inv) return '';
    return formatInvoiceNumber(inv);
  }

  async onIssued() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      // Refresh invoice and verifactu data after successful issue
      try {
        const inv = await firstValueFrom(this.invoicesService.getInvoice(id));
        this.invoice.set(inv);
      } catch (e) {
        console.warn('Reload invoice err', e);
      }
      await this.refreshVerifactu(id);
    }
  }

  isSentOrLater(status: string): boolean {
    return ['sent', 'paid', 'partial', 'overdue', 'issued'].includes(status);
  }

  canCancel(inv: Invoice): boolean {
    // No permitir anular si ya está cancelada, anulada o rectificada
    if (inv.status === 'cancelled' || inv.status === 'void' || inv.status === 'rectified')
      return false;

    // Si VeriFactu está habilitado y la factura está aceptada por AEAT, NO permitir anular
    // (debe rectificarse formalmente en su lugar)
    if (this.isVerifactuEnabled() && this.isVerifactuAccepted()) {
      return false;
    }

    // Permitir anular facturas rectificativas (negativas)
    if (inv.invoice_type === 'rectificative' || (inv.total || 0) < 0) return true;

    return this.isSentOrLater(inv.status);
  }

  canRectify(inv: Invoice): boolean {
    // No permitir rectificar si ya está cancelada, anulada o rectificada
    if (inv.status === 'cancelled' || inv.status === 'void' || inv.status === 'rectified')
      return false;

    // No permitir rectificar una factura rectificativa (sería un bucle extraño, mejor anularla y hacer una nueva)
    if (inv.invoice_type === 'rectificative' || (inv.total || 0) < 0) return false;

    // Permitir rectificar si está anulada y la anulación fue aceptada por VeriFactu (caso raro, pero posible)
    if ((inv.status as string) === 'void') {
      return this.verifactuMeta()?.status === 'void';
    }
    return this.isSentOrLater(inv.status) || this.isVerifactuAccepted();
  }

  isVerifactuAccepted(): boolean {
    return this.verifactuMeta()?.status === 'accepted';
  }

  // ========================================
  // Payment Link Methods
  // ========================================

  canSendPaymentLink(inv: Invoice): boolean {
    if (!inv) return false;
    // Don't show for drafts, voided, cancelled, or already paid
    const status = inv.status as string;
    if (['draft', 'void', 'cancelled', 'paid'].includes(status)) return false;
    // Show for approved, issued, sent, partial, overdue invoices
    return ['approved', 'issued', 'sent', 'partial', 'overdue'].includes(status);
  }

  async openPaymentLinkModal() {
    const inv = this.invoice();
    if (!inv) return;

    // Reset modal state
    this.generatedPaymentLink.set(null);
    this.selectedProvider.set(null);
    this.expirationDays = 7;
    this.copiedLink.set(false);

    // Load available payment integrations
    try {
      const integrations = await this.paymentService.getIntegrations(inv.company_id);
      const active = integrations.filter((i) => i.is_active);
      this.availableProviders.set(active);

      // Pre-select if only one provider available
      if (active.length === 1) {
        this.selectedProvider.set(active[0].provider);
      }
    } catch (e: any) {
      console.error('Error loading payment integrations', e);
      this.availableProviders.set([]);
    }

    this.showPaymentLinkModal.set(true);
  }

  closePaymentLinkModal() {
    this.showPaymentLinkModal.set(false);
    this.generatedPaymentLink.set(null);
  }

  async generatePaymentLink() {
    const inv = this.invoice();
    const provider = this.selectedProvider();
    if (!inv || !provider) return;

    this.generatingPaymentLink.set(true);
    try {
      const result = await this.paymentService.generatePaymentLink(
        inv.id,
        provider,
        this.expirationDays,
      );
      this.generatedPaymentLink.set(result);
      this.toast.success('Enlace generado', 'El enlace de pago está listo para compartir');
    } catch (e: any) {
      const msg = e?.message || 'Error al generar enlace de pago';
      this.toast.error('Error', msg);
      console.error('Error generating payment link', e);
    } finally {
      this.generatingPaymentLink.set(false);
    }
  }

  async sendPaymentEmail() {
    const inv = this.invoice();
    const link = this.generatedPaymentLink();
    const to = inv?.client?.email?.trim();
    if (!inv || !link || !to) return;

    const num = this.formatNumber(inv) || 'Factura';
    const subject = `Enlace de pago - ${num}`;
    const message = `Hola,\n\nPuedes pagar tu factura ${num} de forma segura a través del siguiente enlace:\n\n${link.shareable_link}\n\nEste enlace es válido hasta ${new Date(link.expires_at).toLocaleDateString('es-ES')}.\n\nGracias.`;

    this.sendingPaymentEmail.set(true);
    try {
      // Use existing email service through invoices service
      await firstValueFrom(this.invoicesService.sendInvoiceEmail(inv.id, to, subject, message));
      this.toast.success('Email enviado', 'El enlace de pago ha sido enviado al cliente');
    } catch (e: any) {
      const msg = e?.message || 'Error al enviar email';
      this.toast.error('Error', msg);
      console.error('Error sending payment email', e);
    } finally {
      this.sendingPaymentEmail.set(false);
    }
  }

  async copyLinkToClipboard() {
    const link = this.generatedPaymentLink()?.shareable_link;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.copiedLink.set(true);
      setTimeout(() => this.copiedLink.set(false), 2000);
    } catch (e) {
      console.error('Error copying to clipboard', e);
    }
  }

  canMarkAsPaid(inv: Invoice): boolean {
    if (!inv) return false;
    const status = (inv.status || '').toLowerCase();
    const pStatus = (inv.payment_status || '').toLowerCase();

    // Can mark as paid if not already paid, void, or cancelled
    if (status === 'void' || status === 'cancelled') return false;
    if (pStatus === 'paid') return false;

    return true;
  }

  async markAsPaid(inv: Invoice) {
    const confirmed = await this.confirmModal.open({
      title: 'Marcar como Pagada',
      message: '¿Confirmas que esta factura ha sido pagada en local o efectivo?',
      icon: 'fas fa-check-circle',
      iconColor: 'green',
      confirmText: 'Confirmar Pago',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;

    try {
      const updated = await firstValueFrom(this.invoicesService.updateInvoice(inv.id, {
        status: InvoiceStatus.PAID,
        payment_status: 'paid',
      }));
      this.invoice.set(updated);
      this.toast.success(
        'Factura pagada',
        'La factura ha sido marcada como pagada correctamente',
      );
    } catch (e) {
      console.error('Error marking as paid', e);
      this.toast.error('Error', 'No se pudo actualizar la factura');
    }
  }
}
