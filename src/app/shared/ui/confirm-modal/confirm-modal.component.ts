import { Component, signal, OnDestroy, HostListener, ViewChild, ElementRef, effect } from '@angular/core';
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
      <div class="confirm-overlay"
           role="alertdialog"
           aria-modal="true"
           aria-labelledby="confirm-modal-title"
           aria-describedby="confirm-modal-message"
           (click)="onBackdropClick($event)">
        <div class="confirm-panel"
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
            
            <h3 id="confirm-modal-title" class="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {{ options().title }}
            </h3>
            <p id="confirm-modal-message" class="text-gray-600 dark:text-gray-400">
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
              #confirmBtn
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
      display: block;
    }

    .confirm-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
    }

    .confirm-panel {
      background: white;
      border-radius: 1rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      width: 100%;
      max-width: 28rem;
      transform-origin: center;
      animation: modal-appear 0.2s ease-out forwards;
    }

    :host-context(.dark) .confirm-panel {
      background: #1e293b;
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
  `]
})
export class ConfirmModalComponent implements OnDestroy {
  visible = signal(false);
  options = signal<ConfirmModalOptions>({
    title: 'Confirmar',
    message: '¿Estás seguro?',
    iconColor: 'blue'
  });

  @ViewChild('confirmBtn') confirmBtn?: ElementRef;

  private resolvePromise: ((value: boolean) => void) | null = null;
  private originalParent: HTMLElement | null = null;

  private gradients: Record<string, string> = {
    blue: 'linear-gradient(to right, #3b82f6, #6366f1)',
    green: 'linear-gradient(to right, #22c55e, #10b981)',
    red: 'linear-gradient(to right, #ef4444, #f43f5e)',
    amber: 'linear-gradient(to right, #f59e0b, #f97316)',
    purple: 'linear-gradient(to right, #a855f7, #8b5cf6)'
  };

  constructor(private el: ElementRef) {
    effect(() => {
      if (this.visible()) {
        setTimeout(() => this.confirmBtn?.nativeElement.focus(), 50);
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.visible() && !this.options().preventCloseOnBackdrop) {
      this.cancel();
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.moveBack();
  }

  getButtonGradient(): string {
    const color = this.options().iconColor || 'blue';
    return this.gradients[color] || this.gradients['blue'];
  }

  /**
   * Open the modal. Physically moves this element to document.body
   * to escape any parent CSS stacking context.
   */
  open(options: ConfirmModalOptions): Promise<boolean> {
    this.options.set({
      ...options,
      iconColor: options.iconColor || 'blue'
    });

    // Move to document.body to escape any CSS stacking context
    this.moveToBody();

    this.visible.set(true);
    document.body.style.overflow = 'hidden';

    return new Promise<boolean>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  confirm(): void {
    this.visible.set(false);
    document.body.style.overflow = '';
    this.moveBack();
    if (this.resolvePromise) {
      this.resolvePromise(true);
      this.resolvePromise = null;
    }
  }

  cancel(): void {
    this.visible.set(false);
    document.body.style.overflow = '';
    this.moveBack();
    if (this.resolvePromise) {
      this.resolvePromise(false);
      this.resolvePromise = null;
    }
  }

  onBackdropClick(event: Event): void {
    if (!this.options().preventCloseOnBackdrop) {
      this.cancel();
    }
  }

  /** Move host element to document.body */
  private moveToBody(): void {
    const hostEl = this.el.nativeElement;
    if (hostEl.parentNode !== document.body) {
      this.originalParent = hostEl.parentNode;
      document.body.appendChild(hostEl);
    }
  }

  /** Move host element back to its original parent */
  private moveBack(): void {
    const hostEl = this.el.nativeElement;
    if (this.originalParent && hostEl.parentNode === document.body) {
      this.originalParent.appendChild(hostEl);
      this.originalParent = null;
    }
  }
}
