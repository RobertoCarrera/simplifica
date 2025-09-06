import { Injectable, signal, computed, inject } from '@angular/core';
import { 
  type Notification as AppNotification, 
  NotificationSettings, 
  NotificationRule, 
  NotificationStats, 
  NotificationFilter,
  NotificationTemplate 
} from '../models/notification.interface';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private toastService = inject(ToastService);
  
  // Signals for reactive state management
  private notifications = signal<AppNotification[]>([]);
  private settings = signal<NotificationSettings | null>(null);
  private rules = signal<NotificationRule[]>([]);
  private templates = signal<NotificationTemplate[]>([]);
  private filter = signal<NotificationFilter>({});
  
  // Computed properties
  readonly notifications$ = this.notifications.asReadonly();
  readonly settings$ = this.settings.asReadonly();
  readonly rules$ = this.rules.asReadonly();
  readonly templates$ = this.templates.asReadonly();
  
  readonly unreadCount = computed(() => 
    this.notifications().filter(n => !n.read).length
  );
  
  readonly filteredNotifications = computed(() => {
    const allNotifications = this.notifications();
    const currentFilter = this.filter();
    
    return allNotifications.filter(notification => {
      // Category filter
      if (currentFilter.category?.length && 
          !currentFilter.category.includes(notification.category)) {
        return false;
      }
      
      // Type filter
      if (currentFilter.type?.length && 
          !currentFilter.type.includes(notification.type)) {
        return false;
      }
      
      // Priority filter
      if (currentFilter.priority?.length && 
          !currentFilter.priority.includes(notification.priority)) {
        return false;
      }
      
      // Read status filter
      if (currentFilter.read !== undefined && 
          notification.read !== currentFilter.read) {
        return false;
      }
      
      // Date range filter
      if (currentFilter.dateFrom && 
          notification.timestamp < currentFilter.dateFrom) {
        return false;
      }
      
      if (currentFilter.dateTo && 
          notification.timestamp > currentFilter.dateTo) {
        return false;
      }
      
      // Search filter
      if (currentFilter.search) {
        const searchTerm = currentFilter.search.toLowerCase();
        const searchableText = `${notification.title} ${notification.message}`.toLowerCase();
        if (!searchableText.includes(searchTerm)) {
          return false;
        }
      }
      
      return true;
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  });
  
  readonly stats = computed<NotificationStats>(() => {
    const allNotifications = this.notifications();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    return {
      total: allNotifications.length,
      unread: allNotifications.filter(n => !n.read).length,
      byCategory: {
        ticket: allNotifications.filter(n => n.category === 'ticket').length,
        customer: allNotifications.filter(n => n.category === 'customer').length,
        system: allNotifications.filter(n => n.category === 'system').length,
        reminder: allNotifications.filter(n => n.category === 'reminder').length,
        workflow: allNotifications.filter(n => n.category === 'workflow').length,
        general: allNotifications.filter(n => n.category === 'general').length,
      },
      byPriority: {
        low: allNotifications.filter(n => n.priority === 'low').length,
        medium: allNotifications.filter(n => n.priority === 'medium').length,
        high: allNotifications.filter(n => n.priority === 'high').length,
        urgent: allNotifications.filter(n => n.priority === 'urgent').length,
      },
      byType: {
        info: allNotifications.filter(n => n.type === 'info').length,
        success: allNotifications.filter(n => n.type === 'success').length,
        warning: allNotifications.filter(n => n.type === 'warning').length,
        error: allNotifications.filter(n => n.type === 'error').length,
        system: allNotifications.filter(n => n.type === 'system').length,
        reminder: allNotifications.filter(n => n.type === 'reminder').length,
      },
      todayCount: allNotifications.filter(n => n.timestamp >= today).length,
      weekCount: allNotifications.filter(n => n.timestamp >= weekAgo).length,
      monthCount: allNotifications.filter(n => n.timestamp >= monthAgo).length,
    };
  });
  
  constructor() {
    this.loadFromStorage();
    this.initializeDefaultSettings();
    this.initializeDefaultTemplates();
    this.generateMockNotifications();
  }
  
  // Public methods for notification management
  createNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): string {
    const newNotification: AppNotification = {
      ...notification,
      id: this.generateId(),
      timestamp: new Date(),
      read: false
    };
    
    this.notifications.update(current => [newNotification, ...current]);
    this.saveToStorage();
    
    // Show desktop notification if enabled and supported
    const settings = this.settings();
    if (settings?.generalSettings.desktop && 'Notification' in window) {
      this.showDesktopNotification(newNotification);
    }
    
    return newNotification.id;
  }
  
  markAsRead(id: string): void {
    this.notifications.update(current =>
      current.map(notification =>
        notification.id === id 
          ? { ...notification, read: true }
          : notification
      )
    );
    this.saveToStorage();
  }
  
  markAllAsRead(): void {
    this.notifications.update(current =>
      current.map(notification => ({ ...notification, read: true }))
    );
    this.saveToStorage();
  }
  
  deleteNotification(id: string): void {
    this.notifications.update(current =>
      current.filter(notification => notification.id !== id)
    );
    this.saveToStorage();
  }
  
  clearAll(): void {
    this.notifications.set([]);
    this.saveToStorage();
  }
  
  clearRead(): void {
    this.notifications.update(current =>
      current.filter(notification => !notification.read)
    );
    this.saveToStorage();
  }
  
  applyFilter(filter: NotificationFilter): void {
    this.filter.set(filter);
  }
  
  clearFilter(): void {
    this.filter.set({});
  }
  
  // Settings management
  updateSettings(settings: NotificationSettings): void {
    this.settings.set(settings);
    this.saveSettingsToStorage();
  }
  
  // Rules management
  addRule(rule: Omit<NotificationRule, 'id'>): string {
    const newRule: NotificationRule = {
      ...rule,
      id: this.generateId()
    };
    
    this.rules.update(current => [...current, newRule]);
    this.saveRulesToStorage();
    
    return newRule.id;
  }
  
  updateRule(id: string, updates: Partial<NotificationRule>): void {
    this.rules.update(current =>
      current.map(rule =>
        rule.id === id ? { ...rule, ...updates } : rule
      )
    );
    this.saveRulesToStorage();
  }
  
  deleteRule(id: string): void {
    this.rules.update(current =>
      current.filter(rule => rule.id !== id)
    );
    this.saveRulesToStorage();
  }
  
  // Template management
  createTemplate(template: Omit<NotificationTemplate, 'id'>): string {
    const newTemplate: NotificationTemplate = {
      ...template,
      id: this.generateId()
    };
    
    this.templates.update(current => [...current, newTemplate]);
    this.saveTemplatesToStorage();
    
    return newTemplate.id;
  }
  
  useTemplate(templateId: string, variables: Record<string, string>): string {
    const template = this.templates().find(t => t.id === templateId);
    if (!template) {
      throw new Error(`Template with id ${templateId} not found`);
    }
    
    // Replace variables in title and message
    let title = template.title;
    let message = template.message;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      title = title.replace(new RegExp(placeholder, 'g'), value);
      message = message.replace(new RegExp(placeholder, 'g'), value);
    });
    
    return this.createNotification({
      type: template.type,
      title,
      message,
      priority: template.priority,
      category: template.category,
      actionUrl: template.actionUrl,
      actionLabel: template.actionLabel,
      persistent: template.persistent
    });
  }
  
  // Private methods
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  private showToast(notification: AppNotification): void {
    const toastType = notification.type === 'system' ? 'info' : 
                     notification.type === 'reminder' ? 'info' : 
                     notification.type;
    
    this.toastService[toastType as keyof Pick<ToastService, 'success' | 'error' | 'warning' | 'info'>](
      notification.title,
      notification.message,
      notification.priority === 'urgent' ? 10000 : 5000
    );
  }
  
  private async showDesktopNotification(notification: AppNotification): Promise<void> {
    if ('Notification' in window && Notification.permission === 'granted') {
      const desktopNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        tag: notification.id,
        requireInteraction: notification.priority === 'urgent'
      });
      
      desktopNotification.onclick = () => {
        window.focus();
        this.markAsRead(notification.id);
        desktopNotification.close();
      };
    }
  }
  
  async requestNotificationPermission(): Promise<boolean> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }
  
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('simplifica_notifications');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        const notifications = parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
          expiresAt: n.expiresAt ? new Date(n.expiresAt) : undefined
        }));
        this.notifications.set(notifications);
      }
    } catch (error) {
      console.error('Error loading notifications from storage:', error);
    }
  }
  
  private saveToStorage(): void {
    try {
      localStorage.setItem('simplifica_notifications', 
        JSON.stringify(this.notifications()));
    } catch (error) {
      console.error('Error saving notifications to storage:', error);
    }
  }
  
  private saveSettingsToStorage(): void {
    try {
      localStorage.setItem('simplifica_notification_settings', 
        JSON.stringify(this.settings()));
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  }
  
  private saveRulesToStorage(): void {
    try {
      localStorage.setItem('simplifica_notification_rules', 
        JSON.stringify(this.rules()));
    } catch (error) {
      console.error('Error saving notification rules:', error);
    }
  }
  
  private saveTemplatesToStorage(): void {
    try {
      localStorage.setItem('simplifica_notification_templates', 
        JSON.stringify(this.templates()));
    } catch (error) {
      console.error('Error saving notification templates:', error);
    }
  }
  
  private initializeDefaultSettings(): void {
    try {
      const stored = localStorage.getItem('simplifica_notification_settings');
      if (stored) {
        this.settings.set(JSON.parse(stored));
      } else {
        const defaultSettings: NotificationSettings = {
          id: this.generateId(),
          userId: 'current_user',
          categories: {
            ticket: { enabled: true, sound: true, desktop: true, email: true, priority: 'medium', frequency: 'instant' },
            customer: { enabled: true, sound: false, desktop: true, email: true, priority: 'medium', frequency: 'instant' },
            system: { enabled: true, sound: true, desktop: true, email: false, priority: 'high', frequency: 'instant' },
            reminder: { enabled: true, sound: true, desktop: true, email: false, priority: 'medium', frequency: 'instant' },
            workflow: { enabled: true, sound: false, desktop: true, email: true, priority: 'medium', frequency: 'instant' },
            general: { enabled: true, sound: false, desktop: false, email: false, priority: 'low', frequency: 'daily' }
          },
          generalSettings: {
            sound: true,
            desktop: true,
            email: true,
            sms: false,
            inApp: false, // Deshabilitado para evitar duplicados con el nuevo sistema
            dailyDigest: false,
            quietHours: {
              enabled: false,
              start: '22:00',
              end: '08:00'
            }
          }
        };
        this.settings.set(defaultSettings);
        this.saveSettingsToStorage();
      }
    } catch (error) {
      console.error('Error initializing notification settings:', error);
    }
  }
  
  private initializeDefaultTemplates(): void {
    try {
      const stored = localStorage.getItem('simplifica_notification_templates');
      if (stored) {
        this.templates.set(JSON.parse(stored));
      } else {
        const defaultTemplates: NotificationTemplate[] = [
          {
            id: 'ticket-created',
            name: 'Nuevo Ticket',
            category: 'ticket',
            type: 'info',
            title: 'Nuevo ticket creado',
            message: 'Se ha creado un nuevo ticket para {{customerName}}: {{ticketTitle}}',
            variables: ['customerName', 'ticketTitle'],
            priority: 'medium',
            persistent: false,
            actionLabel: 'Ver ticket',
            actionUrl: '/tickets/{{ticketId}}'
          },
          {
            id: 'ticket-urgent',
            name: 'Ticket Urgente',
            category: 'ticket',
            type: 'warning',
            title: '⚠️ Ticket Urgente',
            message: 'Ticket urgente de {{customerName}} requiere atención inmediata',
            variables: ['customerName'],
            priority: 'urgent',
            persistent: true,
            actionLabel: 'Atender ahora',
            actionUrl: '/tickets/{{ticketId}}'
          },
          {
            id: 'customer-new',
            name: 'Nuevo Cliente',
            category: 'customer',
            type: 'success',
            title: 'Nuevo cliente registrado',
            message: 'Se ha registrado un nuevo cliente: {{customerName}}',
            variables: ['customerName'],
            priority: 'medium',
            persistent: false,
            actionLabel: 'Ver perfil',
            actionUrl: '/customers/{{customerId}}'
          },
          {
            id: 'system-maintenance',
            name: 'Mantenimiento del Sistema',
            category: 'system',
            type: 'system',
            title: 'Mantenimiento programado',
            message: 'El sistema entrará en mantenimiento el {{date}} a las {{time}}',
            variables: ['date', 'time'],
            priority: 'high',
            persistent: true,
            actionLabel: 'Más información',
            actionUrl: '/system/maintenance'
          },
          {
            id: 'reminder-followup',
            name: 'Recordatorio de Seguimiento',
            category: 'reminder',
            type: 'reminder',
            title: 'Recordatorio: Seguimiento pendiente',
            message: 'Tienes un seguimiento pendiente con {{customerName}} para el ticket {{ticketId}}',
            variables: ['customerName', 'ticketId'],
            priority: 'medium',
            persistent: false,
            actionLabel: 'Ver ticket',
            actionUrl: '/tickets/{{ticketId}}'
          }
        ];
        this.templates.set(defaultTemplates);
        this.saveTemplatesToStorage();
      }
    } catch (error) {
      console.error('Error initializing notification templates:', error);
    }
  }
  
  private generateMockNotifications(): void {
    // Only generate if no notifications exist
    if (this.notifications().length === 0) {
      const mockNotifications: Omit<AppNotification, 'id' | 'timestamp' | 'read'>[] = [
        {
          type: 'warning',
          title: 'Ticket Urgente #1234',
          message: 'El cliente TechSolutions requiere atención inmediata para problema crítico',
          priority: 'urgent',
          category: 'ticket',
          actionUrl: '/tickets/1234',
          actionLabel: 'Ver ticket',
          persistent: true,
          metadata: { ticketId: '1234', customerId: 'tech-solutions' }
        },
        {
          type: 'success',
          title: 'Nuevo cliente registrado',
          message: 'InnovaCorp se ha registrado exitosamente en el sistema',
          priority: 'medium',
          category: 'customer',
          actionUrl: '/customers/innova-corp',
          actionLabel: 'Ver perfil',
          metadata: { customerId: 'innova-corp' }
        },
        {
          type: 'info',
          title: 'Ticket #1235 actualizado',
          message: 'Estado cambiado a "En progreso" para DataFlow Systems',
          priority: 'medium',
          category: 'ticket',
          actionUrl: '/tickets/1235',
          actionLabel: 'Ver detalles',
          metadata: { ticketId: '1235', customerId: 'dataflow' }
        },
        {
          type: 'system',
          title: 'Actualización del sistema',
          message: 'Se instaló la versión 2.1.4 con mejoras de seguridad',
          priority: 'high',
          category: 'system',
          persistent: true
        },
        {
          type: 'reminder',
          title: 'Seguimiento pendiente',
          message: 'Recordatorio: Llamar a CloudTech para seguimiento del ticket #1236',
          priority: 'medium',
          category: 'reminder',
          actionUrl: '/tickets/1236',
          actionLabel: 'Ver ticket',
          metadata: { ticketId: '1236', customerId: 'cloudtech' }
        },
        {
          type: 'error',
          title: 'Error de sincronización',
          message: 'No se pudo sincronizar datos con el servidor externo',
          priority: 'high',
          category: 'system',
          persistent: true
        },
        {
          type: 'info',
          title: 'Producto actualizado',
          message: 'Se actualizó la información del producto "Laptop Dell XPS 13"',
          priority: 'low',
          category: 'general',
          actionUrl: '/products/laptop-dell-xps-13',
          actionLabel: 'Ver producto'
        }
      ];
      
      // Create notifications with different timestamps
      mockNotifications.forEach((notification, index) => {
        setTimeout(() => {
          this.createNotification({
            ...notification,
            // Create notifications from different times
            timestamp: new Date(Date.now() - (index * 2 * 60 * 60 * 1000)) // 2 hours apart
          } as any);
        }, index * 100); // Small delay to prevent ID collisions
      });
    }
  }
}
