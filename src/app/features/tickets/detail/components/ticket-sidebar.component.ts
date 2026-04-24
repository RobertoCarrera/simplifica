import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagManagerComponent } from '../../../../shared/components/tag-manager/tag-manager.component';

@Component({
  selector: 'app-ticket-sidebar',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, TagManagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4 sm:space-y-6">
      <!-- Tags Card -->
      @if (!isClient) {
        <div
          class="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow duration-300"
        >
          <div class="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div
              class="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 p-2 sm:p-3 rounded-lg shadow-md"
            >
              <i class="fas fa-tags text-lg sm:text-xl"></i>
            </div>
            <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ 'tickets.sidebar.etiquetas' | transloco }}
            </h3>
          </div>
          <app-tag-manager [entityId]="ticket.id" entityType="tickets"></app-tag-manager>
        </div>
      }

      <!-- Client Contact Card -->
      @if (!isClient) {
        <div
          class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-md border border-blue-200 dark:border-blue-700 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow duration-300"
        >
          <div class="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div class="bg-blue-500 text-white p-2 sm:p-3 rounded-lg shadow-md">
              <i class="fas fa-user text-lg sm:text-xl"></i>
            </div>
            <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ 'tickets.sidebar.cliente' | transloco }}
            </h3>
          </div>
          @if (ticket.client; as client) {
            <div>
              <div
                class="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-semibold mb-2 sm:mb-3"
              >
                {{ client.name }}
              </div>
              <div class="space-y-1.5 sm:space-y-2">
                @if (client.email) {
                  <div class="flex items-center gap-2 text-xs sm:text-sm">
                    <i class="fas fa-envelope text-blue-600 dark:text-blue-400 w-3 sm:w-4"></i>
                    <a
                      [href]="'mailto:' + client.email"
                      class="text-blue-600 dark:text-blue-400 hover:underline truncate"
                      >{{ client.email }}</a
                    >
                  </div>
                }
                @if (client.phone) {
                  <div class="flex items-center gap-2 text-xs sm:text-sm">
                    <i class="fas fa-phone text-blue-600 dark:text-blue-400 w-3 sm:w-4"></i>
                    <a
                      [href]="'tel:' + client.phone"
                      class="text-blue-600 dark:text-blue-400 hover:underline"
                      >{{ client.phone }}</a
                    >
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {{ 'tickets.sidebar.noClienteInfo' | transloco }}
            </div>
          }
          @if (ticket.client?.id) {
            <div class="mt-4 pt-3 border-t border-blue-200 dark:border-blue-700/50">
              <button
                (click)="viewDevices.emit()"
                class="w-full btn btn-sm bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-blue-300 dark:border-blue-800 transition-colors flex items-center justify-center gap-2"
              >
                <i class="fas fa-mobile-alt"></i>
                {{ 'tickets.sidebar.verDispositivos' | transloco }}
              </button>
            </div>
          }
        </div>
      }

      <!-- Quick Stats Card -->
      <div
        class="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 shadow-md border border-green-200 dark:border-green-700 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow duration-300"
      >
        <div class="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div class="bg-green-500 text-white p-2 sm:p-3 rounded-lg shadow-md">
            <i class="fas fa-chart-pie text-lg sm:text-xl"></i>
          </div>
          <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            {{ 'tickets.sidebar.resumen' | transloco }}
          </h3>
        </div>
        <div class="space-y-3 sm:space-y-4">
          <!-- Totals -->
          <div class="bg-white dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 shadow-sm">
            <div class="flex justify-between items-center">
              <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-400"
                >{{ 'tickets.sidebar.totalServicios' | transloco }}</span
              >
              <span
                class="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100"
                >{{ formatPrice(servicesTotal) }}</span
              >
            </div>
            <div
              class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700"
            >
              <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-400"
                >{{ 'tickets.sidebar.totalProductos' | transloco }}</span
              >
              <span
                class="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100"
                >{{ formatPrice(productsTotal) }}</span
              >
            </div>
          </div>
          <!-- Grand Total + Hours -->
          <div
            class="bg-white dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 shadow-sm border-2 border-green-500 dark:border-green-600"
          >
            <div class="flex justify-between items-center">
              <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300"
                >{{ 'tickets.sidebar.totalTicket' | transloco }}</span
              >
              <span class="text-gray-900 dark:text-gray-100 font-medium">
                {{ formatPrice(ticket.total_amount || servicesTotal) }}
              </span>
            </div>
            <div
              class="flex justify-between items-center text-sm border-t border-gray-100 dark:border-slate-600 pt-2"
            >
              <span class="text-gray-500 dark:text-gray-400">{{ 'tickets.sidebar.horasEstimadas' | transloco }}</span>
              <span class="font-medium text-gray-900 dark:text-gray-100"
                >{{ ticket.estimated_hours || 0 }}h</span
              >
            </div>
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-500 dark:text-gray-400">{{ 'tickets.sidebar.horasReales' | transloco }}</span>
              <span
                class="font-medium"
                [class.text-green-600]="actualHours <= (ticket.estimated_hours || 0)"
                [class.text-orange-500]="actualHours > (ticket.estimated_hours || 0)"
              >
                {{ actualHours }}h
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TicketSidebarComponent {
  @Input() ticket!: any;
  @Input() isClient = false;
  @Input() servicesTotal = 0;
  @Input() productsTotal = 0;
  @Input() actualHours = 0;

  @Output() viewDevices = new EventEmitter<void>();

  formatPrice(value: number): string {
    if (value == null) return '0,00 €';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }
}
