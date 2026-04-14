import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ticket-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-lg border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 lg:p-8 hover:shadow-xl transition-shadow duration-300"
    >
      <div class="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-4 sm:mb-6">
        <!-- Left: Icon + Title + Description -->
        <div class="flex-1">
          <div class="flex items-start sm:items-center gap-3 mb-3">
            <div
              class="bg-gradient-to-br from-orange-400 to-orange-600 text-white p-2 sm:p-3 rounded-lg shadow-md flex-shrink-0"
            >
              <i class="fas fa-ticket-alt text-xl sm:text-2xl"></i>
            </div>
            <div class="flex-1 min-w-0">
              <h1
                class="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 break-words"
              >
                {{ ticket.title }}
              </h1>
              <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span class="font-mono font-semibold">#{{ ticket.ticket_number }}</span>
                <span class="mx-2">•</span>
                <span class="hidden sm:inline">Creado {{ formatDate(ticket.created_at) }}</span>
              </p>
            </div>
          </div>
          <div
            class="ticket-description mt-4 ml-0 sm:ml-1 text-gray-800 dark:text-gray-200 text-sm leading-relaxed"
            [innerHTML]="formatDescription(ticket.description)"
            (click)="descriptionClick.emit($event)"
          ></div>
        </div>

        <!-- Right: Priority + Assignment -->
        <div class="flex flex-row lg:flex-col items-center lg:items-end gap-2 sm:gap-3">
          <span
            [class]="getPriorityClasses(ticket.priority)"
            class="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm"
          >
            <i class="fas {{ getPriorityIcon(ticket.priority) }}"></i>
            <span class="hidden sm:inline">{{ getPriorityLabel(ticket.priority) }}</span>
          </span>

          @if (!isClient) {
            <div class="ml-0 lg:ml-4">
              <select
                [ngModel]="ticket.assigned_to"
                (ngModelChange)="assign.emit($event)"
                class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
              >
                <option [ngValue]="null">Sin Asignar</option>
                @for (user of staffUsers; track user) {
                  <option [ngValue]="user.id">{{ user.name }}</option>
                }
              </select>
            </div>
          }
        </div>
      </div>

      <!-- Progress Section -->
      <div
        class="mt-6 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          <span class="flex items-center gap-2">
            <i class="fas fa-chart-line text-blue-500"></i>
            Progreso del Ticket
          </span>
          <span class="text-lg font-bold" [style.color]="currentStageColor"
            >{{ progressPercent | number: '1.0-0' }}%</span
          >
        </div>
        <div class="relative">
          <!-- Progress Bar Background -->
          <div
            class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative overflow-hidden shadow-inner"
          >
            <div
              class="h-4 rounded-full transition-all duration-500 ease-out"
              [style.width.%]="progressPercent"
              [style.background]="currentStageColor"
            ></div>
            <!-- Stage Markers -->
            @for (stage of allStages; track stage; let i = $index) {
              <div
                class="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 z-10"
                [style.left.%]="getStagePosition(i)"
              >
                <div
                  class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-sm cursor-pointer hover:scale-125 transition-all duration-300"
                  [title]="stage.name"
                  (click)="!isClient && stageClick.emit(stage.id)"
                  [class]="getStageMarkerClass(stage)"
                >
                  @if (isStageCompleted(stage)) {
                    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
                  }
                </div>
              </div>
            }
          </div>
          <!-- Stage Labels -->
          <div class="flex justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
            @for (stage of visibleStages; track stage; let i = $index) {
              <div
                class="text-center flex-1 transition-all duration-200"
                [class.font-semibold]="stage.id === ticket.stage_id"
                [class.text-blue-600]="stage.id === ticket.stage_id"
                [class.dark:text-blue-400]="stage.id === ticket.stage_id"
                [class.scale-105]="stage.id === ticket.stage_id"
              >
                {{ stage.name }}
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TicketHeaderComponent {
  @Input() ticket!: any;
  @Input() isClient = false;
  @Input() staffUsers: { id: string; name: string }[] = [];
  @Input() allStages: any[] = [];
  @Input() progressPercent = 0;
  @Input() currentStageColor = '#6366f1';
  @Input() visibleStages: any[] = [];

  @Output() descriptionClick = new EventEmitter<MouseEvent>();
  @Output() assign = new EventEmitter<string>();
  @Output() stageClick = new EventEmitter<string>();

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDescription(html: string): string {
    if (!html) return '';
    // Basic sanitization - in production use DOMPurify
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || html;
  }

  getPriorityClasses(priority: string): string {
    const base = 'inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm';
    switch ((priority || 'medium').toLowerCase()) {
      case 'high': case 'alta': case 'high_impact':
        return base + ' bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'medium': case 'media':
        return base + ' bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'low': case 'baja':
        return base + ' bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return base + ' bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getPriorityIcon(priority: string): string {
    switch ((priority || 'medium').toLowerCase()) {
      case 'high': case 'alta': case 'high_impact': return 'fa-exclamation-circle';
      case 'low': case 'baja': return 'fa-arrow-down';
      default: return 'fa-equals';
    }
  }

  getPriorityLabel(priority: string): string {
    switch ((priority || 'medium').toLowerCase()) {
      case 'high': case 'alta': case 'high_impact': return 'Alta';
      case 'low': case 'baja': return 'Baja';
      default: return 'Media';
    }
  }

  getStagePosition(index: number): number {
    if (this.allStages.length <= 1) return 50;
    return (index / (this.allStages.length - 1)) * 100;
  }

  isStageCompleted(stage: any): boolean {
    const currentIdx = this.allStages.findIndex(s => s.id === this.ticket?.stage_id);
    const stageIdx = this.allStages.indexOf(stage);
    return stageIdx < currentIdx;
  }

  getStageMarkerClass(stage: any): string {
    const isCurrent = stage.id === this.ticket?.stage_id;
    const completed = this.isStageCompleted(stage);
    const base = 'w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-sm cursor-pointer hover:scale-125 transition-all duration-300';
    if (isCurrent) {
      return base + ' ring-4 ring-blue-400/50';
    }
    if (completed) {
      return base + ' bg-green-500 border-green-300 dark:border-green-700';
    }
    return base + ' bg-gray-300 dark:bg-gray-600';
  }
}
