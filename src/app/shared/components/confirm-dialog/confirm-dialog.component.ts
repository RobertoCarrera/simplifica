import { Component, EventEmitter, Input, Output, AfterContentInit, ContentChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in border border-gray-100 dark:border-gray-700"
        >
          <!-- Icon/Header -->
          <div class="mb-4 flex items-center gap-3">
            <div
              [ngClass]="{
                'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400': type === 'danger',
                'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400': type === 'info',
                'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400':
                  type === 'warning',
                'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400':
                  type === 'success',
              }"
              class="p-3 rounded-full shrink-0"
            >
              @if (type === 'danger') {
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              }
              @if (type === 'warning') {
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6"
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
              }
              @if (type === 'info' || type === 'success') {
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6"
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
              }
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ title }}</h3>
          </div>
          <!-- Body: prefer projected content (rich layout), fall back to message string -->
          <div class="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
            <ng-content></ng-content>
            @if (!hasProjectedContent) {
              <p>{{ message }}</p>
            }
          </div>
          <!-- Actions -->
          <div class="flex justify-end gap-3">
            <button
              (click)="onCancel()"
              class="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              {{ cancelText }}
            </button>
            <button
              (click)="onConfirm()"
              [ngClass]="{
                'bg-red-600 hover:bg-red-700 text-white shadow-red-500/30': type === 'danger',
                'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30': type === 'info',
                'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/30':
                  type === 'warning',
                'bg-green-600 hover:bg-green-700 text-white shadow-green-500/30':
                  type === 'success',
              }"
              class="px-4 py-2 rounded-lg shadow-lg transition-all font-medium flex items-center gap-2"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes scaleIn {
        from {
          transform: scale(0.95);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
      .animate-fade-in {
        animation: fadeIn 0.2s ease-out;
      }
      .animate-scale-in {
        animation: scaleIn 0.2s ease-out;
      }
    `,
  ],
})
export class ConfirmDialogComponent implements AfterContentInit {
  @Input() isOpen = false;
  @Input() title = 'Confirmar acción';
  @Input() message = '¿Estás seguro de que deseas continuar?';
  @Input() confirmText = 'Confirmar';
  @Input() cancelText = 'Cancelar';
  @Input() type: 'danger' | 'info' | 'warning' | 'success' = 'danger';

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  /**
   * Reference to any projected content the consumer passes via
   * `<app-confirm-dialog>...</app-confirm-dialog>`. When this is present we
   * hide the default `[message]` paragraph and show the rich content instead.
   */
  @ContentChild('confirmBody') contentChildRef: any;

  /**
   * Set to `true` when the consumer provides rich body content via
   * `<ng-content>` projection. Used to decide whether to render the plain
   * `[message]` string as a fallback.
   */
  hasProjectedContent = false;

  ngAfterContentInit(): void {
    // AfterContentInit fires once the projected DOM is available. We treat
    // any non-empty projection as "consumer provided custom content" and
    // skip the default message rendering. The check is intentionally simple
    // (truthy `any` template ref) — we don't need a strict check here.
    this.hasProjectedContent = !!this.contentChildRef;
  }

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}
