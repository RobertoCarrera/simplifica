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
            const { data, error } = await this.supabase.getClient()
                .from('notifications')
                .select('*')
                .eq('recipient_id', userId)
                .order('created_at', { ascending: false })
                .limit(50);

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

        this.realtimeChannel = this.supabase.getClient()
            .channel('public:notifications:' + userId)
            .on(
                'postgres_changes',
                {
                    event: '*', // INSERT, UPDATE
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_id=eq.${userId}`
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
}
