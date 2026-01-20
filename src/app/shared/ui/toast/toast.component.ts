import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../services/toast.service';
import { Toast } from '../../../models/toast.interface';
import { AnimationService } from '../../../services/animation.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  animations: [AnimationService.toastNotification],
  template: `
    <div class="fixed top-4 right-4 z-50 space-y-3 max-w-sm">
      @for (toast of toastService.toasts$(); track toast.id) {
        <div 
          @toastNotification
          class="flex items-start p-4 rounded-lg shadow-lg backdrop-blur-sm border transition-all duration-300"
          [ngClass]="getToastClasses(toast.type)">
          
          <!-- Icon -->
          <div class="flex-shrink-0 mr-3">
            <div class="w-6 h-6 rounded-full flex items-center justify-center"
                 [ngClass]="getIconClasses(toast.type)">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                @switch (toast.type) {
                  @case ('success') {
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  }
                  @case ('error') {
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                  }
                  @case ('warning') {
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                  }
                  @case ('info') {
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                  }
                }
              </svg>
            </div>
          </div>
          
          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white">
              {{ toast.title }}
            </div>
            <div class="mt-1 text-sm text-gray-500 dark:text-gray-300">
              {{ toast.message }}
            </div>
            <!-- Optional progress bar -->
            <div *ngIf="toast.progress !== undefined" class="mt-2">
              <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-2 bg-blue-500 dark:bg-blue-400 transition-all duration-300"
                     [style.width]="progressWidth(toast)">
                </div>
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {{ (progressPct(toast) | number:'1.0-0') }}%
              </div>
            </div>
          </div>
          
          <!-- Close button -->
          <div class="flex-shrink-0 ml-4">
            <button
              (click)="toastService.removeToast(toast.id)"
              class="inline-flex text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-indigo-500 dark:focus:ring-offset-gray-800">
              <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Success */
    .toast-success {
      @apply bg-green-50 border-green-200 dark:bg-green-900 dark:border-green-700;
    }
    .icon-success {
      @apply bg-green-100 text-green-600 dark:bg-green-800 dark:text-green-200;
    }
    
    /* Error */
    .toast-error {
      @apply bg-red-50 border-red-200 dark:bg-red-900 dark:border-red-700;
    }
    .icon-error {
      @apply bg-red-100 text-red-600 dark:bg-red-800 dark:text-red-200;
    }
    
    /* Warning */
    .toast-warning {
      @apply bg-yellow-50 border-yellow-200 dark:bg-yellow-900 dark:border-yellow-700;
    }
    .icon-warning {
      @apply bg-yellow-100 text-yellow-600 dark:bg-yellow-800 dark:text-yellow-200;
    }
    
    /* Info */
    .toast-info {
      @apply bg-blue-50 border-blue-200 dark:bg-blue-900 dark:border-blue-700;
    }
    .icon-info {
      @apply bg-blue-100 text-blue-600 dark:bg-blue-800 dark:text-blue-200;
    }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  removeToast(id: string): void {
    this.toastService.removeToast(id);
  }

  getToastClasses(type: Toast['type']): string {
    const classes = {
      success: 'toast-success',
      error: 'toast-error',
      warning: 'toast-warning',
      info: 'toast-info'
    };
    return classes[type];
  }

  getIconClasses(type: Toast['type']): string {
    const classes = {
      success: 'icon-success',
      error: 'icon-error',
      warning: 'icon-warning',
      info: 'icon-info'
    };
    return classes[type];
  }

  // Helpers for progress rendering
  progressPct(toast: Toast): number {
    const v = typeof toast.progress === 'number' ? toast.progress : 0;
    const clamped = Math.max(0, Math.min(1, v));
    return clamped * 100;
  }

  progressWidth(toast: Toast): string {
    return this.progressPct(toast) + '%';
  }
}
