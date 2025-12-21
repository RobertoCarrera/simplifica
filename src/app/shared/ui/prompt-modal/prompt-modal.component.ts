import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface PromptModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  multiline?: boolean;
}

@Component({
  selector: 'app-prompt-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (visible()) {
      <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all animate-modal-appear"
             (click)="$event.stopPropagation()">
          
          <div class="p-6">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {{ options().title }}
            </h3>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ options().message }}
            </p>

            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {{ options().inputLabel || 'Comentario' }}
              </label>
              @if (options().multiline) {
                <textarea
                  [(ngModel)]="inputValue"
                  [placeholder]="options().inputPlaceholder || ''"
                  rows="3"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                ></textarea>
              } @else {
                <input
                  type="text"
                  [(ngModel)]="inputValue"
                  [placeholder]="options().inputPlaceholder || ''"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              }
            </div>
          </div>

          <div class="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-b-2xl flex flex-col-reverse sm:flex-row gap-3">
            <button 
              (click)="cancel()"
              class="flex-1 py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-gray-700 dark:text-white font-medium rounded-xl transition-all duration-200">
              {{ options().cancelText || 'Cancelar' }}
            </button>
            <button 
              (click)="confirm()"
              class="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200">
              {{ options().confirmText || 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }
    @keyframes modal-appear {
      from { opacity: 0; transform: scale(0.95) translateY(-10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .animate-modal-appear { animation: modal-appear 0.2s ease-out forwards; }
  `]
})
export class PromptModalComponent {
  visible = signal(false);
  options = signal<PromptModalOptions>({
    title: 'Input',
    message: 'Please enter a value'
  });
  inputValue: string = '';

  private resolvePromise: ((value: string | null) => void) | null = null;

  open(options: PromptModalOptions): Promise<string | null> {
    console.log('PromptModal opened', options);
    this.options.set(options);
    this.inputValue = '';
    this.visible.set(true);
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  confirm(): void {
    console.log('PromptModal confirmed with value:', this.inputValue);
    this.visible.set(false);
    if (this.resolvePromise) {
      this.resolvePromise(this.inputValue);
      this.resolvePromise = null;
    }
  }

  cancel(): void {
    this.visible.set(false);
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }
  }
}
