import { Injectable, inject, signal, computed, OnDestroy, effect } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';
import { AuthService } from './auth.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Subscription } from 'rxjs';

export interface AppNotification {
    id: string;
    company_id: string;
    recipient_id: string;
    type: string;
    reference_id: string;
    title: string;
    content: string;
    is_read: boolean;
    created_at: string;
    metadata?: any;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseNotificationsService implements OnDestroy {
    private supabase = inject(SimpleSupabaseService);
    private authService = inject(AuthService);

    private _notifications = signal<AppNotification[]>([]);
    readonly notifications = this._notifications.asReadonly();

    readonly unreadCount = computed(() =>
        this._notifications().filter(n => !n.is_read).length
    );

    private realtimeChannel: RealtimeChannel | null = null;
    private profileSub: Subscription;

    constructor() {
        // React to user profile changes (Login/Logout)
        this.profileSub = this.authService.userProfile$.subscribe(profile => {
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
            const { data: { user } } = await this.supabase.getClient().auth.getUser();
            const isClient = this.authService.userProfile?.role === 'client';

            let query = this.supabase.getClient()
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (isClient) {
                query = query.eq('client_recipient_id', userId);
            } else {
                query = query.eq('recipient_id', userId);
            }

            const { data, error } = await query;

            if (error) throw error;
            this._notifications.set(data || []);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        }
    }

    async markAsRead(id: string) {
        try {
            // Optimistic update
            this._notifications.update(list =>
                list.map(n => n.id === id ? { ...n, is_read: true } : n)
            );

            const { error } = await this.supabase.getClient()
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

        try {
            // Optimistic
            this._notifications.update(list => list.map(n => ({ ...n, is_read: true })));

            let query = this.supabase.getClient()
                .from('notifications')
                .update({ is_read: true })
                .eq('is_read', false);

            if (isClient) {
                query = query.eq('client_recipient_id', profile.id);
            } else {
                query = query.eq('recipient_id', profile.id);
            }

            await query;

        } catch (err) {
            console.error('Error marking all as read:', err);
        }
    }

    private subscribeToNotifications(userId: string) {
        this.unsubscribeRealtime();
        const isClient = this.authService.userProfile?.role === 'client';
        const filter = isClient ? `client_recipient_id=eq.${userId}` : `recipient_id=eq.${userId}`;

        this.realtimeChannel = this.supabase.getClient()
            .channel('public:notifications:' + userId)
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE
                    schema: 'public',
                    table: 'notifications',
                    filter: filter
                },
                (payload: any) => {
                    this.handleRealtimeEvent(payload);
                }
            )
            .subscribe();
    }

    private unsubscribeRealtime() {
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
            this.realtimeChannel = null;
        }
    }

    private handleRealtimeEvent(payload: any) {
        const { eventType, new: newRec, old: oldRec } = payload;

        this._notifications.update(currentList => {
            if (eventType === 'INSERT') {
                return [newRec, ...currentList];
            } else if (eventType === 'UPDATE') {
                return currentList.map(n => n.id === newRec.id ? newRec : n);
            } else if (eventType === 'DELETE') {
                return currentList.filter(n => n.id !== oldRec.id);
            }
            // Limit to 50
            if (currentList.length > 50) {
                return currentList.slice(0, 50);
            }
            return currentList;
        });
    }

    async sendNotification(recipientId: string, title: string, content: string, type: string = 'info', referenceId: string | null = null, isClientRecipient: boolean = false) {
        if (!recipientId) return;

        const companyId = this.authService.companyId();
        try {
            const payload: any = {
                company_id: companyId,
                type,
                title,
                content,
                is_read: false
            };

            if (isClientRecipient) {
                payload.client_recipient_id = recipientId;
            } else {
                payload.recipient_id = recipientId;
            }

            if (referenceId) {
                payload.reference_id = referenceId;
            }

            await this.supabase.getClient()
                .from('notifications')
                .insert(payload);
        } catch (err) {
            console.error('Error sending notification:', err);
        }
    }
}
