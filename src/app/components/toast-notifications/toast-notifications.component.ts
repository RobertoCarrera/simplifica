import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnimationService } from '../../services/animation.service';
import { NotificationService } from '../../services/notification.service';
import { ToastMessage } from '../../models/toast-message';

@Component({
  selector: 'app-toast-notifications',
  standalone: true,
  imports: [CommonModule],
  animations: [AnimationService.toastNotification],
  template: `
    <div class="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      <div
        *ngFor="let toast of notificationService.toasts$(); trackBy: trackByToastId"
        @toastNotification
        class="toast-container"
        [ngClass]="getToastClasses(toast.type)">
        
        <!-- Toast Icon -->
        <div class="flex-shrink-0">
          <div class="toast-icon">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <!-- Success -->
              <path *ngIf="toast.type === 'success'" 
                    d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              <!-- Error -->
              <path *ngIf="toast.type === 'error'" 
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              <!-- Warning -->
              <path *ngIf="toast.type === 'warning'" 
                    d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              <!-- Info -->
              <path *ngIf="toast.type === 'info'" 
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
          </div>
        </div>

        <!-- Toast Content -->
        <div class="flex-1 ml-3">
          <div class="toast-title">{{ toast.title }}</div>
          <div class="toast-message">{{ toast.message }}</div>
        </div>

        <!-- Close Button -->
        <div class="flex-shrink-0 ml-4">
          <button
            (click)="notificationService.removeToast(toast.id)"
            class="toast-close-btn">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      @apply flex items-start p-4 rounded-lg shadow-lg backdrop-blur-sm border;
      max-width: 384px;
      width: 100%;
    }

    .toast-icon {
      @apply w-8 h-8 rounded-full flex items-center justify-center;
    }

    .toast-title {
      @apply text-sm font-semibold;
    }

    .toast-message {
      @apply text-sm mt-1 opacity-90;
    }

    .toast-close-btn {
      @apply p-1 rounded-md hover:bg-black hover:bg-opacity-10 transition-colors duration-200;
    }

    /* Success Toast */
    .toast-success {
      @apply bg-green-50 border-green-200 text-green-800;
    }
    .toast-success .toast-icon {
      @apply bg-green-100 text-green-600;
    }

    /* Error Toast */
    .toast-error {
      @apply bg-red-50 border-red-200 text-red-800;
    }
    .toast-error .toast-icon {
      @apply bg-red-100 text-red-600;
    }

    /* Warning Toast */
    .toast-warning {
      @apply bg-yellow-50 border-yellow-200 text-yellow-800;
    }
    .toast-warning .toast-icon {
      @apply bg-yellow-100 text-yellow-600;
    }

    /* Info Toast */
    .toast-info {
      @apply bg-blue-50 border-blue-200 text-blue-800;
    }
    .toast-info .toast-icon {
      @apply bg-blue-100 text-blue-600;
    }

    /* Dark theme support */
    .dark .toast-success {
      @apply bg-green-900 border-green-700 text-green-100;
    }
    .dark .toast-success .toast-icon {
      @apply bg-green-800 text-green-200;
    }

    .dark .toast-error {
      @apply bg-red-900 border-red-700 text-red-100;
    }
    .dark .toast-error .toast-icon {
      @apply bg-red-800 text-red-200;
    }

    .dark .toast-warning {
      @apply bg-yellow-900 border-yellow-700 text-yellow-100;
    }
    .dark .toast-warning .toast-icon {
      @apply bg-yellow-800 text-yellow-200;
    }

    .dark .toast-info {
      @apply bg-blue-900 border-blue-700 text-blue-100;
    }
    .dark .toast-info .toast-icon {
      @apply bg-blue-800 text-blue-200;
    }
  `]
})
export class ToastNotificationsComponent {
  notificationService = inject(NotificationService);

  trackByToastId(index: number, toast: ToastMessage): string {
    return toast.id;
  }

  getToastClasses(type: ToastMessage['type']): string {
    const baseClasses = 'toast-container';
    const typeClasses = {
      success: 'toast-success',
      error: 'toast-error',
      warning: 'toast-warning',
      info: 'toast-info'
    };
    return `${baseClasses} ${typeClasses[type]}`;
  }
}
