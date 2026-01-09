import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Bell, CheckCheck, Clock, Check, X, Tag, MessageCircle, AlertCircle } from 'lucide-angular';
import { SupabaseNotificationsService, AppNotification } from '../../services/supabase-notifications.service';
import { TicketDetailComponent } from '../../features/tickets/detail/ticket-detail.component';
import { GdprRequestDetailComponent } from '../customers/gdpr-request-detail/gdpr-request-detail.component';

@Component({
    selector: 'app-notifications',
    standalone: true,
    imports: [CommonModule, LucideAngularModule, TicketDetailComponent, GdprRequestDetailComponent],
    providers: [{ provide: LUCIDE_ICONS, useValue: new LucideIconProvider({ Bell, CheckCheck, Clock, Check, X, Tag, MessageCircle, AlertCircle }) }],
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
    private router = inject(Router);

    // Modal state
    selectedTicketId = signal<string | null>(null);
    selectedGdprRequestId = signal<string | null>(null);

    // Grouped notifications
    groupedNotifications = computed(() => {
        const list = this.service.notifications();
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
        AlertCircle: 'alert-circle'
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

    getIconForType(type: string): string {
        if (type.includes('comment')) return 'message-circle';
        if (type.includes('created')) return 'tag';
        if (type.includes('assigned')) return 'alert-circle';
        return 'bell';
    }
}
