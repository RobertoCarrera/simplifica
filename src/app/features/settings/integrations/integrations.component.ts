import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
    selector: 'app-integrations',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './integrations.component.html',
    styleUrls: ['./integrations.component.scss']
})
export class IntegrationsComponent implements OnInit {
    private supabase = inject(SupabaseClientService);
    private toast = inject(ToastService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    googleIntegration = signal<any>(null);
    loading = signal<boolean>(false);
    processingCode = signal<boolean>(false);

    ngOnInit() {
        this.loadIntegrations();
        this.checkCallback();
    }

    async loadIntegrations() {
        this.loading.set(true);
        const { data: { user } } = await this.supabase.instance.auth.getUser();
        if (!user) return;

        const { data, error } = await this.supabase.instance
            .from('integrations')
            .select('*')
            .eq('user_id', user.id)
            .eq('provider', 'google_calendar')
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading integrations:', error);
        }

        this.googleIntegration.set(data);
        this.loading.set(false);
    }

    async checkCallback() {
        const code = this.route.snapshot.queryParams['code'];
        const error = this.route.snapshot.queryParams['error'];
        const state = this.route.snapshot.queryParams['state'];

        if (error) {
            this.toast.error('Error de Google', error);
            return;
        }

        if (code) {
            this.processingCode.set(true);
            // Remove code from URL immediately to prevent re-use
            this.router.navigate([], {
                queryParams: { code: null, scope: null, prompt: null, authuser: null, hd: null, state: null },
                queryParamsHandling: 'merge'
            });

            try {
                const redirectUri = window.location.origin + window.location.pathname; // Should maintain /configuracion path

                const { data, error } = await this.supabase.instance.functions.invoke('google-auth', {
                    body: {
                        action: 'exchange-code',
                        code,
                        state,
                        redirect_uri: redirectUri
                    }
                });

                if (error || data?.error) {
                    throw new Error(data?.error || error?.message || 'Error desconocido');
                }

                this.toast.success('Conectado', 'Tu calendario de Google se ha conectado correctamente.');
                await this.loadIntegrations();

            } catch (e: any) {
                console.error('Auth Error:', e);
                this.toast.error('Error al conectar', e.message);
            } finally {
                this.processingCode.set(false);
            }
        }
    }

    async connectGoogle() {
        this.loading.set(true);
        try {
            const redirectUri = window.location.origin + window.location.pathname; // Current page (Settings)

            const { data, error } = await this.supabase.instance.functions.invoke('google-auth', {
                body: {
                    action: 'get-auth-url',
                    redirect_uri: redirectUri
                }
            });

            if (error) throw error;
            if (data?.url) {
                window.location.href = data.url;
            }
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo iniciar la conexión con Google');
            console.error(e);
        } finally {
            this.loading.set(false);
        }
    }

    async disconnectGoogle() {
        if (!confirm('¿Estás seguro de que quieres desconectar tu calendario? Las reservas dejarán de sincronizarse.')) return;

        this.loading.set(true);
        // Ideally we should revoke token too, but for now just delete DB entry
        // Or we can call edge function to revoke.
        const id = this.googleIntegration()?.id;
        if (!id) return;

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
        this.loading.set(false);
    }
}
