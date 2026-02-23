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

    googleIntegration = signal<any>(null); // Calendar
    googleDriveIntegration = signal<any>(null);

    loadingCalendar = signal<boolean>(false);
    loadingDrive = signal<boolean>(false);
    loadingGlobal = signal<boolean>(false);
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
        this.loadingGlobal.set(true);
        const { data: { user } } = await this.supabase.instance.auth.getUser();
        if (!user) {
            this.loadingGlobal.set(false);
            return;
        }

        const { data, error } = await this.supabase.instance
            .from('integrations')
            .select('*')
            .in('provider', ['google_calendar', 'google_drive']);

        if (error) console.error('Error loading integrations:', error);

        console.log('Loaded Integration Data:', data);
        
        const calendar = data?.find(i => i.provider === 'google_calendar') || null;
        const drive = data?.find(i => i.provider === 'google_drive') || null;

        this.googleIntegration.set(calendar);
        this.googleDriveIntegration.set(drive);

        // Pass metadata to listCalendars to handle restoration after fetch
        if (calendar) {
            this.listCalendars(calendar.metadata);
        }

        this.loadingGlobal.set(false);
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
        const state = this.route.snapshot.queryParams['state'] || 'calendar';

        if (error) {
            this.toast.error('Error de Google', error);
            return;
        }

        if (code) {
            // Prevent double execution
            if (this.processingCode()) return;

            this.processingCode.set(true);
            console.log('Processing Google Auth Code:', code, 'for service:', state);

            // Remove code from URL immediately to prevent re-use
            this.router.navigate([], {
                queryParams: { code: null, scope: null, prompt: null, authuser: null, hd: null, state: null },
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

                const { data, error: invokeError } = await this.supabase.instance.functions.invoke('google-auth', {
                    body: {
                        action: 'exchange-code',
                        code,
                        service: state,
                        redirect_uri: redirectUri
                    }
                });

                if (invokeError || data?.error) {
                    throw new Error(data?.error || invokeError?.message || 'Error desconocido');
                }

                const providerName = state === 'calendar' ? 'Calendar' : 'Drive';
                this.toast.success('Conectado', `Tu cuenta de Google ${providerName} se ha conectado correctamente.`);
                await this.loadIntegrations();

            } catch (e: any) {
                console.error('Auth Error:', e);
                this.toast.error('Error al conectar', e.message);
            } finally {
                this.processingCode.set(false);
            }
        }
    }

    async connectGoogle(service: 'calendar' | 'drive' = 'calendar') {
        if (service === 'calendar') this.loadingCalendar.set(true);
        else this.loadingDrive.set(true);

        try {
            // FORCE authorized RIs to match Google Console exactly
            let redirectUri = window.location.origin + '/configuracion';

            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                redirectUri = 'http://localhost:4200/configuracion';
            } else if (window.location.hostname === 'app.simplificacrm.es') {
                redirectUri = 'https://app.simplificacrm.es/configuracion';
            }

            console.log(`Initiating Auth for ${service} with Redirect URI:`, redirectUri);

            const { data, error } = await this.supabase.instance.functions.invoke('google-auth', {
                body: {
                    action: 'get-auth-url',
                    service: service, // Send the targeted service requested
                    redirect_uri: redirectUri
                }
            });

            if (error) throw error;
            if (data?.url) {
                // Determine a state value to carry through OAuth flow if we were using it,
                // but for now Supabase exchange doesn't cleanly support state without session changes.
                // We rely on the google-auth checking scopes and setting the provider on exchange.
                // Actually, wait, how will exchange know if it's drive or calendar?
                // The edge function can infer from the scopes returned in token, but we should pass it.
                // Google allows a 'state' parameter. Let's append it to the URL.
                const authUrl = new URL(data.url);
                authUrl.searchParams.set('state', service);
                window.location.href = authUrl.toString();
            }
        } catch (e: any) {
            this.toast.error('Error', `No se pudo iniciar la conexión con Google ${service}`);
            console.error(e);
        } finally {
            if (service === 'calendar') this.loadingCalendar.set(false);
            else this.loadingDrive.set(false);
        }
    }

    async disconnectGoogle(service: 'calendar' | 'drive' = 'calendar') {
        const providerName = service === 'calendar' ? 'calendario' : 'Drive';
        if (!confirm(`¿Estás seguro de que quieres desconectar tu ${providerName}?`)) return;

        if (service === 'calendar') this.loadingCalendar.set(true);
        else this.loadingDrive.set(true);

        const integration = service === 'calendar' ? this.googleIntegration() : this.googleDriveIntegration();
        const id = integration?.id;
        if (!id) {
            if (service === 'calendar') this.loadingCalendar.set(false);
            else this.loadingDrive.set(false);
            return;
        }

        const { error } = await this.supabase.instance
            .from('integrations')
            .delete()
            .eq('id', id);

        if (error) {
            this.toast.error('Error', 'No se pudo desconectar');
        } else {
            if (service === 'calendar') {
                this.googleIntegration.set(null);
            } else {
                this.googleDriveIntegration.set(null);
            }
            this.toast.success('Desconectado', `Cuenta de Google ${providerName} desconectada.`);
        }
        
        if (service === 'calendar') this.loadingCalendar.set(false);
        else this.loadingDrive.set(false);
    }
}
