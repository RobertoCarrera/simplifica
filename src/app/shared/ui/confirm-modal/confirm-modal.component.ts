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
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        [attr.aria-labelledby]="'cmt-title'"
        [attr.aria-describedby]="'cmt-msg'"
        (click)="onBackdropClick($event)">

        <!-- Blur overlay -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Panel -->
        <div
          class="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white dark:bg-gray-900 animate-modal"
          (click)="$event.stopPropagation()">

          <!-- Top accent bar -->
          <div class="h-1 w-full"
               [ngClass]="{
                 'bg-gradient-to-r from-blue-500 to-blue-600':   options().iconColor === 'blue'   || !options().iconColor,
                 'bg-gradient-to-r from-emerald-500 to-teal-500':  options().iconColor === 'green',
                 'bg-gradient-to-r from-rose-500 to-red-600':      options().iconColor === 'red',
                 'bg-gradient-to-r from-amber-400 to-orange-500':  options().iconColor === 'amber',
                 'bg-gradient-to-r from-purple-500 to-violet-600': options().iconColor === 'purple'
               }">
          </div>

          <!-- Body -->
          <div class="px-8 pt-8 pb-6 text-center">

            <!-- Icon -->
            @if (options().icon) {
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 shadow-inner"
                   [ngClass]="{
                     'bg-blue-50   dark:bg-blue-900/30':   options().iconColor === 'blue'   || !options().iconColor,
                     'bg-emerald-50 dark:bg-emerald-900/30': options().iconColor === 'green',
                     'bg-rose-50   dark:bg-rose-900/30':   options().iconColor === 'red',
                     'bg-amber-50  dark:bg-amber-900/30':  options().iconColor === 'amber',
                     'bg-purple-50 dark:bg-purple-900/30': options().iconColor === 'purple'
                   }">
                <i [class]="options().icon + ' text-2xl'"
                   [ngClass]="{
                     'text-blue-600   dark:text-blue-400':   options().iconColor === 'blue'   || !options().iconColor,
                     'text-emerald-600 dark:text-emerald-400': options().iconColor === 'green',
                     'text-rose-600   dark:text-rose-400':   options().iconColor === 'red',
                     'text-amber-600  dark:text-amber-400':  options().iconColor === 'amber',
                     'text-purple-600 dark:text-purple-400': options().iconColor === 'purple'
                   }"></i>
              </div>
            }

            <!-- Title -->
            <h3 id="cmt-title"
                class="text-lg font-bold tracking-tight text-gray-900 dark:text-white mb-2">
              {{ options().title }}
            </h3>

            <!-- Message -->
            <p id="cmt-msg"
               class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {{ options().message }}
            </p>
          </div>

          <!-- Footer -->
          <div class="flex gap-3 px-6 pb-6">
            @if (options().showCancel !== false) {
              <button
                type="button"
                (click)="cancel()"
                class="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-all duration-150">
                {{ options().cancelText || 'Cancelar' }}
              </button>
            }

            <button
              #confirmBtn
              type="button"
              (click)="confirm()"
              class="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-150 flex items-center justify-center gap-2"
              [ngClass]="{
                'bg-blue-600   hover:bg-blue-700   focus:ring-blue-500':   options().iconColor === 'blue'   || !options().iconColor,
                'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500': options().iconColor === 'green',
                'bg-rose-600   hover:bg-rose-700   focus:ring-rose-500':   options().iconColor === 'red',
                'bg-amber-500  hover:bg-amber-600  focus:ring-amber-400':  options().iconColor === 'amber',
                'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500': options().iconColor === 'purple'
              }">
              {{ options().confirmText || 'Confirmar' }}
              <i class="fas fa-arrow-right text-xs opacity-80"></i>
            </button>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes modal-in {
      from { opacity: 0; transform: scale(0.94) translateY(8px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);   }
    }
    .animate-modal {
      animation: modal-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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

  onBackdropClick(_event: Event): void {
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
