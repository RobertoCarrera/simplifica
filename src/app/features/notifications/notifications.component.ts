import { Component, inject, signal, computed, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  LucideIconProvider,
  LUCIDE_ICONS,
  Bell,
  CheckCheck,
  Clock,
  Check,
  X,
  Tag,
  MessageCircle,
  AlertCircle,
  Filter,
  Inbox,
  ClipboardList,
  ArrowRightLeft,
  AlertTriangle,
  CalendarPlus,
  BarChart2,
} from 'lucide-angular';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  SupabaseNotificationsService,
  AppNotification,
} from '../../services/supabase-notifications.service';
import { TicketDetailComponent } from '../../features/tickets/detail/ticket-detail.component';
import { GdprRequestDetailComponent } from '../customers/gdpr-request-detail/gdpr-request-detail.component';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    TicketDetailComponent,
    GdprRequestDetailComponent,
    TranslocoPipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        Bell,
        CheckCheck,
        Clock,
        Check,
        X,
        Tag,
        MessageCircle,
        AlertCircle,
        Filter,
        Inbox,
        ClipboardList,
        ArrowRightLeft,
        AlertTriangle,
        CalendarPlus,
        BarChart2,
      }),
    },
  ],
  templateUrl: './notifications.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent implements OnInit {
  service = inject(SupabaseNotificationsService);
  private router = inject(Router);
  private translocoService = inject(TranslocoService);

  ngOnInit() {
    // Ensure notifications are loaded when component mounts
    this.service.refresh();
    // Auto-detect and show HIGH priority alert on load
    this.showHighPriorityAlertIfPresent();
  }

  // Modal state
  selectedTicketId = signal<string | null>(null);
  selectedGdprRequestId = signal<string | null>(null);

  // HIGH priority alert state — persistent banner until dismissed
  highPriorityAlert = signal<AppNotification | null>(null);

  // Show the most recent unread HIGH priority notification as an intrusive alert
  private showHighPriorityAlertIfPresent() {
    const unread = this.service.notifications().filter((n) => !n.is_read && n.priority === 'high');
    if (unread.length > 0) {
      // Sort by created_at desc and take the most recent
      unread.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      this.highPriorityAlert.set(unread[0]);
    }
  }

  /** Dismiss the HIGH priority alert banner (marks as read) */
  dismissHighPriorityAlert() {
    const alert = this.highPriorityAlert();
    if (alert) {
      this.service.markAsRead(alert.id);
      this.highPriorityAlert.set(null);
    }
  }

  /** Handle the action button on the HIGH priority alert */
  handleHighPriorityAlertAction() {
    const alert = this.highPriorityAlert();
    if (!alert) return;
    // Navigate to the appropriate place based on notification type
    if (alert.type === 'session_end' && alert.reference_id) {
      this.router.navigate(['/booking', alert.reference_id]);
    } else if (alert.link) {
      this.router.navigateByUrl(alert.link);
    }
    this.dismissHighPriorityAlert();
  }

  // Grouped notifications
  // Filter state
  filterStatus = signal<'all' | 'unread' | 'read'>('all');
  filterType = signal<string>('all');

  // Available types for sidebar
  availableTypes = computed(() => {
    const list = this.service.notifications();
    const types = new Set<string>();
    const typeCounts = new Map<string, number>();

    list.forEach((n) => {
      const t = n.type;
      types.add(t);
      typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    });

    return Array.from(types)
      .map((type) => ({
        type,
        label: this.formatTypeLabel(type),
        count: typeCounts.get(type) || 0,
        icon: this.getIconForType(type),
      }))
      .sort((a, b) => b.count - a.count);
  });

  // Grouped notifications with filtering
  groupedNotifications = computed(() => {
    let list = this.service.notifications();

    // Apply Status Filter
    const status = this.filterStatus();
    if (status === 'unread') {
      list = list.filter((n) => !n.is_read);
    } else if (status === 'read') {
      list = list.filter((n) => n.is_read);
    }

    // Apply Type Filter
    const type = this.filterType();
    if (type !== 'all') {
      list = list.filter((n) => n.type === type);
    }

    const today: AppNotification[] = [];
    const yesterday: AppNotification[] = [];
    const older: AppNotification[] = [];

    const now = new Date();
    const todayStr = now.toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toDateString();

    list.forEach((n) => {
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
    AlertTriangle: 'alert-triangle',
    CalendarPlus: 'calendar-plus',
    BarChart2: 'bar-chart-2',
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
    } else if (notification.type === 'client_transfer') {
      this.router.navigate(['/clientes', notification.reference_id]);
    } else if (notification.type === 'project_comment') {
      // Navigate to projects and open the project dialog
      // We need a way to open the specific project.
      // For now, let's just navigate to the projects page.
      // Ideally, we'd have a query param or route to open the dialog.
      this.router.navigate(['/projects'], {
        queryParams: { openProject: notification.reference_id },
      });
    } else if (notification.type === 'session_created') {
      // Navigate to booking detail for new session
      if (notification.reference_id) {
        this.router.navigate(['/booking', notification.reference_id]);
      }
    } else if (notification.type === 'session_end') {
      // Navigate to booking detail for session close workflow
      if (notification.reference_id) {
        this.router.navigate(['/booking', notification.reference_id]);
      }
    } else if (notification.type === 'invitation') {
      // Navigate to the invitation link if available, otherwise to the invite page
      const link = (notification as any).link;
      if (link) {
        // Extract token from link if it contains one
        const url = new URL(link);
        const token = url.searchParams.get('token');
        if (token) {
          this.router.navigate(['/invite'], { queryParams: { token } });
        } else {
          this.router.navigateByUrl(link);
        }
      } else {
        // Fallback: navigate to invite page
        this.router.navigate(['/invite']);
      }
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
    if (type === 'project_comment') return 'Comentarios Proyectos';
    if (type === 'invitation') return 'Invitaciones';
    if (type === 'client_transfer') return 'Traspasos de Clientes';
    if (type === 'session_end') return 'Cierre de Sesión';
    if (type === 'session_created') return 'Nueva sesión';
    if (type === 'daily_digest') return this.translocoService.translate('notifications.sessionDigest');
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
  }

  getIconForType(type: string): string {
    if (type.includes('comment')) return 'message-circle';
    if (type.includes('created')) return 'tag';
    if (type.includes('assigned')) return 'alert-circle';
    if (type === 'project_comment') return 'message-circle';
    if (type === 'invitation') return 'mail';
    if (type === 'client_transfer') return 'arrow-right-left';
    if (type === 'session_end') return 'alert-triangle';
    if (type === 'session_created') return 'calendar-plus';
    if (type === 'daily_digest') return 'bar-chart-2';
    return 'bell';
  }
}
