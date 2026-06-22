import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { AuthService } from '../../../services/auth.service';
import { AiService } from '../../../services/ai.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { ToastService } from '../../../services/toast.service';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';
import { ProjectsService } from '../../../core/services/projects.service';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  Quote,
  QuoteStatus,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_COLORS,
  formatQuoteNumber,
  isQuoteExpired,
  getClientDisplayName,
  getClientInitial,
} from '../../../models/quote.model';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-quote-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslocoPipe],
  template: `
    <div class="p-6">
      <!-- Toolbar - SIN contenedor blanco (exactamente como invoice-list) -->
      <div class="mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <!-- Buscador -->
        <div class="w-full md:flex-1">
          <div class="relative">
            <input
              type="text"
              [placeholder]="'quotes.list.buscar' | transloco"
              [ngModel]="searchTerm()"
              (ngModelChange)="searchTerm.set($event)"
              class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                class="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="flex flex-col sm:flex-row gap-3">
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{{ 'quotes.list.todosEstados' | transloco }}</option>
            <option value="draft">{{ 'quotes.status.draft' | transloco }}</option>
            <option value="request">{{ 'quotes.solicitado' | transloco }}</option>
            <option value="sent">{{ 'quotes.status.sent' | transloco }}</option>
            <option value="accepted">{{ 'quotes.status.accepted' | transloco }}</option>
            <option value="rejected">{{ 'quotes.status.rejected' | transloco }}</option>
            <option value="expired">{{ 'quotes.status.expired' | transloco }}</option>
          </select>

          <select
            [ngModel]="projectFilter()"
            (ngModelChange)="onProjectFilterChange($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los proyectos</option>
            @for (proj of projects(); track proj.id) {
              <option [value]="proj.id">{{ proj.name }}</option>
            }
          </select>

          <select
            [ngModel]="sortBy()"
            (ngModelChange)="sortBy.set($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="date-desc">{{ 'invoices.recientes' | transloco }}</option>
            <option value="date-asc">{{ 'quotes.list.antiguos' | transloco }}</option>
            <option value="amount-desc">{{ 'invoices.mayorImporte' | transloco }}</option>
            <option value="amount-asc">{{ 'invoices.menorImporte' | transloco }}</option>
            <option value="client-asc">{{ 'invoices.clienteAZ' | transloco }}</option>
          </select>
        </div>
      </div>

      <!-- Holded Estimates Panel - CON contenedor blanco (exactamente como invoice-list) -->
      @if (holdedService.isActive()) {
        <div
          class="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 text-left"
            (click)="holdedExpanded.set(!holdedExpanded())"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">{{
                'quotes.list.holdedTitle' | transloco
              }}</span>
              @if (loadingHolded()) {
                <span class="text-xs text-gray-400 dark:text-gray-500">{{
                  'common.cargando' | transloco
                }}</span>
              } @else {
                <span
                  class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full"
                  >{{ holdedEstimates().length }}</span
                >
              }
            </div>
            <svg
              class="w-4 h-4 text-gray-400 transition-transform"
              [class.rotate-180]="holdedExpanded()"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          @if (holdedExpanded()) {
            @if (holdedError()) {
              <div class="px-4 pb-4 text-sm text-red-500 dark:text-red-400">
                {{ holdedError() }}
              </div>
            } @else if (loadingHolded()) {
              <div class="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">
                {{ 'quotes.list.holdedLoading' | transloco }}
              </div>
            } @else if (holdedEstimates().length === 0) {
              <div class="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">
                {{ 'quotes.list.holdedNoResults' | transloco }}
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {{ 'quotes.numero' | transloco }}
                      </th>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {{ 'quotes.contacto' | transloco }}
                      </th>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {{ 'quotes.fecha' | transloco }}
                      </th>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {{ 'quotes.estado' | transloco }}
                      </th>
                      <th
                        class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {{ 'quotes.total' | transloco }}
                      </th>
                      <th class="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    @for (est of holdedEstimates(); track est['id']) {
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td
                          class="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap"
                        >
                          {{ est['docNumber'] || est['num'] || '—' }}
                        </td>
                        <td class="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {{ est['contactName'] || est['contact'] || '—' }}
                        </td>
                        <td class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {{ est['date'] ? (est['date'] * 1000 | date: 'dd/MM/yyyy') : '—' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                          <span
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                          >
                            {{ est['status'] || '—' }}
                          </span>
                        </td>
                        <td
                          class="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap"
                        >
                          {{ est['total'] ?? est['amount'] ?? 0 | number: '1.2-2' }} €
                        </td>
                        <td class="px-4 py-3 text-right">
                          <a
                            href="https://app.holded.com/invoices/estimate/{{ est['id'] }}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >{{ 'quotes.list.holdedVerEnHolded' | transloco }}</a
                          >
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </div>
      }

      <!-- Desktop Table View (Hidden on Mobile) - CON contenedor blanco (exactamente como invoice-list) -->
      <div
        class="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div class="px-6 py-3 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-3">
          <!-- Group 1: Quote universe (indigo / amber / emerald) -->
          <span
            class="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full font-medium"
            [title]="'quotes.list.totalHint' | transloco"
          >
            <i class="fas fa-file-invoice text-[10px]"></i>
            {{ 'quotes.list.totalQuotes' | transloco }}: {{ quotes().length }}
          </span>
          <span class="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
            <i class="fas fa-file text-[10px]"></i>
            {{ 'quotes.list.drafts' | transloco }}: {{ quotesDraftCount() }}
          </span>
          <span
            class="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium"
            [title]="'quotes.list.liveHint' | transloco"
          >
            <i class="fas fa-heartbeat text-[10px]"></i>
            {{ 'quotes.list.live' | transloco }}: {{ liveQuotesCount() }}
          </span>
          @if (acceptedButNotInvoicedCount() > 0) {
            <span
              class="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium"
              [title]="'quotes.list.acceptedButNotInvoicedHint' | transloco"
            >
              <i class="fas fa-file-signature text-[10px]"></i>
              {{ 'quotes.list.acceptedButNotInvoiced' | transloco }}: {{ acceptedButNotInvoicedCount() }}
            </span>
          }
          @if (quotesWithoutTotal() > 0) {
            <span class="inline-flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-full font-medium">
              <i class="fas fa-exclamation-triangle text-[10px]"></i>
              {{ 'quotes.list.withoutTotal' | transloco }}: {{ quotesWithoutTotal() }}
            </span>
          }
          @if (quotesForPastConfirmedBookings() > 0) {
            <span
              class="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-700/40 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-full font-medium"
              [title]="'quotes.list.quotesForPastConfirmedBookingsHint' | transloco"
            >
              <i class="fas fa-history text-[10px]"></i>
              {{ 'quotes.list.quotesForPastConfirmedBookings' | transloco }}: {{ quotesForPastConfirmedBookings() }}
            </span>
          }
          @if (quotesForCancelledBookings() > 0) {
            <span
              class="inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-700/40 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-full font-medium"
              [title]="'quotes.list.quotesForCancelledBookingsHint' | transloco"
            >
              <i class="fas fa-ban text-[10px]"></i>
              {{ 'quotes.list.quotesForCancelledBookings' | transloco }}: {{ quotesForCancelledBookings() }}
            </span>
          }

          <!-- Visual divider between universes -->
          <span class="text-gray-300 dark:text-gray-600" aria-hidden="true">|</span>

          <!-- Group 2: Booking universe (sky / emerald / rose) -->
          <span
            class="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-700/40 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-full font-medium"
            [title]="'quotes.list.activeBookingsHint' | transloco"
          >
            <i class="fas fa-calendar text-[10px]"></i>
            {{ 'quotes.list.activeBookings' | transloco }}: {{ activeBookings() }}
          </span>
          <span
            class="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full font-medium"
            [title]="'quotes.list.totalBookingsHint' | transloco"
          >
            <i class="fas fa-layer-group text-[10px]"></i>
            {{ 'quotes.list.totalBookings' | transloco }}: {{ totalBookings() }}
          </span>
          @if (cancelledBookings() > 0) {
            <span
              class="inline-flex items-center gap-1 bg-stone-100 dark:bg-stone-700/40 text-stone-700 dark:text-stone-300 px-2 py-0.5 rounded-full font-medium"
              [title]="'quotes.list.cancelledBookingsHint' | transloco"
            >
              <i class="fas fa-ban text-[10px]"></i>
              {{ cancelledBookings() }} {{ 'quotes.list.cancelledBookings' | transloco }}
            </span>
          }
          @if (futureBookings() > 0) {
            <span
              class="inline-flex items-center gap-1 bg-sky-100 dark:bg-sky-900/20 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded-full font-medium"
              [title]="'quotes.list.futureBookingsHint' | transloco"
            >
              <i class="fas fa-calendar-plus text-[10px]"></i>
              {{ 'quotes.list.futureBookings' | transloco }}: {{ futureBookings() }}
            </span>
            @if (futureBookingsWithQuote() > 0) {
              <span
                class="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium"
                [title]="'quotes.list.futureWithQuoteHint' | transloco"
              >
                <i class="fas fa-link text-[10px]"></i>
                {{ 'quotes.list.futureWithQuote' | transloco }}: {{ futureBookingsWithQuote() }}
              </span>
            }
            @if (futureBookingsWithoutQuote() > 0) {
              <span
                class="inline-flex items-center gap-1 bg-rose-100 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300 px-2 py-0.5 rounded-full font-medium"
                [title]="'quotes.list.futureWithoutQuoteHint' | transloco"
              >
                <i class="fas fa-exclamation-triangle text-[10px]"></i>
                {{ 'quotes.list.futureWithoutQuote' | transloco }}: {{ futureBookingsWithoutQuote() }}
              </span>
            }
          }

          <!-- Group 3: Reconciliation warning (only when drift > 0) -->
          @if (quoteBookingDescuadre() !== 0) {
            <span
              class="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 px-2 py-0.5 rounded-full font-medium"
              [title]="'quotes.list.descuadreHint' | transloco"
            >
              <i class="fas fa-exclamation-triangle text-[10px]"></i>
              {{ 'quotes.list.descuadre' | transloco }}: {{ quoteBookingDescuadre() }}
            </span>
          }
        </div>
        <div class="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.numero' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.cliente' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.fechaEmision' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.fechaAccion' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.estado' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.total' | transloco }}
                </th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              @for (quote of filteredQuotes(); track quote.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {{ formatQuoteNumber(quote) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {{ getClientDisplayName(quote.client, 'quotes.clienteSinNombre' | transloco) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {{ quote.quote_date | date: 'dd/MM/yyyy' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    @if (getActionDate(quote); as actionDate) {
                      <span
                        [class.text-red-600]="isOverdue(quote)"
                        [class.dark:text-red-400]="isOverdue(quote)"
                        [class.font-semibold]="isOverdue(quote)"
                      >{{ actionDate | date: 'dd/MM/yyyy' }}</span>
                    } @else {
                      —
                    }
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                      [ngClass]="getStatusClass(quote)"
                    >
                      {{ getStatusLabel(quote) }}
                    </span>
                  </td>
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-gray-100"
                  >
                    {{ formatCurrency(displayTotal(quote)) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex items-center justify-end gap-3">
                      <button
                        class="text-gray-400 hover:text-blue-600 transition-colors"
                        [routerLink]="['/presupuestos', quote.id]"
                        title="Ver"
                      >
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                      <button
                        class="text-gray-400 hover:text-red-600 transition-colors"
                        (click)="downloadPdf(quote.id)"
                        title="Descargar PDF"
                      >
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-6 py-12 text-center">
                    <div
                      class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
                    >
                      <svg
                        class="h-12 w-12 mb-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span class="text-base font-medium">{{
                        'quotes.noPresupuestosEncontrados' | transloco
                      }}</span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile Card View (Visible on Mobile) - exactametne como invoice-list -->
      <div class="md:hidden space-y-4">
        @for (quote of filteredQuotes(); track quote.id) {
          <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex justify-between items-start mb-3">
              <div>
                <div class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ formatQuoteNumber(quote) }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ 'quotes.fechaEmision' | transloco }}: {{ quote.quote_date | date: 'dd MMM yyyy' }}
                </div>
                @if (getActionDate(quote); as actionDate) {
                  <div
                    class="text-sm"
                    [class.text-red-600]="isOverdue(quote)"
                    [class.dark:text-red-400]="isOverdue(quote)"
                    [class.font-semibold]="isOverdue(quote)"
                    [class.text-gray-500]="!isOverdue(quote)"
                    [class.dark:text-gray-400]="!isOverdue(quote)"
                  >
                    {{ 'quotes.fechaAccion' | transloco }}: {{ actionDate | date: 'dd MMM yyyy' }}
                  </div>
                }
              </div>
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                [ngClass]="getStatusClass(quote)"
              >
                {{ getStatusLabel(quote) }}
              </span>
            </div>

            <div class="mb-4">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ getClientDisplayName(quote.client, 'Cliente sin nombre') }}
              </div>
              <div class="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {{ formatCurrency(displayTotal(quote)) }}
              </div>
            </div>

            <div
              class="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-3 mt-3"
            >
              <button
                class="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 flex items-center gap-1"
                (click)="downloadPdf(quote.id)"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                PDF
              </button>
              <a
                [routerLink]="['/presupuestos', quote.id]"
                class="inline-flex items-center justify-center px-4 py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
              >
                {{ 'quotes.verDetalle' | transloco }}
                <svg class="ml-1.5 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            </div>
          </div>
        } @empty {
          <div
            class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700"
          >
            <svg
              class="h-12 w-12 mx-auto text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {{ 'quotes.noPresupuestosEncontrados' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- Floating Action Button -->
      <button (click)="createQuote()" class="fab-button" [title]="'quotes.nuevo' | transloco">
        <i class="fas fa-plus"></i>
      </button>
    </div>
  `,
  styleUrl: './quote-list.component.scss',
})
export class QuoteListComponent implements OnInit, OnDestroy {
  private quotesService = inject(SupabaseQuotesService);
  private supabaseClient = inject(SupabaseClientService);
  private settingsService = inject(SupabaseSettingsService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private customersService = inject(SupabaseCustomersService);
  private modulesService = inject(SupabaseModulesService);
  private aiService = inject(AiService);
  private toastService = inject(ToastService);
  private translocoService = inject(TranslocoService);
  holdedService = inject(HoldedIntegrationService);
  projectsService = inject(ProjectsService);

  holdedEstimates = signal<any[]>([]);
  loadingHolded = signal(false);
  holdedExpanded = signal(true);
  holdedError = signal<string | null>(null);

  quotes = signal<Quote[]>([]);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('');
  sortBy = signal<string>('date-desc');

  // Project filter
  projects = signal<any[]>([]);
  projectFilter = signal<string>('');
  projectDocumentIds = signal<Set<string> | null>(null);

  // Tax configuration
  pricesIncludeTax = signal<boolean>(false);

  // AI Module Check
  hasAiModule = signal(false);
  isRecording = signal(false);
  isProcessingAudio = signal(false);
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: any[] = [];

  subscription: RealtimeChannel | null = null;

  // Filtered and sorted quotes
  filteredQuotes = computed(() => {
    let filtered = this.quotes();

    // Apply search filter
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (q) =>
          this.formatQuoteNumber(q).toLowerCase().includes(search) ||
          getClientDisplayName(q.client, '').toLowerCase().includes(search) ||
          (q.title || '').toLowerCase().includes(search),
      );
    }

    // Apply status filter
    const status = this.statusFilter();
    if (status) {
      filtered = filtered.filter((q) => q.status === status);
    }

    // Apply project filter
    const projectIds = this.projectDocumentIds();
    if (projectIds) {
      filtered = filtered.filter((q) => projectIds.has(q.id));
    }

    // Apply sorting
    const sort = this.sortBy();
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return new Date(a.quote_date || a.created_at).getTime() - new Date(b.quote_date || b.created_at).getTime();
        case 'date-desc':
          return new Date(b.quote_date || b.created_at).getTime() - new Date(a.quote_date || a.created_at).getTime();
        case 'amount-asc':
          return this.displayTotal(a) - this.displayTotal(b);
        case 'amount-desc':
          return this.displayTotal(b) - this.displayTotal(a);
        case 'client-asc':
          return (a.client?.name || '').localeCompare(b.client?.name || '');
        default:
          return 0;
      }
    });
  });

  quotesWithoutTotal = computed(() =>
    this.quotes().filter(q => this.displayTotal(q) === 0).length
  );

  /** Count of quotes with status='accepted'. */
  quotesAcceptedCount = computed(() =>
    this.quotes().filter(q => (q.status || '').toLowerCase() === 'accepted').length
  );

  /** Count of quotes with status='draft'. */
  quotesDraftCount = computed(() =>
    this.quotes().filter(q => (q.status || '').toLowerCase() === 'draft').length
  );

  /**
   * Count of "live" quotes: anything that is NOT invoiced and NOT cancelled.
   * Live states: draft, sent, viewed, accepted, rejected, expired.
   * This is the working universe — the quotes that still represent an open
   * business conversation (not yet a closed-and-invoiced deal, not yet
   * a recorded cancellation).
   */
  liveQuotesCount = computed(() => {
    const excluded = new Set(['invoiced', 'cancelled']);
    return this.quotes().filter(q => !excluded.has((q.status || '').toLowerCase())).length;
  });

  /**
   * Absolute drift between future bookings count and the (with quote + without quote)
   * split. Should always be 0 in healthy data — the trigger guarantees that every
   * future booking has exactly one quote (or zero). Non-zero = data drift that
   * the descuadre pill surfaces.
   */
  quoteBookingDescuadre = computed(() => {
    const total = this.futureBookings();
    const sum = this.futureBookingsWithQuote() + this.futureBookingsWithoutQuote();
    return Math.abs(total - sum);
  });

  /**
   * Count of "accepted but not yet invoiced" quotes — the client said yes
   * but we haven't generated the invoice yet. These are the ones sitting
   * in the "vivos" pill that are actually ready to be billed.
   */
  acceptedButNotInvoicedCount = computed(() =>
    this.quotes().filter(
      (q) => (q.status || '').toLowerCase() === 'accepted' && !q.invoice_id
    ).length
  );

  /**
   * Total bookings in the company regardless of status. Includes
   * cancelled, no_show, and any other state. The "all-time" count.
   */
  totalBookings = signal<number>(0);

  /**
   * Bookings whose status is cancelled/no_show/anulada. Excluded from
   * the active count and from the future-bookings pipeline. Shown
   * separately so the user can see "X of Y total are cancelled".
   */
  cancelledBookings = signal<number>(0);

  /**
   * Quotes linked to a cancelled/no_show booking. Historical: they
   * were created when the booking was active but the booking was
   * later cancelled. They count toward the "Total" pill but should
   * be excluded from any active-pipeline reconciliation. Surfaced
   * so the user can see how much of the "Total" is historical.
   */
  quotesForCancelledBookings = signal<number>(0);

  /**
   * Quotes linked to a confirmed booking whose start_time is in the
   * past. These are quotes that should normally be invoiced — they
   * represent work that has happened. Combined with `invoiced` count
   * gives the "should-be-invoiced" universe on the quote side.
   */
  quotesForPastConfirmedBookings = signal<number>(0);

  /**
   * Total active bookings in the company: NOT cancelled, NOT no_show.
   * This is the "true size" of the booking universe — used as a sanity
   * check against the quote count (a quote should normally exist for
   * each of these, modulo draft quotes and orphan quotes).
   */
  activeBookings = signal<number>(0);

  /**
   * Bookings whose `start_time` is in the future. These are sessions
   * that have NOT yet happened. Loaded via `loadFutureBookingsCount()`
   * because it is a property of `bookings`, not of `quotes`.
   */
  futureBookings = signal<number>(0);

  /**
   * Of the future bookings, how many have a quote assigned (in any status)?
   * This is the reconciliation key: futureBookings == futureWithQuote + futureWithoutQuote.
   */
  futureBookingsWithQuote = signal<number>(0);

  /** Of the future bookings, how many have NO quote yet. */
  futureBookingsWithoutQuote = signal<number>(0);

  ngOnInit() {
    // Check for query params (status filter from home)
    this.route.queryParams.subscribe((params) => {
      if (params['status']) {
        this.statusFilter.set(params['status']);
      }
    });

    this.loadProjects();

    this.modulesService.fetchEffectiveModules().subscribe((modules) => {
      const hasAi = modules.some((m) => m.key === 'ai' && m.enabled);
      this.hasAiModule.set(hasAi);
    });

    this.loadTaxSettings().finally(async () => {
      await this.loadQuotes();
      await this.holdedService.loadIntegration();
      this.loadHoldedEstimates();
      this.loadFutureBookingsCount();
      this.setupRealtimeSubscription();
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.supabaseClient.instance.removeChannel(this.subscription);
      this.subscription = null;
    }
  }

  private async loadHoldedEstimates(): Promise<void> {
    if (!this.holdedService.isActive()) return;
    this.loadingHolded.set(true);
    this.holdedError.set(null);
    try {
      const result = await this.holdedService.listDocuments('documents/estimate', { page: '1' });
      this.holdedEstimates.set(result as any[]);
    } catch (e: any) {
      this.holdedError.set(e?.message ?? this.translocoService.translate('quotes.list.holdedErrorLoading'));
    } finally {
      this.loadingHolded.set(false);
    }
  }

  /**
   * Counts bookings with `start_time` strictly greater than now.
   * Time-bucketed snapshot: "sessions not yet performed".
   * Also returns with_quote/without_quote split for reconciliation.
   * Non-fatal: counters stay at 0 if the query fails.
   */
  private async loadFutureBookingsCount(): Promise<void> {
    try {
      const now = new Date().toISOString();
      // Cancelled bookings don't need a quote — exclude them so the badge
      // doesn't show a non-issue (e.g. a Docplanner-cancelled booking whose
      // client_id was wiped by the sync). Same filter applied to both
      // counters so total == withQ + withoutQ stays consistent.
      const { count: total, error: e1 } = await this.supabaseClient.instance
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .gt('start_time', now)
        .neq('status', 'cancelled');
      if (e1) throw e1;
      this.futureBookings.set(total ?? 0);

      // Future bookings WITH a quote: filter by quote_id IS NOT NULL.
      const { count: withQ, error: e2 } = await this.supabaseClient.instance
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .gt('start_time', now)
        .neq('status', 'cancelled')
        .not('quote_id', 'is', null);
      if (e2) throw e2;
      this.futureBookingsWithQuote.set(withQ ?? 0);

      this.futureBookingsWithoutQuote.set((total ?? 0) - (withQ ?? 0));

      // Total bookings (regardless of status). The "all-time" universe
      // size. Used for the "Reservas totales" pill so the user can see
      // "X activas + Y canceladas = Z totales".
      const { count: nTotal, error: eTotal } = await this.supabaseClient.instance
        .from('bookings')
        .select('id', { count: 'exact', head: true });
      if (eTotal) throw eTotal;
      this.totalBookings.set(nTotal ?? 0);

      // Cancelled / no_show bookings only. The rest of the lifecycle
      // treats these as "out of pipeline", so we surface them as a
      // single counter for transparency.
      const { count: cancelled, error: eCancelled } = await this.supabaseClient.instance
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['cancelled', 'no_show', 'no-show', 'canceled', 'anulada', 'anulado']);
      if (eCancelled) throw eCancelled;
      this.cancelledBookings.set(cancelled ?? 0);

      // Total active bookings (no time filter, just exclude cancelled /
      // no_show). Gives a single "true size" of the booking universe for
      // the quote-list pill. Computed in parallel with the future counts.
      const { count: active, error: eActive } = await this.supabaseClient.instance
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '(cancelled,no_show,no-show,canceled,anulada,anulado)');
      if (eActive) throw eActive;
      this.activeBookings.set(active ?? 0);

      // Quotes linked to cancelled / no_show bookings. Historical
      // counter — these quotes no longer represent an open business
      // conversation. Surfaced so the user can see how much of the
      // "Total" quote count is historical baggage.
      // RLS scopes to the current company automatically.
      const { count: qCancelled, error: eQCancelled } = await this.supabaseClient.instance
        .from('quotes')
        .select('id, bookings!inner(status)', { count: 'exact', head: true })
        .in('bookings.status', ['cancelled', 'no_show', 'no-show', 'canceled', 'anulada', 'anulado']);
      if (eQCancelled) throw eQCancelled;
      this.quotesForCancelledBookings.set(qCancelled ?? 0);

      // Quotes linked to past confirmed bookings. These are quotes
      // that should normally be invoiced. Combined with invoiced count
      // gives the "should-be-invoiced" universe on the quote side.
      const { count: qPast, error: eQPast } = await this.supabaseClient.instance
        .from('quotes')
        .select('id, bookings!inner(status, start_time)', { count: 'exact', head: true })
        .not('bookings.status', 'in', '(cancelled,no_show,no-show,canceled,anulada,anulado)')
        .lt('bookings.start_time', now);
      if (eQPast) throw eQPast;
      this.quotesForPastConfirmedBookings.set(qPast ?? 0);
    } catch (e) {
      console.warn('Could not load future bookings count', e);
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
      this.pricesIncludeTax.set(!!effectivePricesIncludeTax);
    } catch {
      // keep defaults
    }
  }

  private async loadQuotes(): Promise<void> {
    try {
      const result = await firstValueFrom(this.quotesService.getQuotes());
      this.quotes.set(result.data || []);
    } catch (err) {
      console.error('Error loading quotes', err);
    }
  }

  createQuote() {
    this.router.navigate(['/presupuestos/new']);
  }

  formatQuoteNumber(quote: Quote): string {
    return formatQuoteNumber(quote);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  // Compute display total with VAT according to settings
  displayTotal(quote: Quote): number {
    const items = (quote.items || []) as any[];
    if (!items.length) {
      return Number(quote.total_amount || 0);
    }

    let subtotal = 0;
    let taxAmount = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const price = Number((item.unit_price ?? item.price ?? item.price_per_unit) || 0);
      const discount = Number(item.discount_percent || 0);
      const taxRate = Number(item.tax_rate || 0);

      const itemSubtotal = qty * price;
      const itemDiscount = itemSubtotal * (discount / 100);
      const itemNet = itemSubtotal - itemDiscount;
      const itemTax = itemNet * (taxRate / 100);
      subtotal += itemNet;
      taxAmount += itemTax;
    }

    return Math.round((subtotal + taxAmount) * 100) / 100;
  }

  /**
   * Best display name for a client. Prefers the personal name over the
   * business name (which can hold a stale "Natural" / "Particular" / etc.
   * token from a buggy import that placed client_type into business_name).
   */
  getClientDisplayName(
    client: { name?: string | null; business_name?: string | null; surname?: string | null } | null | undefined,
    placeholder = '—'
  ): string {
    return getClientDisplayName(client, placeholder);
  }

  /** First letter of the best display name, for avatar use. */
  getClientInitial(
    client: { name?: string | null; business_name?: string | null; surname?: string | null } | null | undefined
  ): string {
    return getClientInitial(client);
  }

  getStatusLabel(quote: Quote): string {
    const status = quote.status;
    const map: Record<string, string> = {
      draft: this.translocoService.translate('quotes.status.draft'),
      sent: this.translocoService.translate('quotes.status.sent'),
      viewed: this.translocoService.translate('quotes.status.viewed'),
      accepted: this.translocoService.translate('quotes.status.accepted'),
      rejected: this.translocoService.translate('quotes.status.rejected'),
      expired: this.translocoService.translate('quotes.status.expired'),
      cancelled: this.translocoService.translate('quotes.status.cancelled'),
      invoiced: this.translocoService.translate('quotes.status.invoiced'),
    };
    return map[status] || status;
  }

  /**
   * Returns the "action" date for a quote based on its status.
   * - draft/sent/viewed/request/expired: valid_until (when it will die)
   * - accepted: accepted_at (when the deal closed)
   * - rejected: rejected_at (when the client said no)
   * Falls back to quote_date if the specific timestamp is missing.
   */
  getActionDate(quote: Quote): string | null {
    const status = (quote.status || '').toLowerCase();
    switch (status) {
      case 'accepted': return quote.accepted_at || quote.quote_date;
      case 'rejected': return quote.rejected_at || quote.quote_date;
      case 'draft':
      case 'sent':
      case 'viewed':
      case 'request':
      case 'expired':
      default:         return quote.valid_until || quote.quote_date;
    }
  }

  /** Localized label for the action-date column header, depending on the dominant status. */
  getActionDateHeaderLabel(): string {
    // For mixed lists we show a generic label; per-row coloring hints at the meaning.
    return 'Vence / Cerrado';
  }

  /**
   * True for quotes that have a valid_until in the past and are still
   * pending (draft / sent / viewed). The user wants these to stand out
   * in the action-date column.
   */
  isOverdue(quote: Quote): boolean {
    const status = (quote.status || '').toLowerCase();
    if (status === 'accepted' || status === 'rejected' || status === 'cancelled' || status === 'expired') return false;
    if (!quote.valid_until) return false;
    return new Date(quote.valid_until) < new Date();
  }

  getStatusClass(quote: Quote): string {
    const status = quote.status;
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      viewed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
      accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
      expired: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      cancelled: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
      invoiced: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  downloadPdf(id: string) {
    this.quotesService.getQuotePdfUrl(id).subscribe({
      next: (signed) => window.open(signed, '_blank', 'noopener,noreferrer'),
      error: (e) => console.error('PDF error', e),
    });
  }

  setupRealtimeSubscription() {
    if (this.subscription) return;

    this.subscription = this.quotesService.subscribeToQuoteChanges((payload) => {
      if (payload.eventType === 'UPDATE') {
        this.quotes.update((quotes) =>
          quotes.map((q) => (q.id === payload.new.id ? { ...q, ...payload.new } : q)),
        );
      } else if (payload.eventType === 'INSERT') {
        this.quotes.update((quotes) => [payload.new, ...quotes]);
      } else if (payload.eventType === 'DELETE') {
        this.quotes.update((quotes) => quotes.filter((q) => q.id !== payload.old.id));
      }
    });
  }

  async loadProjects() {
    try {
      const projects$ = this.projectsService.getProjects(false);
      const projs = await firstValueFrom(projects$);
      this.projects.set(projs);
    } catch (err) {
      console.error('Error loading projects for filter:', err);
    }
  }

  async onProjectFilterChange(projectId: string) {
    this.projectFilter.set(projectId);
    if (!projectId) {
      this.projectDocumentIds.set(null);
      return;
    }
    try {
      const docs = await this.projectsService.getDocumentIdsForProject(projectId, 'budget');
      this.projectDocumentIds.set(new Set(docs));
    } catch (err) {
      console.error('Error loading project document IDs:', err);
      this.projectDocumentIds.set(null);
    }
  }
}
