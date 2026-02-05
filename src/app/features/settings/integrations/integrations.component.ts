import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
    selector: 'app-integrations',
    standalone: true,
    imports: [CommonModule, FormsModule],
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

    // Calendar Config
    calendars = signal<any[]>([]);
    loadingCalendars = signal<boolean>(false);
    selectedCalendarAppointments = signal<string>('');
    selectedCalendarAvailability = signal<string>('');
    savingConfig = signal<boolean>(false);

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
            .eq('provider', 'google_calendar')
            .maybeSingle();

        if (error) console.error('Error loading integrations:', error);

        console.log('Loaded Integration Data:', data);
        this.googleIntegration.set(data);

        // Pass metadata to listCalendars to handle restoration after fetch
        this.listCalendars(data?.metadata);

        this.loading.set(false);
    }

    async listCalendars(restoreMetadata?: any) {
        this.loadingCalendars.set(true);
        try {
            const { data, error } = await this.supabase.instance.functions.invoke('google-auth', {
                body: { action: 'list-calendars' }
            });

            if (error) throw error;

            const calendars = data.calendars || [];
            this.calendars.set(calendars);

            console.log('Calendars fetched:', calendars.length);
            // 1. Try to restore from metadata
            if (restoreMetadata) {
                if (restoreMetadata.calendar_id_appointments) {
                    const restoredId = restoreMetadata.calendar_id_appointments;
                    const exists = calendars.find((c: any) => c.id === restoredId);
                    if (exists) {
                        this.selectedCalendarAppointments.set(restoredId);
                    } else {
                        this.toast.warning('Mismatch', 'El calendario de citas guardado ya no existe.');
                    }
                }

                if (restoreMetadata.calendar_id_availability) {
                    const restoredId = restoreMetadata.calendar_id_availability;
                    const exists = calendars.find((c: any) => c.id === restoredId);
                    if (exists) {
                        this.selectedCalendarAvailability.set(restoredId);
                    }
                }
            }

            // 2. If valid selection exists, keep it (already set above or by user)
            // 3. If NO selection, default to primary or first

            const currentAppt = this.selectedCalendarAppointments();
            if (!currentAppt) { // Simply check if empty
                if (!restoreMetadata?.calendar_id_appointments) { // Only default if we didn't try to restore
                    const primary = calendars.find((c: any) => c.primary) || calendars[0];
                    if (primary) this.selectedCalendarAppointments.set(primary.id);
                }
            }

            const currentAvail = this.selectedCalendarAvailability();
            if (!currentAvail) {
                if (!restoreMetadata?.calendar_id_availability) {
                    const primary = calendars.find((c: any) => c.primary) || calendars[0];
                    if (primary) this.selectedCalendarAvailability.set(primary.id);
                }
            }

        } catch (e) {
            console.error('Error fetching calendars:', e);
            this.toast.error('Error', 'No se pudieron cargar tus calendarios.');
        } finally {
            this.loadingCalendars.set(false);
        }
    }



    async saveConfiguration() {
        this.savingConfig.set(true);
        try {
            const integration = this.googleIntegration();
            if (!integration) return;

            const metadata = {
                ...integration.metadata,
                calendar_id_appointments: this.selectedCalendarAppointments(),
                calendar_id_availability: this.selectedCalendarAvailability()
            };

            console.log('Saving Configuration:', metadata);

            const { error } = await this.supabase.instance
                .from('integrations')
                .update({ metadata })
                .eq('id', integration.id);

            if (error) throw error;

            this.toast.success('Guardado', 'Configuración de calendario actualizada.');

            // Refresh local state
            this.googleIntegration.update(curr => ({ ...curr, metadata }));

        } catch (e: any) {
            console.error('Error saving config:', e);
            this.toast.error('Error', 'No se pudo guardar la configuración.');
        } finally {
            this.savingConfig.set(false);
        }
    }

    async checkCallback() {
        const code = this.route.snapshot.queryParams['code'];
        const error = this.route.snapshot.queryParams['error'];

        if (error) {
            this.toast.error('Error de Google', error);
            return;
        }

        if (code) {
            // Prevent double execution
            if (this.processingCode()) return;

            this.processingCode.set(true);
            console.log('Processing Google Auth Code:', code);

            // Remove code from URL immediately to prevent re-use
            this.router.navigate([], {
                queryParams: { code: null, scope: null, prompt: null, authuser: null, hd: null },
                queryParamsHandling: 'merge'
            });

            try {
                // FORCE authorized RIs to match Google Console exactly
                let redirectUri = window.location.origin + '/configuracion';

                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    redirectUri = 'http://localhost:4200/configuracion';
                } else if (window.location.hostname === 'app.simplificacrm.es') {
                    redirectUri = 'https://app.simplificacrm.es/configuracion';
                }

                console.log('Sending Exchange Request with Redirect URI:', redirectUri);

                const { data, error } = await this.supabase.instance.functions.invoke('google-auth', {
                    body: {
                        action: 'exchange-code',
                        code,
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
            // FORCE authorized RIs to match Google Console exactly
            let redirectUri = window.location.origin + '/configuracion';

            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                redirectUri = 'http://localhost:4200/configuracion';
            } else if (window.location.hostname === 'app.simplificacrm.es') {
                redirectUri = 'https://app.simplificacrm.es/configuracion';
            }

            console.log('Initiating Auth with Redirect URI:', redirectUri);

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
