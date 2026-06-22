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
  selector: 'app-subtask-overdue-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        (click)="onCancel()"
      >
        <!-- Modal -->
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="bg-red-50 dark:bg-red-900/20 px-6 py-4 border-b border-red-100 dark:border-red-800">
            <div class="flex items-center space-x-3">
              <div class="flex-shrink-0 h-10 w-10 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600 dark:text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-red-800 dark:text-red-200">Subtarea Vencida</h3>
                <p class="text-sm text-red-600 dark:text-red-400">{{ subtaskTitle }}</p>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="px-6 py-4 space-y-4">
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p class="text-sm text-amber-800 dark:text-amber-200">
                <strong>Fecha de vencimiento:</strong> {{ formatDate(currentDueDate) }}
              </p>
              <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Esta subtarea ha superado su fecha límite y requiere justificación para continuar.
              </p>
            </div>

            <!-- Justification -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ¿Por qué se ha vencido? *
              </label>
              <textarea
                [(ngModel)]="justification"
                rows="3"
                placeholder="Explica el motivo del retraso..."
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              ></textarea>
            </div>

            <!-- New Due Date -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nueva fecha de finalización *
              </label>
              <input
                type="date"
                [(ngModel)]="newDueDate"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 bg-gray-50 dark:bg-gray-800/50">
            <button
              (click)="onCancel()"
              class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              (click)="onConfirm()"
              [disabled]="!isValid || isSaving"
              class="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              @if (isSaving) {
                <span class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
              }
              Justificar y Actualizar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SubtaskOverdueModalComponent {
  @Input() visible = false;
  @Input() subtaskTitle = '';
  @Input() currentDueDate = '';
  @Input() isSaving = false;

  @Output() confirm = new EventEmitter<{ justification: string; newDueDate: string }>();
  @Output() cancel = new EventEmitter<void>();

  justification = '';
  newDueDate = '';

  get isValid(): boolean {
    return this.justification.trim().length > 0 && !!this.newDueDate;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return 'No establecida';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  onConfirm(): void {
    if (!this.isValid) return;
    this.confirm.emit({
      justification: this.justification.trim(),
      newDueDate: this.newDueDate,
    });
    // Reset form
    this.justification = '';
    this.newDueDate = '';
  }

  onCancel(): void {
    this.justification = '';
    this.newDueDate = '';
    this.cancel.emit();
  }
}
