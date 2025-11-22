import { Injectable, computed, signal } from '@angular/core';
import { Notification, NotificationFilter, NotificationStats } from '../models/notification.interface';

@Injectable({
    providedIn: 'root'
})
export class NotificationStore {
    // State
    private notifications = signal<Notification[]>([]);
    private filter = signal<NotificationFilter>({});

    // Selectors
    readonly allNotifications = this.notifications.asReadonly();

    readonly filteredNotifications = computed(() => {
        const items = this.notifications();
        const currentFilter = this.filter();

        return items.filter(item => {
            // Filter by category
            if (currentFilter.category?.length && !currentFilter.category.includes(item.category)) {
                return false;
            }

            // Filter by type
            if (currentFilter.type?.length && !currentFilter.type.includes(item.type)) {
                return false;
            }

            // Filter by priority
            if (currentFilter.priority?.length && !currentFilter.priority.includes(item.priority)) {
                return false;
            }

            // Filter by read status
            if (currentFilter.read !== undefined && item.read !== currentFilter.read) {
                return false;
            }

            // Filter by search term
            if (currentFilter.search) {
                const term = currentFilter.search.toLowerCase();
                return item.title.toLowerCase().includes(term) ||
                    item.message.toLowerCase().includes(term);
            }

            return true;
        }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    });

    readonly unreadCount = computed(() =>
        this.notifications().filter(n => !n.read).length
    );

    readonly stats = computed<NotificationStats>(() => {
        const items = this.notifications();
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        return {
            total: items.length,
            unread: items.filter(n => !n.read).length,
            todayCount: items.filter(n => n.timestamp >= todayStart).length,
            weekCount: items.filter(n => n.timestamp >= weekStart).length,
            monthCount: items.filter(n => n.timestamp >= monthStart).length,
            byType: {
                info: items.filter(n => n.type === 'info').length,
                success: items.filter(n => n.type === 'success').length,
                warning: items.filter(n => n.type === 'warning').length,
                error: items.filter(n => n.type === 'error').length,
                system: items.filter(n => n.type === 'system').length,
                reminder: items.filter(n => n.type === 'reminder').length
            },
            byPriority: {
                low: items.filter(n => n.priority === 'low').length,
                medium: items.filter(n => n.priority === 'medium').length,
                high: items.filter(n => n.priority === 'high').length,
                urgent: items.filter(n => n.priority === 'urgent').length
            },
            byCategory: {
                ticket: items.filter(n => n.category === 'ticket').length,
                customer: items.filter(n => n.category === 'customer').length,
                system: items.filter(n => n.category === 'system').length,
                reminder: items.filter(n => n.category === 'reminder').length,
                workflow: items.filter(n => n.category === 'workflow').length,
                general: items.filter(n => n.category === 'general').length
            }
        };
    });

    constructor() {
        // Initialize with some dummy data for demo purposes
        this.add({
            title: 'Bienvenido al Sistema',
            message: 'Tu cuenta ha sido configurada correctamente.',
            type: 'success',
            category: 'system',
            priority: 'low'
        });
    }

    // Actions
    add(notification: Partial<Notification> & { title: string; message: string }): void {
        const newNotification: Notification = {
            id: crypto.randomUUID(),
            timestamp: new Date(),
            read: false,
            type: 'info',
            category: 'general',
            priority: 'medium',
            ...notification
        };

        this.notifications.update(current => [newNotification, ...current]);
    }

    markAsRead(id: string): void {
        this.notifications.update(current =>
            current.map(n => n.id === id ? { ...n, read: true } : n)
        );
    }

    markAllAsRead(): void {
        this.notifications.update(current =>
            current.map(n => ({ ...n, read: true }))
        );
    }

    delete(id: string): void {
        this.notifications.update(current =>
            current.filter(n => n.id !== id)
        );
    }

    clearRead(): void {
        this.notifications.update(current =>
            current.filter(n => !n.read)
        );
    }

    setFilter(filter: NotificationFilter): void {
        this.filter.set(filter);
    }

    clearFilter(): void {
        this.filter.set({});
    }
}
