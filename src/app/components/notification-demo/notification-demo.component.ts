import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../services/notification.service';
import { ToastService } from '../../services/toast.service';

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
            <div class="text-2xl font-bold text-red-600">{{ stats().byPriority.urgent }}</div>
            <div class="text-sm text-gray-600">Urgentes</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ stats().todayCount }}</div>
            <div class="text-sm text-gray-600">Hoy</div>
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
            <button 
              (click)="createInfoNotification()"
              class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Crear Info
            </button>
            
            <button 
              (click)="createSuccessNotification()"
              class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Crear Éxito
            </button>
            
            <button 
              (click)="createWarningNotification()"
              class="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
              Crear Advertencia
            </button>
            
            <button 
              (click)="createErrorNotification()"
              class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
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
            <button 
              (click)="createUrgentTicket()"
              class="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              Ticket Urgente
            </button>
            
            <button 
              (click)="createNewCustomer()"
              class="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              Nuevo Cliente
            </button>
            
            <button 
              (click)="createSystemUpdate()"
              class="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Actualización Sistema
            </button>
            
            <button 
              (click)="createReminder()"
              class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
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
            <button 
              (click)="useTemplate()"
              class="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
              Usar Plantilla
            </button>
            
            <button 
              (click)="createBatchNotifications()"
              class="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              Crear Lote (5)
            </button>
            
            <button 
              (click)="simulateWorkflow()"
              class="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors">
              Simular Flujo
            </button>
            
            <button 
              (click)="markAllAsRead()"
              class="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
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
          <button 
            (click)="showToastInfo()"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Toast Info
          </button>
          
          <button 
            (click)="showToastSuccess()"
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            Toast Éxito
          </button>
          
          <button 
            (click)="showToastWarning()"
            class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors">
            Toast Warning
          </button>
          
          <button 
            (click)="showToastError()"
            class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            Toast Error
          </button>
        </div>
      </div>

      <!-- Quick Access -->
      <div class="bg-gray-50 rounded-xl p-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900 mb-4">Acceso Rápido</h3>
        <div class="flex flex-wrap gap-3">
          <a 
            href="/notifications" 
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <i class="bi bi-bell mr-2"></i>
            Centro de Notificaciones
          </a>
          <a 
            href="/analytics" 
            class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <i class="bi bi-graph-up mr-2"></i>
            Analytics Dashboard
          </a>
          <a 
            href="/search" 
            class="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            <i class="bi bi-search mr-2"></i>
            Búsqueda Avanzada
          </a>
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
  private notificationService = inject(NotificationService);
  private toastService = inject(ToastService);

  readonly stats = this.notificationService.stats;

  // Basic notification types
  createInfoNotification(): void {
    this.notificationService.createNotification({
      type: 'info',
      title: 'Información del Sistema',
      message: `Notificación de información creada a las ${new Date().toLocaleTimeString()}`,
      priority: 'medium',
      category: 'general'
    });
  }

  createSuccessNotification(): void {
    this.notificationService.createNotification({
      type: 'success',
      title: 'Operación Exitosa',
      message: 'La operación se completó correctamente sin errores',
      priority: 'low',
      category: 'general'
    });
  }

  createWarningNotification(): void {
    this.notificationService.createNotification({
      type: 'warning',
      title: 'Advertencia del Sistema',
      message: 'Se detectó una situación que requiere atención',
      priority: 'high',
      category: 'system'
    });
  }

  createErrorNotification(): void {
    this.notificationService.createNotification({
      type: 'error',
      title: 'Error Crítico',
      message: 'Se produjo un error que requiere intervención inmediata',
      priority: 'urgent',
      category: 'system',
      persistent: true
    });
  }

  // Category and priority examples
  createUrgentTicket(): void {
    this.notificationService.createNotification({
      type: 'warning',
      title: 'Ticket Crítico #' + Math.floor(Math.random() * 9999),
      message: 'Cliente VIP reporta problema crítico que afecta operaciones',
      priority: 'urgent',
      category: 'ticket',
      actionUrl: '/tickets/urgent',
      actionLabel: 'Atender ahora',
      persistent: true,
      metadata: {
        ticketId: 'T' + Math.floor(Math.random() * 9999),
        customerId: 'VIP-CLIENT'
      }
    });
  }

  createNewCustomer(): void {
    const companies = ['TechCorp', 'InnovaSoft', 'DataFlow', 'CloudTech', 'SysAdmin Pro'];
    const company = companies[Math.floor(Math.random() * companies.length)];
    
    this.notificationService.createNotification({
      type: 'success',
      title: 'Nuevo Cliente Registrado',
      message: `${company} se ha registrado exitosamente en el sistema`,
      priority: 'medium',
      category: 'customer',
      actionUrl: '/clientes',
      actionLabel: 'Ver perfil',
      metadata: {
        customerId: company.toLowerCase().replace(' ', '-'),
        registrationTime: new Date().toISOString()
      }
    });
  }

  createSystemUpdate(): void {
    const updates = [
      'Actualización de seguridad v2.1.5',
      'Nuevo módulo de reportes disponible',
      'Mejoras en rendimiento del sistema',
      'Actualización de base de datos completada'
    ];
    const update = updates[Math.floor(Math.random() * updates.length)];
    
    this.notificationService.createNotification({
      type: 'system',
      title: 'Actualización del Sistema',
      message: update,
      priority: 'high',
      category: 'system',
      persistent: true
    });
  }

  createReminder(): void {
    this.notificationService.createNotification({
      type: 'reminder',
      title: 'Recordatorio Programado',
      message: 'Tienes una tarea pendiente que requiere atención',
      priority: 'medium',
      category: 'reminder',
      actionUrl: '/tickets',
      actionLabel: 'Ver tareas',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });
  }

  // Template usage
  useTemplate(): void {
    const templates = this.notificationService.templates$();
    if (templates.length > 0) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      
      // Mock variables for template
      const variables = {
        customerName: 'Demo Customer ' + Math.floor(Math.random() * 100),
        ticketTitle: 'Problema de conectividad',
        ticketId: 'T' + Math.floor(Math.random() * 9999),
        customerId: 'C' + Math.floor(Math.random() * 999),
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString()
      };
      
      this.notificationService.useTemplate(template.id, variables);
    }
  }

  // Batch creation
  createBatchNotifications(): void {
    const notifications = [
      {
        type: 'info' as const,
        title: 'Backup Programado',
        message: 'El backup automático se ejecutará en 30 minutos',
        priority: 'low' as const,
        category: 'system' as const
      },
      {
        type: 'success' as const,
        title: 'Pago Procesado',
        message: 'Se procesó exitosamente el pago de TechSolutions',
        priority: 'medium' as const,
        category: 'customer' as const
      },
      {
        type: 'warning' as const,
        title: 'Espacio en Disco',
        message: 'El servidor tiene menos del 15% de espacio disponible',
        priority: 'high' as const,
        category: 'system' as const
      },
      {
        type: 'info' as const,
        title: 'Nuevo Mensaje',
        message: 'Tienes un nuevo mensaje en el sistema de chat',
        priority: 'low' as const,
        category: 'general' as const
      },
      {
        type: 'reminder' as const,
        title: 'Reunión Programada',
        message: 'Reunión con el equipo de desarrollo en 1 hora',
        priority: 'medium' as const,
        category: 'reminder' as const
      }
    ];

    notifications.forEach((notification, index) => {
      setTimeout(() => {
        this.notificationService.createNotification(notification);
      }, index * 500); // Create with 500ms delay between each
    });
  }

  // Workflow simulation
  simulateWorkflow(): void {
    // Simulate a ticket workflow with multiple notifications
    const ticketId = 'T' + Math.floor(Math.random() * 9999);
    
    // 1. Ticket created
    this.notificationService.createNotification({
      type: 'info',
      title: 'Nuevo Ticket Creado',
      message: `Ticket ${ticketId} creado por Cliente Premium`,
      priority: 'medium',
      category: 'ticket',
      metadata: { ticketId, step: 1 }
    });
    
    // 2. Ticket assigned (after 2 seconds)
    setTimeout(() => {
      this.notificationService.createNotification({
        type: 'info',
        title: 'Ticket Asignado',
        message: `Ticket ${ticketId} asignado al técnico Juan Pérez`,
        priority: 'medium',
        category: 'workflow',
        metadata: { ticketId, step: 2 }
      });
    }, 2000);
    
    // 3. Work started (after 4 seconds)
    setTimeout(() => {
      this.notificationService.createNotification({
        type: 'info',
        title: 'Trabajo Iniciado',
        message: `Se comenzó a trabajar en el ticket ${ticketId}`,
        priority: 'medium',
        category: 'workflow',
        metadata: { ticketId, step: 3 }
      });
    }, 4000);
    
    // 4. Completion (after 6 seconds)
    setTimeout(() => {
      this.notificationService.createNotification({
        type: 'success',
        title: 'Ticket Completado',
        message: `Ticket ${ticketId} resuelto exitosamente`,
        priority: 'medium',
        category: 'ticket',
        actionUrl: `/tickets/${ticketId}`,
        actionLabel: 'Ver detalles',
        metadata: { ticketId, step: 4 }
      });
    }, 6000);
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
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
