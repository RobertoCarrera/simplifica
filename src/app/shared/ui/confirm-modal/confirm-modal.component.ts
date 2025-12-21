import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  iconColor?: 'blue' | 'green' | 'red' | 'amber' | 'purple';
  showCancel?: boolean;
  preventCloseOnBackdrop?: boolean;
}

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible()) {
      <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
           (click)="onBackdropClick($event)">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all animate-modal-appear"
             (click)="$event.stopPropagation()">
          
          <!-- Header with Icon -->
          <div class="p-6 text-center">
            @if (options().icon) {
              <div class="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
                   [ngClass]="{
                     'bg-blue-100 dark:bg-blue-900/30': options().iconColor === 'blue',
                     'bg-green-100 dark:bg-green-900/30': options().iconColor === 'green',
                     'bg-red-100 dark:bg-red-900/30': options().iconColor === 'red',
                     'bg-amber-100 dark:bg-amber-900/30': options().iconColor === 'amber',
                     'bg-purple-100 dark:bg-purple-900/30': options().iconColor === 'purple'
                   }">
                <i [class]="options().icon + ' text-2xl'"
                   [ngClass]="{
                     'text-blue-600 dark:text-blue-400': options().iconColor === 'blue',
                     'text-green-600 dark:text-green-400': options().iconColor === 'green',
                     'text-red-600 dark:text-red-400': options().iconColor === 'red',
                     'text-amber-600 dark:text-amber-400': options().iconColor === 'amber',
                     'text-purple-600 dark:text-purple-400': options().iconColor === 'purple'
                   }"></i>
              </div>
            }
            
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {{ options().title }}
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              {{ options().message }}
            </p>
          </div>

          <!-- Actions -->
          <div class="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-b-2xl flex flex-col-reverse sm:flex-row gap-3">
            @if (options().showCancel !== false) {
              <button 
                (click)="cancel()"
                class="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-gray-700 dark:text-white font-medium rounded-xl transition-all duration-200">
                {{ options().cancelText || 'Cancelar' }}
              </button>
            }
            <button 
              (click)="confirm()"
              class="flex-1 py-3.5 px-4 font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-white"
              [style.background]="getButtonGradient()">
              {{ options().confirmText || 'Confirmar' }}
              <i class="fas fa-arrow-right text-sm"></i>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: contents;
    }
    
    @keyframes modal-appear {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .animate-modal-appear {
      animation: modal-appear 0.2s ease-out forwards;
    }
  `]
})
export class ConfirmModalComponent {
  visible = signal(false);
  options = signal<ConfirmModalOptions>({
    title: 'Confirmar',
    message: '¿Estás seguro?',
    iconColor: 'blue'
  });

  private resolvePromise: ((value: boolean) => void) | null = null;

  // Gradient colors for CTA button
  private gradients: Record<string, string> = {
    blue: 'linear-gradient(to right, #3b82f6, #6366f1)',
    green: 'linear-gradient(to right, #22c55e, #10b981)',
    red: 'linear-gradient(to right, #ef4444, #f43f5e)',
    amber: 'linear-gradient(to right, #f59e0b, #f97316)',
    purple: 'linear-gradient(to right, #a855f7, #8b5cf6)'
  };

  getButtonGradient(): string {
    const color = this.options().iconColor || 'blue';
    return this.gradients[color] || this.gradients['blue'];
  }

  /**
   * Open the modal and return a promise that resolves to true (confirm) or false (cancel)
   */
  open(options: ConfirmModalOptions): Promise<boolean> {
    this.options.set({
      ...options,
      iconColor: options.iconColor || 'blue'
    });
    this.visible.set(true);

    return new Promise<boolean>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  confirm(): void {
    this.visible.set(false);
    if (this.resolvePromise) {
      this.resolvePromise(true);
      this.resolvePromise = null;
    }
  }

  cancel(): void {
    this.visible.set(false);
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.resolvePromise = null;
    }
  }

  onBackdropClick(event: Event): void {
    // Clicking outside cancels (unless prevented)
    if (!this.options().preventCloseOnBackdrop) {
      this.cancel();
    }
  }
}
