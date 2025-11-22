import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { NotificationStore } from '../../stores/notification.store';
import { type Notification as AppNotification } from '../../models/notification.interface';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="notification-bell relative">
      <!-- Bell Icon -->
      <button 
        (click)="toggleDropdown()"
        class="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        [class.text-blue-600]="isOpen() || unreadCount() > 0">
        
        <!-- Bell Icon -->
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>

        <!-- Badge -->
        @if (unreadCount() > 0) {
          <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-medium animate-pulse">
            {{ unreadCount() > 99 ? '99+' : unreadCount() }}
          </span>
        }

        <!-- Pulse animation for new notifications -->
        @if (hasUrgentNotifications()) {
          <span class="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 animate-ping"></span>
        }
      </button>

      <!-- Dropdown -->
      @if (isOpen()) {
        <div class="notification-dropdown absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          <!-- Header -->
          <div class="p-4 border-b border-gray-200 bg-gray-50">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900">
                Notificaciones
                @if (unreadCount() > 0) {
                  <span class="ml-2 text-sm text-blue-600">({{ unreadCount() }} sin leer)</span>
                }
              </h3>
              <div class="flex items-center space-x-2">
                @if (unreadCount() > 0) {
                  <button 
                    (click)="markAllAsRead()"
                    class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    Marcar todas
                  </button>
                }
                <button 
                  routerLink="/notifications"
                  (click)="closeDropdown()"
                  class="text-xs text-gray-600 hover:text-gray-800 font-medium">
                  Ver todas
                </button>
              </div>
            </div>
          </div>

          <!-- Notifications List -->
          <div class="max-h-80 overflow-y-auto">
            @if (recentNotifications().length === 0) {
              <div class="p-8 text-center">
                <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i class="bi bi-bell-slash text-gray-400 text-xl"></i>
                </div>
                <p class="text-sm text-gray-500">No hay notificaciones recientes</p>
              </div>
            } @else {
              @for (notification of recentNotifications(); track notification.id) {
                <div 
                  class="p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  [class.bg-blue-50]="!notification.read"
                  (click)="handleNotificationClick(notification)">
                  
                  <div class="flex items-start space-x-3">
                    <!-- Icon -->
                    <div 
                      class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                      [ngClass]="{
                        'bg-blue-100 text-blue-600': notification.type === 'info',
                        'bg-green-100 text-green-600': notification.type === 'success',
                        'bg-yellow-100 text-yellow-600': notification.type === 'warning',
                        'bg-red-100 text-red-600': notification.type === 'error',
                        'bg-gray-100 text-gray-600': notification.type === 'system',
                        'bg-purple-100 text-purple-600': notification.type === 'reminder'
                      }">
                      <i 
                        class="text-sm"
                        [ngClass]="{
                          'bi-info-circle': notification.type === 'info',
                          'bi-check-circle': notification.type === 'success',
                          'bi-exclamation-triangle': notification.type === 'warning',
                          'bi-x-circle': notification.type === 'error',
                          'bi-gear': notification.type === 'system',
                          'bi-clock': notification.type === 'reminder'
                        }"></i>
                    </div>

                    <!-- Content -->
                    <div class="flex-1 min-w-0">
                      <h4 
                        class="text-sm text-gray-900 truncate"
                        [class.font-semibold]="!notification.read">
                        {{ notification.title }}
                      </h4>
                      <p 
                        class="text-xs text-gray-600 mt-1 line-clamp-2"
                        [class.text-gray-800]="!notification.read">
                        {{ notification.message }}
                      </p>
                      
                      <!-- Meta info -->
                      <div class="flex items-center justify-between mt-2">
                        <span class="text-xs text-gray-500">
                          {{ formatTimeAgo(notification.timestamp) }}
                        </span>
                        
                        @if (notification.priority === 'urgent') {
                          <span class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                            Urgente
                          </span>
                        } @else if (notification.priority === 'high') {
                          <span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-medium">
                            Alta
                          </span>
                        }
                      </div>
                    </div>

                    <!-- Read indicator -->
                    @if (!notification.read) {
                      <div class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full"></div>
                    }
                  </div>
                </div>
              }
            }
          </div>

          <!-- Footer -->
          @if (recentNotifications().length > 0) {
            <div class="p-3 border-t border-gray-200 bg-gray-50">
              <button 
                routerLink="/notifications"
                (click)="closeDropdown()"
                class="w-full text-center text-sm text-blue-600 hover:text-blue-800 font-medium py-2">
                Ver todas las notificaciones
              </button>
            </div>
          }
        </div>
      }

      <!-- Overlay -->
      @if (isOpen()) {
        <div 
          class="fixed inset-0 z-40"
          (click)="closeDropdown()">
        </div>
      }
    </div>
  `,
  styles: [`
    .notification-bell {
      position: relative;
    }

    .notification-dropdown {
      animation: slideDown 0.2s ease-out;
      transform-origin: top right;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Custom scrollbar */
    .notification-dropdown .max-h-80::-webkit-scrollbar {
      width: 4px;
    }

    .notification-dropdown .max-h-80::-webkit-scrollbar-track {
      background: #f1f5f9;
    }

    .notification-dropdown .max-h-80::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 2px;
    }

    .notification-dropdown .max-h-80::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  `]
})
export class NotificationBellComponent {
  private notificationStore = inject(NotificationStore);
  private router = inject(Router);

  // State
  readonly isOpen = signal(false);

  // Computed properties
  readonly unreadCount = this.notificationStore.unreadCount;
  readonly notifications = this.notificationStore.allNotifications;

  readonly recentNotifications = computed(() =>
    this.notifications()
      .slice(0, 10) // Show only last 10 notifications
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  );

  readonly hasUrgentNotifications = computed(() =>
    this.notifications().some(n => !n.read && n.priority === 'urgent')
  );

  toggleDropdown(): void {
    this.isOpen.update(current => !current);
  }

  closeDropdown(): void {
    this.isOpen.set(false);
  }

  markAllAsRead(): void {
    this.notificationStore.markAllAsRead();
  }

  handleNotificationClick(notification: AppNotification): void {
    // Mark as read
    if (!notification.read) {
      this.notificationStore.markAsRead(notification.id);
    }

    // Navigate if has action URL
    if (notification.actionUrl) {
      let url = notification.actionUrl;
      if (notification.metadata) {
        Object.entries(notification.metadata).forEach(([key, value]) => {
          url = url.replace(`{{${key}}}`, value.toString());
        });
      }
      this.router.navigate([url]);
    }

    // Close dropdown
    this.closeDropdown();
  }

  formatTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;

    return timestamp.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit'
    });
  }
}
