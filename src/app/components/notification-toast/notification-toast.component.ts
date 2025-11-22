import { Component, signal, computed, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';
// Deprecated NotificationService removed; using native Notification API

@Component({
  selector: 'app-notification-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Toast Container -->
    <div class="toast-container fixed top-4 right-4 z-50 space-y-3">
      @for (toast of toasts(); track toast.id) {
        <div 
          class="toast-item bg-white rounded-lg shadow-lg border overflow-hidden min-w-[320px] max-w-md transform transition-all duration-300 ease-in-out"
          [class.slide-in]="true"
          [ngClass]="{
            'border-blue-200 bg-blue-50': toast.type === 'info',
            'border-green-200 bg-green-50': toast.type === 'success',
            'border-yellow-200 bg-yellow-50': toast.type === 'warning',
            'border-red-200 bg-red-50': toast.type === 'error'
          }">
          
          <div class="p-4">
            <div class="flex items-start">
              <!-- Icon -->
              <div 
                class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center mr-3"
                [ngClass]="{
                  'bg-blue-500 text-white': toast.type === 'info',
                  'bg-green-500 text-white': toast.type === 'success',
                  'bg-yellow-500 text-white': toast.type === 'warning',
                  'bg-red-500 text-white': toast.type === 'error'
                }">
                <i 
                  class="text-lg"
                  [ngClass]="{
                    'bi-info-circle': toast.type === 'info',
                    'bi-check-circle': toast.type === 'success',
                    'bi-exclamation-triangle': toast.type === 'warning',
                    'bi-x-circle': toast.type === 'error'
                  }"></i>
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-semibold text-gray-900 mb-1">
                  {{ toast.title }}
                </h4>
                <p class="text-sm text-gray-700">
                  {{ toast.message }}
                </p>
              </div>

              <!-- Close Button -->
              <button 
                (click)="removeToast(toast.id)"
                class="flex-shrink-0 ml-2 p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <i class="bi bi-x text-lg"></i>
              </button>
            </div>

            <!-- Progress Bar -->
            @if (toast.duration > 0) {
              <div class="mt-3 bg-gray-200 rounded-full h-1">
                <div 
                  class="h-1 rounded-full transition-all duration-100 ease-linear"
                  [ngClass]="{
                    'bg-blue-500': toast.type === 'info',
                    'bg-green-500': toast.type === 'success',
                    'bg-yellow-500': toast.type === 'warning',
                    'bg-red-500': toast.type === 'error'
                  }"
                  [style.width.%]="getProgressPercentage(toast.id)">
                </div>
              </div>
            }
          </div>
        </div>
      }
    </div>

    <!-- Notification Permission Banner -->
    @if (showPermissionBanner()) {
      <div class="permission-banner fixed bottom-4 right-4 bg-blue-600 text-white rounded-lg shadow-lg p-4 max-w-sm z-50">
        <div class="flex items-start">
          <div class="flex-shrink-0">
            <i class="bi bi-bell text-xl"></i>
          </div>
          <div class="ml-3 flex-1">
            <h4 class="text-sm font-medium mb-1">Habilitar notificaciones</h4>
            <p class="text-xs text-blue-100 mb-3">
              Permite recibir notificaciones del sistema para mantenerte al día.
            </p>
            <div class="flex space-x-2">
              <button 
                (click)="requestPermission()"
                class="text-xs bg-white text-blue-600 px-3 py-1 rounded font-medium hover:bg-blue-50 transition-colors">
                Permitir
              </button>
              <button 
                (click)="dismissPermissionBanner()"
                class="text-xs text-blue-100 hover:text-white transition-colors">
                Ahora no
              </button>
            </div>
          </div>
          <button 
            (click)="dismissPermissionBanner()"
            class="flex-shrink-0 ml-2 text-blue-100 hover:text-white">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .toast-container {
      pointer-events: none;
    }

    .toast-item {
      pointer-events: auto;
    }

    .slide-in {
      animation: slideInRight 0.3s ease-out;
    }

    .slide-out {
      animation: slideOutRight 0.3s ease-in;
    }

    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }

    .permission-banner {
      animation: slideInUp 0.3s ease-out;
    }

    @keyframes slideInUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `]
})
export class NotificationToastComponent implements OnInit, OnDestroy {
  private toastService = inject(ToastService);
  // NotificationService injection removed

  // Reactive state
  readonly toasts = this.toastService.toasts$;

  // Permission banner state
  readonly showPermissionBanner = signal(false);
  private permissionDismissed = signal(false);

  // Toast progress tracking
  private progressIntervals = new Map<string, NodeJS.Timeout>();
  private progressPercentages = signal<Record<string, number>>({});

  ngOnInit(): void {
    this.checkNotificationPermission();

    // Track toast progress
    this.toasts().forEach(toast => {
      if (toast.duration > 0) {
        this.startProgressTracking(toast.id, toast.duration);
      }
    });
  }

  ngOnDestroy(): void {
    // Clear all progress intervals
    this.progressIntervals.forEach(interval => clearInterval(interval));
  }

  removeToast(id: string): void {
    // Clear progress interval
    const interval = this.progressIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.progressIntervals.delete(id);
    }

    // Remove from progress tracking
    this.progressPercentages.update(current => {
      const updated = { ...current };
      delete updated[id];
      return updated;
    });

    this.toastService.removeToast(id);
  }

  getProgressPercentage(toastId: string): number {
    return this.progressPercentages()[toastId] || 100;
  }

  private startProgressTracking(toastId: string, duration: number): void {
    const startTime = Date.now();
    const updateInterval = 50; // Update every 50ms for smooth animation

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const percentage = Math.max(0, 100 - (elapsed / duration) * 100);

      this.progressPercentages.update(current => ({
        ...current,
        [toastId]: percentage
      }));

      if (percentage <= 0) {
        clearInterval(interval);
        this.progressIntervals.delete(toastId);
      }
    }, updateInterval);

    this.progressIntervals.set(toastId, interval);
  }

  private checkNotificationPermission(): void {
    if ('Notification' in window) {
      const permission = Notification.permission;

      // Show banner if permission is not granted and not dismissed
      if (permission === 'default' && !this.permissionDismissed()) {
        setTimeout(() => {
          this.showPermissionBanner.set(true);
        }, 2000); // Show after 2 seconds
      }
    }
  }

  async requestPermission(): Promise<void> {
    const granted = await Notification.requestPermission();

    if (granted) {
      this.showPermissionBanner.set(false);

      // Show success toast
      this.toastService.success(
        'Notificaciones habilitadas',
        'Ahora recibirás notificaciones del sistema'
      );
    } else {
      // Show error toast
      this.toastService.error(
        'Permiso denegado',
        'No se pudieron habilitar las notificaciones'
      );
    }
  }

  dismissPermissionBanner(): void {
    this.showPermissionBanner.set(false);
    this.permissionDismissed.set(true);

    // Remember dismissal in localStorage
    try {
      localStorage.setItem('simplifica_notification_permission_dismissed', 'true');
    } catch (error) {
      console.warn('Could not save permission dismissal:', error);
    }
  }

  private loadPermissionDismissal(): void {
    try {
      const dismissed = localStorage.getItem('simplifica_notification_permission_dismissed') === 'true';
      this.permissionDismissed.set(dismissed);
    } catch (error) {
      console.warn('Could not load permission dismissal:', error);
    }
  }
}
