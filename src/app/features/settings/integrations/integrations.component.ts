import { Component, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { Session } from '@supabase/supabase-js';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';

@Component({
    selector: 'app-integrations',
    standalone: true,
    imports: [CommonModule, ConfirmModalComponent],
    templateUrl: './integrations.component.html',
    styleUrls: ['./integrations.component.scss']
})
export class IntegrationsComponent implements OnInit {
    private supabase = inject(SupabaseClientService);
    private toast = inject(ToastService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private authService = inject(AuthService);

    @ViewChild(ConfirmModalComponent) confirmModal!: ConfirmModalComponent;

    googleIntegration = signal<any>(null);
    loading = signal<boolean>(false);
    processingCode = signal<boolean>(false);
    error: string | null = null;

    calendars = signal<any[]>([]);
    calendarConfig = signal<any>(null);
    loadingCalendars = signal<boolean>(false);
    savingConfig = signal<boolean>(false);

    ngOnInit() {
        // Subscribe to query params to handle updates reliable (especially in popups)
        this.route.queryParams.subscribe(params => {
            this.checkCallback(params);
        });

        // Load only if not popup
        if (this.route.snapshot.queryParams['popup_callback'] !== 'true' && !window.opener) {
            this.loadIntegrations();
        }
    }

    async loadIntegrations() {
        // Double check not to run in popup
        if (this.route.snapshot.queryParams['popup_callback'] === 'true') return;

        this.loading.set(true);
        // Get Public User Profile from AuthService to ensure we have the correct ID
        let profile = this.authService.userProfile;
        let retries = 0;
        while (!profile && retries < 10) {
            console.warn(`loadIntegrations: User Profile not ready attempt ${retries + 1}/10...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            profile = this.authService.userProfile;
            retries++;
        }

        if (!profile) {
            console.error('loadIntegrations: User Profile TIMEOUT after 5s. Aborting.');
            this.toast.error('Error', 'No se pudo cargar el perfil de usuario. Intenta recargar la página.');
            this.loading.set(false);
            return;
        }

        console.log('loadIntegrations: Profile found, loading for:', profile.id);

        const { data, error } = await this.supabase.instance
            .from('integrations')
            .select('*')
            .eq('user_id', profile.id) // Use Public User ID
            .eq('provider', 'google_calendar')
            .maybeSingle();

        if (error) {
            console.error('Error loading integrations:', error);
        }

        if (data) {
            this.googleIntegration.set(data);
        } else {
            // Fallback: Check if linked in Auth but missing in DB (Orphaned identity)
            const { data: { user } } = await this.supabase.instance.auth.getUser();
            const googleIdentity = user?.identities?.find(id => id.provider === 'google');

            if (googleIdentity) {
                console.warn('Found orphaned Google identity, setting as connected to allow unlink.');
                this.googleIntegration.set({
                    id: null, // No DB ID
                    provider: 'google_calendar',
                    metadata: googleIdentity.identity_data,
                    created_at: googleIdentity.created_at
                });
            } else {
                this.googleIntegration.set(null);
            }
        }

        this.loading.set(false);

        if (this.googleIntegration()) {
            this.fetchCalendars();
            this.loadCalendarConfig();
        }
    }

    loadCalendarConfig() {
        const integration = this.googleIntegration();
        if (integration && integration.metadata) {
            this.calendarConfig.set(integration.metadata);
        } else {
            this.calendarConfig.set(null);
        }
    }

    async fetchCalendars() {
        this.loadingCalendars.set(true);
        try {
            console.log('Invoking google-calendar Edge Function...');
            const { data, error } = await this.supabase.instance.functions.invoke('google-calendar');

            if (error) throw error;

            console.log('Calendars fetched:', data);

            if (data.items) {
                this.calendars.set(data.items.filter((c: any) => c.accessRole === 'owner' || c.accessRole === 'writer'));
            }

        } catch (err: any) {
            console.error('Error fetching calendars:', err);
            this.toast.error('Error', 'No se pudieron cargar los calendarios.');
        } finally {
            this.loadingCalendars.set(false);
        }
    }

    async saveCalendarConfig(availabilityCalendarId: string, bookingCalendarId: string) {
        const integration = this.googleIntegration();
        if (!integration) return;

        this.savingConfig.set(true);
        try {
            const metadata = {
                calendar_id: availabilityCalendarId,
                calendar_id_booking: bookingCalendarId,
                updated_at: new Date().toISOString()
            };

            const { error } = await this.supabase.instance
                .from('integrations')
                .update({ metadata })
                .eq('id', integration.id);

            if (error) throw error;

            this.toast.success('Guardado', 'Configuración de calendario actualizada.');

            // Update local state
            this.googleIntegration.update(curr => ({ ...curr, metadata }));
            this.loadCalendarConfig();

        } catch (e: any) {
            console.error('Error saving config', e);
            this.toast.error('Error', 'No se pudo guardar la configuración.');
        } finally {
            this.savingConfig.set(false);
        }
    }

    async checkCallback(params: any = {}) {
        const code = params['code'];
        const error = params['error'];
        const isPopup = params['popup_callback'] === 'true' || !!window.opener;

        if (isPopup) {
            if (error) {
                console.error('Popup: Error detected from params', error);
                const errorDesc = params['error_description'] || error;
                if (window.opener) {
                    window.opener.postMessage({ type: 'GOOGLE_CONNECTED', error: errorDesc }, window.location.origin);
                }
                window.close();
                return;
            }

            // If we have code or just popup mode but no error, try to exchange/handle session
            this.loading.set(true);
            this.handlePopupSession();
            return;
        }

        if (error) {
            this.toast.error('Error de Google', error);
            // If identity exists error (and not popup), maybe show specific guidance?
            if (error?.includes('identity_already_exists')) {
                this.toast.error('Conflicto', 'Esta cuenta de Google ya está vinculada a otro usuario (o a este).');
            }
            return;
        }

        if (code) {
            this.processingCode.set(true);
            // Standard redirect flow clean up
            this.router.navigate([], {
                queryParams: { code: null, scope: null, prompt: null, authuser: null, hd: null },
                queryParamsHandling: 'merge'
            });

            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                this.toast.success('Conectado', 'Tu calendario de Google se ha conectado correctamente.');
                await this.loadIntegrations();
            } catch (e: any) {
                this.toast.error('Error', e.message);
            } finally {
                this.processingCode.set(false);
            }
        }
    }

    async handlePopupSession() {
        console.log('Popup: Waiting for session...');
        // Wait for auth state change to ensure session is loaded
        const { data: { subscription } } = this.supabase.instance.auth.onAuthStateChange(async (event, session) => {

            console.log('Popup: Auth Event', event);
            if (session) {
                console.log('Popup: Session found', session.user.id);
                // We have a session!
                await this.processPopupToken(session);
                subscription.unsubscribe();
            }
        });

        // Fallback: Check if already having session (race condition where event fired before subscription?)
        const { data: { session } } = await this.supabase.instance.auth.getSession();
        if (session) {
            console.log('Popup: Session found immediately');
            await this.processPopupToken(session);
            subscription.unsubscribe(); // clean up duplicate
        }
    }

    async processPopupToken(session: Session) {
        try {
            const params = this.route.snapshot.queryParams;
            if (params['error']) {
                window.opener?.postMessage({ type: 'GOOGLE_CONNECTED', error: params['error_description'] }, window.location.origin);
                window.close();
                return;
            }

            const providerToken = session.provider_token;
            const refreshToken = session.provider_refresh_token;
            const identity = session.user.identities?.find((i: any) => i.provider === 'google');

            if (providerToken && identity) {
                console.log('Popup: Saving tokens...');
                const { error: insertError } = await this.supabase.instance
                    .from('integrations')
                    .upsert({
                        user_id: session.user.id,
                        provider: 'google_calendar',
                        access_token: providerToken,
                        refresh_token: refreshToken,
                        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                        metadata: identity.identity_data,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id,provider' });

                if (insertError) {
                    console.error('DB Save error', insertError);
                    // Optional: notify opener of error?
                }
            } else {
                console.warn('Popup: No provider token found in session');
            }

            window.opener?.postMessage({ type: 'GOOGLE_CONNECTED', success: true }, window.location.origin);
            setTimeout(() => window.close(), 500);
        } catch (e) {
            console.error('Process Token Error', e);
            window.close();
        }
    }

    async securityUnlinkGoogle() {
        const { data: { user } } = await this.supabase.instance.auth.getUser();
        const identity = user?.identities?.find(id => id.provider === 'google');
        if (identity) {
            console.log('Unlinking existing identity to force fresh token...');
            await this.supabase.instance.auth.unlinkIdentity(identity);
        }
    }

    async connectGoogle() {
        this.loading.set(true);
        this.error = null;

        const companyId = this.authService.companyId();
        if (!companyId) {
            this.toast.error('Error', 'No hay una compañía activa seleccionada.');
            this.loading.set(false);
            return;
        }

        // Store company_id to bind integration on return
        localStorage.setItem('pending_integration_company_id', companyId);

        try {
            // 1. Safety Unlink using internal helper
            await this.securityUnlinkGoogle();

            // 2. Start Link Flow
            console.log('Linking Google identity...');
            const { error } = await this.supabase.instance.auth.linkIdentity({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                    scopes: 'https://www.googleapis.com/auth/calendar',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent select_account',
                    }
                }
            });

            if (error) throw error;

            this.loading.set(false);
        } catch (error: any) {
            console.error('Error connecting Google:', error);
            this.toast.error('Error', 'No se pudo iniciar la conexión con Google.');
            this.loading.set(false);
        }
    }




    async disconnectGoogle() {
        const confirmed = await this.confirmModal.open({
            title: 'Desconectar Google Calendar',
            message: '¿Estás seguro de que quieres desconectar tu calendario? Las reservas dejarán de sincronizarse y tendrás que volver a conectar para reactivar la función.',
            confirmText: 'Sí, desconectar',
            cancelText: 'Cancelar',
            icon: 'fas fa-unlink',
            iconColor: 'red'
        });

        if (!confirmed) return;

        this.loading.set(true);
        const id = this.googleIntegration()?.id;

        try {
            const { data: { user } } = await this.supabase.instance.auth.getUser();
            if (user && user.identities) {
                const googleIdentity = user.identities.find(id => id.provider === 'google');
                if (googleIdentity) {
                    await this.supabase.instance.auth.unlinkIdentity(googleIdentity);
                }
            }
        } catch (e) {
            console.warn('Could not unlink identity', e);
        }

        if (id) {
            const { error } = await this.supabase.instance
                .from('integrations')
                .delete()
                .eq('id', id);

            if (error) {
                this.toast.error('Error', 'No se pudo desconectar');
            } else {
                this.googleIntegration.set(null);
                this.toast.success('Desconectado', 'Cuenta de Google desconectada.');
            }
        } else {
            this.googleIntegration.set(null);
            this.toast.success('Desconectado', 'Cuenta de Google desconectada.');
        }


        this.loading.set(false);
    }
}
