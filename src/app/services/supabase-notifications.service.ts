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
            const companyId = this.authService.companyId();

            let query = this.supabase.getClient()
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            // Filter: (recipient_id = me OR recipient_id is null) AND company_id = my_company
            if (companyId) {
                query = query
                    .eq('company_id', companyId)
                    .or(`recipient_id.eq.${userId},recipient_id.is.null`);
            } else {
                // Fallback for edge cases with no company (though unlikely for app users)
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

        try {
            // Optimistic
            this._notifications.update(list => list.map(n => ({ ...n, is_read: true })));

            await this.supabase.getClient()
                .from('notifications')
                .update({ is_read: true })
                .eq('recipient_id', profile.id)
                .eq('is_read', false);
        } catch (err) {
            console.error('Error marking all as read:', err);
        }
    }

    private subscribeToNotifications(userId: string) {
        this.unsubscribeRealtime();
        const companyId = this.authService.companyId();

        // If no company, listen only to personal (fallback)
        const filter = companyId
            ? `company_id=eq.${companyId}`
            : `recipient_id=eq.${userId}`;

        this.realtimeChannel = this.supabase.getClient()
            .channel('public:notifications:' + (companyId || userId))
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE
                    schema: 'public',
                    table: 'notifications',
                    filter: filter
                },
                (payload: any) => {
                    this.handleRealtimeEvent(payload, userId);
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

    private handleRealtimeEvent(payload: any, currentUserId: string) {
        const { eventType, new: newRec, old: oldRec } = payload;

        // Security / Relevance Check client-side
        // If it's a new record or update, check if it belongs to us or is global
        const checkRecord = newRec || oldRec;
        if (!checkRecord) return; // Should not happen

        const isMine = checkRecord.recipient_id === currentUserId;
        const isGlobal = checkRecord.recipient_id === null;

        // Note: For global notifications, we assume we have permission since we are in the app.
        // Ideally we check permission service, but RLS prevents FETCHING if not allowed.
        // For Realtime, we might receive it, but we can filter display.
        if (!isMine && !isGlobal) {
            return; // Ignore notifications for others
        }

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
    async sendNotification(recipientId: string, title: string, content: string, type: string = 'info', referenceId: string | null = null) {
        if (!recipientId) return;

        const companyId = this.authService.companyId();
        try {
            const payload: any = {
                company_id: companyId,
                recipient_id: recipientId,
                type,
                title,
                content,
                is_read: false
            };

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
