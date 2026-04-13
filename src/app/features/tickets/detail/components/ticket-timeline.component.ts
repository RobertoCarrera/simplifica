import { Component, Input } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

@Component({
  selector: 'app-ticket-timeline',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div
      class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-6"
    >
      <h3
        class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
      >
        <div
          class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400"
        >
          <i class="fas fa-history"></i>
        </div>
        Timeline
      </h3>
      <div
        class="relative border-l-2 border-gray-100 dark:border-gray-700 ml-3 space-y-6"
      >
        <!-- Creation -->
        <div class="ml-6 relative">
          <div
            class="absolute -left-[31px] bg-green-500 h-4 w-4 rounded-full border-4 border-white dark:border-gray-800"
          ></div>
          <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm">
            Ticket creado
          </h4>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ formatDate(ticket?.created_at) }}
          </p>
        </div>
        <!-- Last Update -->
        @if (ticket?.updated_at !== ticket?.created_at) {
          <div class="ml-6 relative">
            <div
              class="absolute -left-[31px] bg-blue-500 h-4 w-4 rounded-full border-4 border-white dark:border-gray-800"
            ></div>
            <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm">
              Última actualización
            </h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatDate(ticket?.updated_at) }}
            </p>
          </div>
        }
        @for (activity of recentActivity; track activity) {
          <div class="flex items-start space-x-3">
            <div
              class="flex-shrink-0 w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full mt-2"
            ></div>
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ activity.action }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(activity.created_at) }}
              </p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class TicketTimelineComponent {
  @Input() ticket: any = null;
  @Input() recentActivity: any[] = [];

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
