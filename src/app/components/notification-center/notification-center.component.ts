import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NotificationStore } from '../../stores/notification.store';
import {
  type Notification as AppNotification,
  NotificationFilter
} from '../../models/notification.interface';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="notification-center min-h-screen bg-gray-50 p-6">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 mb-2">
              <i class="bi bi-bell-fill text-blue-600 mr-3"></i>
              Centro de Notificaciones
            </h1>
            <p class="text-gray-600">
              Gestiona todas tus notificaciones y alertas del sistema
            </p>
          </div>
          <div class="flex gap-3">
            <button 
              (click)="markAllAsRead()"
              [disabled]="stats().unread === 0"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <i class="bi bi-check-all mr-2"></i>
              Marcar todas como leídas
            </button>
            <button 
              (click)="clearReadNotifications()"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all">
              <i class="bi bi-trash mr-2"></i>
              Limpiar leídas
            </button>
          </div>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Total</p>
              <p class="text-2xl font-bold text-gray-900">{{ stats().total }}</p>
            </div>
            <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i class="bi bi-bell text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Sin leer</p>
              <p class="text-2xl font-bold text-orange-600">{{ stats().unread }}</p>
            </div>
            <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <i class="bi bi-bell-fill text-orange-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Hoy</p>
              <p class="text-2xl font-bold text-green-600">{{ stats().todayCount }}</p>
            </div>
            <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i class="bi bi-calendar-day text-green-600 text-xl"></i>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-gray-600">Urgentes</p>
              <p class="text-2xl font-bold text-red-600">{{ stats().byPriority.urgent }}</p>
            </div>
            <div class="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i class="bi bi-exclamation-triangle-fill text-red-600 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-8">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">
          <i class="bi bi-funnel mr-2"></i>
          Filtros
        </h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Category Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
            <select 
              [(ngModel)]="selectedCategory" 
              (ngModelChange)="updateFilters()"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Todas las categorías</option>
              <option value="ticket">Tickets</option>
              <option value="customer">Clientes</option>
              <option value="system">Sistema</option>
              <option value="reminder">Recordatorios</option>
              <option value="workflow">Flujo de servicios</option>
              <option value="general">General</option>
            </select>
          </div>

          <!-- Type Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
            <select 
              [(ngModel)]="selectedType" 
              (ngModelChange)="updateFilters()"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Todos los tipos</option>
              <option value="info">Información</option>
              <option value="success">Éxito</option>
              <option value="warning">Advertencia</option>
              <option value="error">Error</option>
              <option value="system">Sistema</option>
              <option value="reminder">Recordatorio</option>
            </select>
          </div>

          <!-- Priority Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Prioridad</label>
            <select 
              [(ngModel)]="selectedPriority" 
              (ngModelChange)="updateFilters()"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Todas las prioridades</option>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>

          <!-- Read Status Filter -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Estado</label>
            <select 
              [(ngModel)]="selectedReadStatus" 
              (ngModelChange)="updateFilters()"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Todas</option>
              <option value="unread">Sin leer</option>
              <option value="read">Leídas</option>
            </select>
          </div>
        </div>

        <!-- Search -->
        <div class="mt-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
          <div class="relative">
            <input
              type="text"
              [(ngModel)]="searchTerm"
              (ngModelChange)="updateFilters()"
              placeholder="Buscar en título o mensaje..."
              class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <i class="bi bi-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          </div>
        </div>

        <!-- Clear Filters -->
        <div class="mt-4 flex justify-end">
          <button 
            (click)="clearFilters()"
            class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
            <i class="bi bi-x-circle mr-2"></i>
            Limpiar filtros
          </button>
        </div>
      </div>

      <!-- Notifications List -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200">
        <div class="p-6 border-b border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900">
            Notificaciones ({{ filteredNotifications().length }})
          </h3>
        </div>

        <div class="divide-y divide-gray-200">
          @if (filteredNotifications().length === 0) {
            <div class="p-12 text-center">
              <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i class="bi bi-bell-slash text-gray-400 text-2xl"></i>
              </div>
              <h3 class="text-lg font-medium text-gray-900 mb-2">No hay notificaciones</h3>
              <p class="text-gray-500">No se encontraron notificaciones que coincidan con los filtros seleccionados.</p>
            </div>
          } @else {
            @for (notification of filteredNotifications(); track notification.id) {
              <div 
                class="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                [class.bg-blue-50]="!notification.read"
                (click)="handleNotificationClick(notification)">
                <div class="flex items-start space-x-4">
                  <!-- Icon -->
                  <div 
                    class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    [ngClass]="{
                      'bg-blue-100 text-blue-600': notification.type === 'info',
                      'bg-green-100 text-green-600': notification.type === 'success',
                      'bg-yellow-100 text-yellow-600': notification.type === 'warning',
                      'bg-red-100 text-red-600': notification.type === 'error',
                      'bg-gray-100 text-gray-600': notification.type === 'system',
                      'bg-purple-100 text-purple-600': notification.type === 'reminder'
                    }">
                    <i 
                      class="text-lg"
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
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <h4 
                          class="text-sm font-medium text-gray-900"
                          [class.font-bold]="!notification.read">
                          {{ notification.title }}
                        </h4>
                        <p 
                          class="mt-1 text-sm text-gray-600"
                          [class.text-gray-900]="!notification.read">
                          {{ notification.message }}
                        </p>
                        
                        <!-- Metadata -->
                        <div class="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                          <span class="flex items-center">
                            <i class="bi bi-clock mr-1"></i>
                            {{ formatTimestamp(notification.timestamp) }}
                          </span>
                          <span 
                            class="px-2 py-1 rounded-full text-xs font-medium"
                            [ngClass]="{
                              'bg-gray-100 text-gray-700': notification.priority === 'low',
                              'bg-blue-100 text-blue-700': notification.priority === 'medium',
                              'bg-yellow-100 text-yellow-700': notification.priority === 'high',
                              'bg-red-100 text-red-700': notification.priority === 'urgent'
                            }">
                            {{ getPriorityLabel(notification.priority) }}
                          </span>
                          <span 
                            class="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {{ getCategoryLabel(notification.category) }}
                          </span>
                        </div>
                      </div>

                      <!-- Actions -->
                      <div class="flex items-center space-x-2 ml-4">
                        @if (!notification.read) {
                          <button
                            (click)="markAsRead(notification.id); $event.stopPropagation()"
                            class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Marcar como leída">
                            <i class="bi bi-check text-sm"></i>
                          </button>
                        }
                        @if (notification.actionUrl && notification.actionLabel) {
                          <button
                            (click)="navigateToAction(notification); $event.stopPropagation()"
                            class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                            {{ notification.actionLabel }}
                          </button>
                        }
                        <button
                          (click)="deleteNotification(notification.id); $event.stopPropagation()"
                          class="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Eliminar">
                          <i class="bi bi-trash text-sm"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            }
          }
        </div>
      </div>

      <!-- Pagination (if needed) -->
      @if (filteredNotifications().length > 0) {
        <div class="mt-6 flex justify-center">
          <div class="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
            <span class="text-sm text-gray-700">
              Mostrando {{ filteredNotifications().length }} notificaciones
            </span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .notification-center {
      animation: fadeIn 0.3s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .notification-item {
      transition: all 0.2s ease-in-out;
    }

    .notification-item:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
  `]
})
export class NotificationCenterComponent implements OnInit {
  private notificationStore = inject(NotificationStore);
  private router = inject(Router);

  // Reactive state
  readonly stats = this.notificationStore.stats;
  readonly filteredNotifications = this.notificationStore.filteredNotifications;

  // Filter state
  selectedCategory = signal('');
  selectedType = signal('');
  selectedPriority = signal('');
  selectedReadStatus = signal('');
  searchTerm = signal('');

  ngOnInit(): void {
    // Request notification permission if not already granted
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }

  updateFilters(): void {
    const filter: NotificationFilter = {};

    if (this.selectedCategory()) {
      filter.category = [this.selectedCategory() as any];
    }

    if (this.selectedType()) {
      filter.type = [this.selectedType() as any];
    }

    if (this.selectedPriority()) {
      filter.priority = [this.selectedPriority() as any];
    }

    if (this.selectedReadStatus()) {
      filter.read = this.selectedReadStatus() === 'read';
    }

    if (this.searchTerm()) {
      filter.search = this.searchTerm();
    }

    this.notificationStore.setFilter(filter);
  }

  clearFilters(): void {
    this.selectedCategory.set('');
    this.selectedType.set('');
    this.selectedPriority.set('');
    this.selectedReadStatus.set('');
    this.searchTerm.set('');
    this.notificationStore.clearFilter();
  }

  markAsRead(id: string): void {
    this.notificationStore.markAsRead(id);
  }

  markAllAsRead(): void {
    this.notificationStore.markAllAsRead();
  }

  deleteNotification(id: string): void {
    this.notificationStore.delete(id);
  }

  clearReadNotifications(): void {
    this.notificationStore.clearRead();
  }

  handleNotificationClick(notification: AppNotification): void {
    if (!notification.read) {
      this.markAsRead(notification.id);
    }

    if (notification.actionUrl) {
      this.navigateToAction(notification);
    }
  }

  navigateToAction(notification: AppNotification): void {
    if (notification.actionUrl) {
      // Replace variables in URL if metadata exists
      let url = notification.actionUrl;
      if (notification.metadata) {
        Object.entries(notification.metadata).forEach(([key, value]) => {
          url = url.replace(`{{${key}}}`, value.toString());
        });
      }
      this.router.navigate([url]);
    }
  }

  formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora mismo';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;

    return timestamp.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  getPriorityLabel(priority: AppNotification['priority']): string {
    const labels = {
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      urgent: 'Urgente'
    };
    return labels[priority];
  }

  getCategoryLabel(category: AppNotification['category']): string {
    const labels = {
      ticket: 'Ticket',
      customer: 'Cliente',
      system: 'Sistema',
      reminder: 'Recordatorio',
      workflow: 'Flujo',
      general: 'General'
    };
    return labels[category];
  }
}
