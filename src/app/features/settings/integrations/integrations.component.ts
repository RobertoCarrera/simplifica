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
        if (!profile) {
            await new Promise(resolve => setTimeout(resolve, 500));
            profile = this.authService.userProfile;
        }

        if (!profile) {
            this.loading.set(false);
            return;
        }

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

    async connectGoogle() {
        this.loading.set(true);
        try {
            // Setup listener for popup message
            const handleMessage = (event: MessageEvent) => {
                if (event.origin === window.location.origin && event.data?.type === 'GOOGLE_CONNECTED') {
                    if (event.data.error) {
                        this.toast.error('Error', event.data.error);
                    } else {
                        this.loadIntegrations();
                        this.toast.success('Conectado', 'Calendario sincronizado.');
                    }
                    window.removeEventListener('message', handleMessage);
                }
            };
            window.addEventListener('message', handleMessage);

            const { data, error } = await this.supabase.instance.auth.linkIdentity({
                provider: 'google',
                options: {
                    scopes: 'https://www.googleapis.com/auth/calendar',
                    skipBrowserRedirect: true,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent'
                    },
                    redirectTo: window.location.origin + '/configuracion?popup_callback=true'
                }
            });

            if (error) throw error;

            if (data?.url) {
                // Open popup
                const width = 500;
                const height = 600;
                const left = window.screenX + (window.outerWidth - width) / 2;
                const top = window.screenY + (window.outerHeight - height) / 2;

                window.open(
                    data.url,
                    'google-auth',
                    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
                );
            } else {
                // Fallback if no URL returned (shouldn't happen with skipBrowserRedirect: true)
                console.warn('No auth URL returned, checking standard redirect...');
            }

        } catch (e: any) {
            console.error('Link identity failed:', e);
            this.toast.error('Error al conectar', 'No se pudo vincular la cuenta de Google. ' + (e.message || ''));
        } finally {
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
