import { Injectable, inject, signal, computed, OnDestroy, effect } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import { AuthService } from './auth.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface AppNotification {
  id: string;
  company_id: string;
  recipient_id: string;
  profile_type?: 'owner' | 'professional' | null;
  type: string;
  reference_id: string;
  title: string;
  content: string;
  is_read: boolean;
  created_at: string;
  metadata?: any;
  link?: string; // For invitation notifications
  priority?: NotificationPriority; // low | medium | high | urgent
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseNotificationsService implements OnDestroy {
  private supabase = inject(SimpleSupabaseService);
  private authService = inject(AuthService);

  private _notifications = signal<AppNotification[]>([]);
  readonly notifications = this._notifications.asReadonly();

  readonly unreadCount = computed(() => this._notifications().filter((n) => !n.is_read).length);

  private realtimeChannel: RealtimeChannel | null = null;
  private profileSub: Subscription;

  constructor() {
    // React to user profile changes (Login/Logout)
    this.profileSub = this.authService.userProfile$.subscribe((profile) => {
      if (profile && profile.id) {
        this.fetchNotifications(profile.id);
        this.subscribeToNotifications(profile.id);
      } else {
        this._notifications.set([]);
        this.unsubscribeRealtime();
      }
    });
  }

  ngOnDestroy() {
    this.profileSub.unsubscribe();
    this.unsubscribeRealtime();
  }

  async fetchNotifications(userId: string) {
    if (!userId) return;

    try {
      // Determine identity (Internal vs Client)
      const {
        data: { user },
      } = await this.supabase.getClient().auth.getUser();
      const isClient = this.authService.userProfile?.role === 'client';
      const isInProfessionalMode = this.authService.isInProfessionalMode();
      const activeProfessionalId = this.authService.activeProfessionalId();

      let query = this.supabase
        .getClient()
        .from('notifications')
        .select('id, company_id, recipient_id, profile_type, client_recipient_id, type, title, content, reference_id, is_read, created_at, link, metadata, priority')
        .order('created_at', { ascending: false })
        .limit(50);

      if (isClient) {
        query = query.eq('client_recipient_id', userId);
      } else {
        query = query.eq('recipient_id', userId);

        // Filter by profile_type when NOT in client mode
        // In professional mode: show only professional notifications
        // In owner/admin mode: show only owner notifications (or NULL for legacy)
        if (isInProfessionalMode && activeProfessionalId) {
          query = query.eq('profile_type', 'professional');
        } else {
          // Owner/admin: show owner notifications + legacy ones with NULL profile_type
          query = query.or('profile_type.is.null,profile_type.eq.owner');
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      // Ensure priority defaults to 'medium' for legacy notifications without the field
      const notifications = (data || []).map((n: any) => ({
        ...n,
        priority: n.priority || 'medium',
      }));
      this._notifications.set(notifications);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }

  async markAsRead(id: string) {
    try {
      // Optimistic update
      this._notifications.update((list) =>
        list.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );

      const { error } = await this.supabase
        .getClient()
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);

      if (error) {
        console.error('Error marking as read:', error);
      }
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  }

  async markAllAsRead() {
    const profile = this.authService.userProfile;
    if (!profile?.id) return;
    const isClient = profile.role === 'client';
    const isInProfessionalMode = this.authService.isInProfessionalMode();

    try {
      // Optimistic
      this._notifications.update((list) => list.map((n) => ({ ...n, is_read: true })));

      let query = this.supabase
        .getClient()
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (isClient) {
        query = query.eq('client_recipient_id', profile.id);
      } else {
        query = query.eq('recipient_id', profile.id);

        // Also filter by profile_type in professional mode
        if (isInProfessionalMode) {
          query = query.eq('profile_type', 'professional');
        } else {
          query = query.or('profile_type.is.null,profile_type.eq.owner');
        }
      }

      await query;
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  }

  /** Force-reload notifications from server (called on component mount) */
  async refresh() {
    const profile = this.authService.userProfile;
    if (profile?.id) {
      await this.fetchNotifications(profile.id);
    }
  }

  private subscribeToNotifications(userId: string) {
    this.unsubscribeRealtime();
    const isClient = this.authService.userProfile?.role === 'client';
    const filter = isClient ? `client_recipient_id=eq.${userId}` : `recipient_id=eq.${userId}`;

    this.realtimeChannel = this.supabase
      .getClient()
      .channel('public:notifications:' + userId)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE
          schema: 'public',
          table: 'notifications',
          filter: filter,
        },
        (payload: any) => {
          this.handleRealtimeEvent(payload);
        },
      )
      .subscribe();
  }

  private unsubscribeRealtime() {
    if (this.realtimeChannel) {
      this.supabase.getClient().removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private handleRealtimeEvent(payload: any) {
    const { eventType, new: newRec, old: oldRec } = payload;

    this._notifications.update((currentList) => {
      if (eventType === 'INSERT') {
        return [newRec, ...currentList];
      } else if (eventType === 'UPDATE') {
        return currentList.map((n) => (n.id === newRec.id ? newRec : n));
      } else if (eventType === 'DELETE') {
        return currentList.filter((n) => n.id !== oldRec.id);
      }
      // Limit to 50
      if (currentList.length > 50) {
        return currentList.slice(0, 50);
      }
      return currentList;
    });
  }

  async sendNotification(
    recipientId: string,
    title: string,
    content: string,
    type: string = 'info',
    referenceId: string | null = null,
    isClientRecipient: boolean = false,
    priority: NotificationPriority = 'medium',
    profileType: 'owner' | 'professional' = 'owner',
  ) {
    if (!recipientId) return;

    const companyId = this.authService.companyId();
    try {
      const payload: any = {
        company_id: companyId,
        type,
        title,
        content,
        is_read: false,
        profile_type: profileType,
      };

      if (isClientRecipient) {
        payload.client_recipient_id = recipientId;
      } else {
        payload.recipient_id = recipientId;
      }

      if (referenceId) {
        payload.reference_id = referenceId;
      }

      if (priority && priority !== 'medium') {
        payload.priority = priority;
      }

      await this.supabase.getClient().from('notifications').insert(payload);
    } catch (err) {
      console.error('Error sending notification:', err);
    }
  }
}
