import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class GoogleCalendarService {
    private supabase = inject(SupabaseClientService).instance;
    private authService = inject(AuthService);

    // Signals
    isConnected = signal<boolean>(false);
    syncStatus = signal<'idle' | 'syncing' | 'error'>('idle');

    async checkConnectionStatus() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        // Check if we have tokens stored (this usually requires a backend check or checking a flag in the DB)
        // For now, we assume if google_calendar_display_config has data, it might be connected, 
        // OR we check a specific 'google_tokens' table if architected that way.
        // Based on plan, we store tokens in `google_calendar_tokens` or similar.
        // Let's assume we use the provider token from Auth? 
        // The plan said: "Supabase Google Auth & Provider".
        // If using Supabase Auth Provider, the tokens are in `auth.identities` or managed by Supabase.
        // However, for *Company* wide sync, usually we need an offline refresh token stored against the company.

        // For this implementation, let's assume we check the 'companies' table for a config flag 
        // or a separate table. Let's use `google_calendar_display_config` as a proxy for "enabled" for now.

        const { data, error } = await this.supabase
            .from('companies')
            .select('google_calendar_display_config')
            .eq('id', companyId)
            .single();

        if (data && data.google_calendar_display_config && data.google_calendar_display_config.connected) {
            this.isConnected.set(true);
        } else {
            this.isConnected.set(false);
        }
    }

    async connectGoogle() {
        // Trigger OAuth flow
        const { data, error } = await this.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/calendar',
                redirectTo: window.location.origin + '/settings?tab=integrations',
                queryParams: {
                    access_type: 'offline', // Important for Refresh Token
                    prompt: 'consent'
                }
            }
        });

        if (error) throw error;
        // Redirect happens automatically
    }

    async disconnectGoogle() {
        // Remove tokens/config
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        await this.supabase
            .from('companies')
            .update({
                google_calendar_display_config: { connected: false }
            })
            .eq('id', companyId);

        this.isConnected.set(false);
    }
    async listEvents(companyId: string, timeMin: Date, timeMax: Date): Promise<any[]> {
        try {
            const { data, error } = await this.supabase.functions.invoke('google-calendar', {
                body: {
                    action: 'list_events',
                    companyId: companyId,
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString()
                }
            });

            if (error) {
                console.warn('Google Calendar List Events Error:', error);
                return [];
            }
            return data.items || [];
        } catch (e) {
            console.warn('Google Calendar List Exception:', e);
            return [];
        }
    }
}
