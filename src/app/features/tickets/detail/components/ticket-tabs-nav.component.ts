import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type TicketTab = 'comments' | 'services' | 'products' | 'devices';

@Component({
  selector: 'app-ticket-tabs-nav',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
    >
      <div
        class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-x-auto"
      >
        <!-- Comments Tab -->
        <button
          (click)="tabChange.emit('comments')"
          [class.active-tab]="activeTab === 'comments'"
          class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap"
        >
          <i class="fas fa-comments mr-1 sm:mr-2"></i>
          <span class="hidden xs:inline">Comentarios</span>
          <span class="xs:hidden">Comt.</span>
          @if (commentsCount > 0) {
            <span
              class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
            >
              {{ commentsCount }}
            </span>
          }
        </button>

        <!-- Services Tab -->
        <button
          (click)="tabChange.emit('services')"
          [class.active-tab]="activeTab === 'services'"
          class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap"
        >
          <i class="fas fa-wrench mr-1 sm:mr-2"></i>
          <span class="hidden xs:inline">Servicios</span>
          <span class="xs:hidden">Serv.</span>
          @if (servicesCount > 0) {
            <span
              class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            >
              {{ servicesCount }}
            </span>
          }
        </button>

        <!-- Products Tab -->
        <button
          (click)="tabChange.emit('products')"
          [class.active-tab]="activeTab === 'products'"
          class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap"
        >
          <i class="fas fa-box mr-1 sm:mr-2"></i>
          <span class="hidden xs:inline">Productos</span>
          <span class="xs:hidden">Prod.</span>
          @if (productsCount > 0) {
            <span
              class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
            >
              {{ productsCount }}
            </span>
          }
        </button>

        <!-- Devices Tab -->
        <button
          (click)="tabChange.emit('devices')"
          [class.active-tab]="activeTab === 'devices'"
          class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap"
        >
          <i class="fas fa-mobile-alt mr-1 sm:mr-2"></i>
          <span class="hidden xs:inline">Dispositivos</span>
          <span class="xs:hidden">Disp.</span>
          @if (devicesCount > 0) {
            <span
              class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            >
              {{ devicesCount }}
            </span>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .tab-button {
      color: #6b7280;
      border-bottom: 2px solid transparent;
    }
    .tab-button:hover {
      color: #374151;
      background: rgba(0,0,0,0.03);
    }
    :host(.dark) .tab-button:hover {
      color: #d1d5db;
      background: rgba(255,255,255,0.05);
    }
    .tab-button.active-tab {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
      background: rgba(59, 130, 246, 0.05);
    }
  `]
})
export class TicketTabsNavComponent {
  @Input() activeTab: TicketTab = 'comments';
  @Input() commentsCount = 0;
  @Input() servicesCount = 0;
  @Input() productsCount = 0;
  @Input() devicesCount = 0;

  @Output() tabChange = new EventEmitter<TicketTab>();
}
