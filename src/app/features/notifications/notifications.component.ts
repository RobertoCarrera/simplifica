import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Bell, CheckCheck, Clock, Check, X, Tag, MessageCircle, AlertCircle, Filter, Inbox, ClipboardList, Settings } from 'lucide-angular';
import { SupabaseNotificationsService, AppNotification } from '../../services/supabase-notifications.service';
import { TicketDetailComponent } from '../../features/tickets/detail/ticket-detail.component';
import { GdprRequestDetailComponent } from '../customers/gdpr-request-detail/gdpr-request-detail.component';
import { NotificationsSettingsComponent } from './settings/notifications-settings.component';
import { SupabasePermissionsService } from '../../services/supabase-permissions.service';

@Component({
    selector: 'app-notifications',
    standalone: true,
    imports: [CommonModule, LucideAngularModule, TicketDetailComponent, GdprRequestDetailComponent, NotificationsSettingsComponent],
    providers: [{ provide: LUCIDE_ICONS, useValue: new LucideIconProvider({ Bell, CheckCheck, Clock, Check, X, Tag, MessageCircle, AlertCircle, Filter, Inbox, ClipboardList, Settings }) }],
    templateUrl: './notifications.component.html',
    styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class NotificationsComponent {
    service = inject(SupabaseNotificationsService);
    permissionsService = inject(SupabasePermissionsService);
    private router = inject(Router);

    // Modal state
    selectedTicketId = signal<string | null>(null);
    selectedGdprRequestId = signal<string | null>(null);

    // Grouped notifications
    // Filter state
    filterStatus = signal<'all' | 'unread' | 'read'>('all');
    filterType = signal<string>('all');

    // Available types for sidebar
    availableTypes = computed(() => {
        const list = this.service.notifications();
        const types = new Set<string>();
        const typeCounts = new Map<string, number>();

        list.forEach(n => {
            const t = n.type;
            types.add(t);
            typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
        });

        return Array.from(types).map(type => ({
            type,
            label: this.formatTypeLabel(type),
            count: typeCounts.get(type) || 0,
            icon: this.getIconForType(type)
        })).sort((a, b) => b.count - a.count);
    });

    // Grouped notifications with filtering
    groupedNotifications = computed(() => {
        let list = this.service.notifications();

        // Apply Status Filter
        const status = this.filterStatus();
        if (status === 'unread') {
            list = list.filter(n => !n.is_read);
        } else if (status === 'read') {
            list = list.filter(n => n.is_read);
        }

        // Apply Type Filter
        const type = this.filterType();
        if (type !== 'all') {
            list = list.filter(n => n.type === type);
        }

        const today: AppNotification[] = [];
        const yesterday: AppNotification[] = [];
        const older: AppNotification[] = [];

        const now = new Date();
        const todayStr = now.toDateString();
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toDateString();

        list.forEach(n => {
            const d = new Date(n.created_at);
            const ds = d.toDateString();
            if (ds === todayStr) {
                today.push(n);
            } else if (ds === yesterdayStr) {
                yesterday.push(n);
            } else {
                older.push(n);
            }
        });

        const groups = [];
        if (today.length) groups.push({ label: 'Hoy', items: today });
        if (yesterday.length) groups.push({ label: 'Ayer', items: yesterday });
        if (older.length) groups.push({ label: 'Anteriores', items: older });

        return groups;
    });

    // Icons for template
    // Icons for template (strings)
    readonly icons = {
        Bell: 'bell',
        CheckCheck: 'check-check',
        Clock: 'clock',
        Check: 'check',
        X: 'x',
        Tag: 'tag',
        MessageCircle: 'message-circle',
        AlertCircle: 'alert-circle',
        Filter: 'filter',
        Inbox: 'inbox',
        ClipboardList: 'clipboard-list',
        Settings: 'settings'
    };

    openNotification(notification: AppNotification) {
        if (!notification.is_read) {
            this.service.markAsRead(notification.id);
        }

        // Determine action based on type
        if (notification.type.startsWith('ticket')) {
            this.selectedTicketId.set(notification.reference_id);
        } else if (notification.type === 'gdpr_request') {
            this.selectedGdprRequestId.set(notification.reference_id);
        } else {
            // Just mark as read if no specific view handler
        }
    }

    closeModal() {
        this.selectedTicketId.set(null);
        this.selectedGdprRequestId.set(null);
    }

    formatTypeLabel(type: string): string {
        if (type === 'ticket_created') return 'Nuevos Tickets';
        if (type === 'ticket_comment') return 'Respuestas Tickets';
        if (type === 'ticket_assigned') return 'Tickets Asignados';
        if (type === 'gdpr_request') return 'Solicitudes RGPD';
        return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
    }

    getIconForType(type: string): string {
        if (type.includes('comment')) return 'message-circle';
        if (type.includes('created')) return 'tag';
        if (type.includes('assigned')) return 'alert-circle';
        return 'bell';
    }

    // Settings View
    view = signal<'list' | 'settings'>('list');

    toggleView(view: 'list' | 'settings') {
        this.view.set(view);
    }
}
