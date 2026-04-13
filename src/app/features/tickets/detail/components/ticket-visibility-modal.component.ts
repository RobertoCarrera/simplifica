import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-visibility-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div
        class="fixed inset-0 z-[100001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        (click)="cancel.emit()"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700"
          (click)="$event.stopPropagation()"
        >
          <div class="p-6">
            <div class="flex items-center gap-4 mb-4">
              <div
                class="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0"
              >
                <i
                  class="fas text-blue-600 dark:text-blue-400 text-xl"
                  [ngClass]="comment?.is_internal ? 'fa-eye' : 'fa-eye-slash'"
                ></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ title }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Confirmar cambio de visibilidad
                </p>
              </div>
            </div>
            <div
              class="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 mb-6 border border-gray-100 dark:border-gray-700"
            >
              <p class="text-sm text-gray-600 dark:text-gray-300">{{ message }}</p>
              @if (comment) {
                <div
                  class="mt-3 text-xs text-gray-500 dark:text-gray-500 italic border-l-2 border-gray-300 dark:border-gray-600 pl-3 line-clamp-2"
                >
                  "{{ getCommentPreview() }}"
                </div>
              }
            </div>
            <div class="flex items-center justify-end gap-3">
              <button
                (click)="cancel.emit()"
                class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                (click)="confirm.emit()"
                class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketVisibilityModalComponent {
  @Input() show = false;
  @Input() title = '';
  @Input() message = '';
  @Input() comment: any = null;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  getCommentPreview(): string {
    if (!this.comment?.comment) return '';
    return this.comment.comment.slice(0, 100);
  }
}
