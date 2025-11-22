import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast.service';
import { NotificationStore } from '../../stores/notification.store';

@Component({
  selector: 'app-notification-demo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-8 max-w-4xl mx-auto">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-4">
          <i class="bi bi-bell-fill text-blue-600 mr-3"></i>
          Demo Sistema de Notificaciones
        </h1>
        <p class="text-gray-600">
          Prueba todas las funcionalidades del sistema de notificaciones avanzado
        </p>
      </div>

      <!-- Stats Display -->
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-8">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Estadísticas en Tiempo Real</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-600">{{ stats().total }}</div>
            <div class="text-sm text-gray-600">Total</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-orange-600">{{ stats().unread }}</div>
            <div class="text-sm text-gray-600">Sin leer</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ stats().todayCount }}</div>
            <div class="text-sm text-gray-600">Hoy</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-red-600">{{ stats().byPriority.urgent }}</div>
            <div class="text-sm text-gray-600">Urgentes</div>
          </div>
        </div>
      </div>

      <!-- Demo Actions -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <!-- Basic Notifications -->
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <i class="bi bi-info-circle text-blue-600 mr-2"></i>
            Notificaciones Básicas
          </h3>
          <div class="space-y-3">
            <button (click)="createInfoNotification()" class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Crear Info
            </button>
            <button (click)="createSuccessNotification()" class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Crear Éxito
            </button>
            <button (click)="createWarningNotification()" class="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
              Crear Advertencia
            </button>
            <button (click)="createErrorNotification()" class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Crear Error
            </button>
          </div>
        </div>

        <!-- Priority & Categories -->
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <i class="bi bi-exclamation-triangle text-yellow-600 mr-2"></i>
            Prioridades & Categorías
          </h3>
          <div class="space-y-3">
            <button (click)="createUrgentTicket()" class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Ticket Urgente
            </button>
            <button (click)="createNewCustomer()" class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Nuevo Cliente
            </button>
            <button (click)="createSystemUpdate()" class="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Actualización Sistema
            </button>
            <button (click)="createReminder()" class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Recordatorio
            </button>
          </div>
        </div>

        <!-- Templates & Batch -->
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <i class="bi bi-lightning text-purple-600 mr-2"></i>
            Plantillas & Lotes
          </h3>
          <div class="space-y-3">
            <button (click)="useTemplate()" class="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Usar Plantilla
            </button>
            <button (click)="createBatchNotifications()" class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              Crear Lote (5)
            </button>
            <button (click)="simulateWorkflow()" class="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
              Simular Flujo
            </button>
            <button (click)="markAllAsRead()" class="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
              Marcar Todas Leídas
            </button>
          </div>
        </div>
      </div>

      <!-- Toast Demos -->
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-8">
        <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <i class="bi bi-chat-dots text-blue-600 mr-2"></i>
          Toasts Tradicionales
        </h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button (click)="showToastInfo()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Toast Info
          </button>
          <button (click)="showToastSuccess()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            Toast Éxito
          </button>
          <button (click)="showToastWarning()" class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
            Toast Warning
          </button>
          <button (click)="showToastError()" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Toast Error
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .demo-container {
      animation: fadeIn 0.3s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class NotificationDemoComponent {
  private toastService = inject(ToastService);
  private notificationStore = inject(NotificationStore);

  readonly stats = this.notificationStore.stats;

  // Basic notification types using ToastService AND NotificationStore
  createInfoNotification(): void {
    const title = 'Información del Sistema';
    const message = `Notificación de información creada a las ${new Date().toLocaleTimeString()}`;

    this.toastService.info(title, message);
    this.notificationStore.add({ title, message, type: 'info', category: 'system' });
  }

  createSuccessNotification(): void {
    const title = 'Operación Exitosa';
    const message = 'La operación se completó correctamente sin errores';

    this.toastService.success(title, message);
    this.notificationStore.add({ title, message, type: 'success', category: 'general' });
  }

  createWarningNotification(): void {
    const title = 'Advertencia del Sistema';
    const message = 'Se detectó una situación que requiere atención';

    this.toastService.warning(title, message);
    this.notificationStore.add({ title, message, type: 'warning', category: 'system', priority: 'high' });
  }

  createErrorNotification(): void {
    const title = 'Error Crítico';
    const message = 'Se produjo un error que requiere intervención inmediata';

    this.toastService.error(title, message, undefined, true);
    this.notificationStore.add({ title, message, type: 'error', category: 'system', priority: 'urgent' });
  }

  // Category and priority examples
  createUrgentTicket(): void {
    const title = 'Ticket Crítico';
    const message = 'Cliente VIP reporta problema crítico que afecta operaciones';

    this.toastService.warning(title, message);
    this.notificationStore.add({ title, message, type: 'warning', category: 'ticket', priority: 'urgent' });
  }

  createNewCustomer(): void {
    const companies = ['TechCorp', 'InnovaSoft', 'DataFlow', 'CloudTech', 'SysAdmin Pro'];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const title = 'Nuevo Cliente Registrado';
    const message = `${company} se ha registrado exitosamente en el sistema`;

    this.toastService.success(title, message);
    this.notificationStore.add({ title, message, type: 'success', category: 'customer', priority: 'medium' });
  }

  createSystemUpdate(): void {
    const updates = [
      'Actualización de seguridad v2.1.5',
      'Nuevo módulo de reportes disponible',
      'Mejoras en rendimiento del sistema',
      'Actualización de base de datos completada'
    ];
    const update = updates[Math.floor(Math.random() * updates.length)];
    const title = 'Actualización del Sistema';

    this.toastService.info(title, update);
    this.notificationStore.add({ title, message: update, type: 'system', category: 'system', priority: 'low' });
  }

  createReminder(): void {
    const title = 'Recordatorio Programado';
    const message = 'Tienes una tarea pendiente que requiere atención';

    this.toastService.info(title, message);
    this.notificationStore.add({ title, message, type: 'info', category: 'reminder', priority: 'medium' });
  }

  // Template usage (demo)
  useTemplate(): void {
    this.toastService.info('Demo de plantillas', 'La API de plantillas está desactivada en esta demo.');
  }

  // Batch creation
  createBatchNotifications(): void {
    const notifications = [
      { title: 'Backup Programado', message: 'El backup automático se ejecutará en 30 minutos', type: 'info', category: 'system' },
      { title: 'Pago Procesado', message: 'Se procesó exitosamente el pago de TechSolutions', type: 'success', category: 'customer' },
      { title: 'Espacio en Disco', message: 'El servidor tiene menos del 15% de espacio disponible', type: 'warning', category: 'system' },
      { title: 'Nuevo Mensaje', message: 'Tienes un nuevo mensaje en el sistema de chat', type: 'info', category: 'general' },
      { title: 'Reunión Programada', message: 'Reunión con el equipo de desarrollo en 1 hora', type: 'info', category: 'reminder' }
    ];
    notifications.forEach((n, i) => {
      setTimeout(() => {
        if (n.type === 'info') this.toastService.info(n.title, n.message);
        else if (n.type === 'success') this.toastService.success(n.title, n.message);
        else if (n.type === 'warning') this.toastService.warning(n.title, n.message);

        this.notificationStore.add({
          title: n.title,
          message: n.message,
          type: n.type as any,
          category: n.category as any
        });
      }, i * 500);
    });
  }

  // Workflow simulation
  simulateWorkflow(): void {
    const steps = [
      { title: 'Ticket Creado', message: 'Ticket creado por Cliente Premium', category: 'ticket' },
      { title: 'Ticket Asignado', message: 'Ticket asignado al técnico Juan Pérez', category: 'ticket' },
      { title: 'Servicio Iniciado', message: 'Se comenzó a trabajar en el ticket', category: 'workflow' },
      { title: 'Ticket Completado', message: 'Ticket resuelto exitosamente', category: 'workflow' }
    ];
    steps.forEach((s, i) => {
      setTimeout(() => {
        this.toastService.info(s.title, s.message);
        this.notificationStore.add({
          title: s.title,
          message: s.message,
          type: 'info',
          category: s.category as any
        });
      }, i * 2000);
    });
  }

  // Mark all as read
  markAllAsRead(): void {
    this.notificationStore.markAllAsRead();
    this.toastService.success('Marcadas como leídas', 'Todas las notificaciones fueron marcadas como leídas');
  }

  // Toast demos
  showToastInfo(): void {
    this.toastService.info('Toast de Información', 'Este es un toast informativo tradicional');
  }

  showToastSuccess(): void {
    this.toastService.success('Toast de Éxito', 'Operación completada exitosamente');
  }

  showToastWarning(): void {
    this.toastService.warning('Toast de Advertencia', 'Algo requiere tu atención');
  }

  showToastError(): void {
    this.toastService.error('Toast de Error', 'Se produjo un error en la operación');
  }
}
