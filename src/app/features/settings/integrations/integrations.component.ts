import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';
import { DocplannerIntegrationService, DPFacility, DPDoctor, DPAddress, DoctorMapping, SyncLogEntry } from '../../../services/docplanner-integration.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './integrations.component.html',
  styleUrls: ['./integrations.component.scss'],
})
export class IntegrationsComponent implements OnInit {
  private supabase = inject(SupabaseClientService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public auth = inject(AuthService);
  holdedService = inject(HoldedIntegrationService);
  dpService = inject(DocplannerIntegrationService);
  public modulesService = inject(SupabaseModulesService);

  googleIntegration = signal<any>(null); // Calendar
  googleDriveIntegration = signal<any>(null);

  loadingCalendar = signal<boolean>(false);
  loadingDrive = signal<boolean>(false);
  loadingGlobal = signal<boolean>(false);
  processingCode = signal<boolean>(false);

  // Holded
  holdedApiKeyInput   = signal<string>('');
  savingHolded        = signal<boolean>(false);
  holdedConnectError  = signal<string>('');
  testingHolded       = signal<boolean>(false);
  holdedTestResult    = signal<{ ok: boolean; contactCount?: number; error?: string } | null>(null);
  syncingServices     = signal<boolean>(false);
  syncResult          = signal<{ synced: number; errors: string[] } | null>(null);

  // DocPlanner
  dpClientIdInput     = signal<string>('');
  dpClientSecretInput = signal<string>('');
  savingDP            = signal<boolean>(false);
  dpConnectError      = signal<string>('');
  testingDP           = signal<boolean>(false);
  dpTestResult        = signal<{ ok: boolean; facilityCount?: number; facilities?: DPFacility[]; error?: string } | null>(null);
  syncingDP           = signal<boolean>(false);
  dpSyncResult        = signal<{ status: string; synced: number; failed: number; errors: string[] } | null>(null);
  dpFacilities        = signal<DPFacility[]>([]);
  dpDoctors           = signal<DPDoctor[]>([]);
  dpAddresses         = signal<DPAddress[]>([]);
  loadingDPFacilities = signal<boolean>(false);
  loadingDPDoctors    = signal<boolean>(false);
  dpSelectedFacility  = signal<string>('');
  dpMappings          = signal<DoctorMapping[]>([]);
  savingDPConfig      = signal<boolean>(false);
  dpSyncLogs          = signal<SyncLogEntry[]>([]);
  dpShowSyncLogs      = signal<boolean>(false);
  loadingSyncLogs     = signal<boolean>(false);
  dpWebhookCopied     = signal<boolean>(false);
  dpImportingDoctors  = signal<boolean>(false);
  dpImportResult      = signal<{ imported: number; skipped: number; total: number; message: string } | null>(null);
  // Professionals list for mapping dropdown
  professionals       = signal<{ id: string; display_name: string }[]>([]);

  /**
   * Computed signals to check for required modules before enabling Holded.
   * Holded integration requires both 'Presupuestos' and 'Facturación' modules.
   * We use the SupabaseModulesService as the source of truth for the active company.
   */
  hasInvoicingModule = computed(() => {
    return this.modulesService.isModuleEnabled('moduloFacturas') === true;
  });

  hasQuotesModule = computed(() => {
    return this.modulesService.isModuleEnabled('moduloPresupuestos') === true;
  });
  canEnableHolded = computed(() => this.hasInvoicingModule() && this.hasQuotesModule());

  // OAuth connect error messages (inline, survives toast dismissal)
  connectCalendarError = signal<string>('');
  connectDriveError = signal<string>('');

  // Shown in the connected-calendar section when list-calendars fails
  calendarLoadError = signal<string>('');

  // Calendar Config
  calendars = signal<any[]>([]);
  loadingCalendars = signal<boolean>(false);
  selectedCalendarAppointments = signal<string>('');
  selectedCalendarAvailability = signal<string>('');
  savingConfig = signal<boolean>(false);

  async ngOnInit() {
    this.modulesService.fetchEffectiveModules().subscribe();
    this.loadIntegrations();
    this.checkCallback();
    this.holdedService.loadIntegration();
    await this.dpService.loadIntegration();
    this.loadProfessionals();
    // Auto-load facilities + doctors if DP is already connected
    if (this.dpService.isActive()) {
      await this.loadDPFacilities();
    }
  }

  async loadIntegrations() {
    this.loadingGlobal.set(true);
    const {
      data: { user },
    } = await this.supabase.instance.auth.getUser();
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

    const calendar = data?.find((i) => i.provider === 'google_calendar') || null;
    const drive = data?.find((i) => i.provider === 'google_drive') || null;

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
    this.calendarLoadError.set('');
    try {
      let result = await this.supabase.instance.functions.invoke('google-auth', {
        body: { action: 'list-calendars' },
      });

      // 401 = stale/null session (lock-bypass race condition) — refresh and retry once
      if (result.error && (result.error as any)?.context?.status === 401) {
        await this.supabase.instance.auth.refreshSession();
        result = await this.supabase.instance.functions.invoke('google-auth', {
          body: { action: 'list-calendars' },
        });
      }

      const { data, error } = result;
      if (error) throw error;

      // Google OAuth token expired — edge function returns 200 with { error: '...' }
      if (data?.error) {
        this.calendarLoadError.set(
          'La conexión con Google Calendar ha expirado. Vuelve a conectar tu cuenta.'
        );
        return;
      }

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
      if (!currentAppt) {
        // Simply check if empty
        if (!restoreMetadata?.calendar_id_appointments) {
          // Only default if we didn't try to restore
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
      this.calendarLoadError.set(
        'No se pudieron cargar tus calendarios. Comprueba la conexión e inténtalo de nuevo.'
      );
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
        calendar_id_availability: this.selectedCalendarAvailability(),
      };

      console.log('Saving Configuration:', metadata);

      const { error } = await this.supabase.instance
        .from('integrations')
        .update({ metadata })
        .eq('id', integration.id);

      if (error) throw error;

      this.toast.success('Guardado', 'Configuración de calendario actualizada.');

      // Refresh local state
      this.googleIntegration.update((curr) => ({ ...curr, metadata }));
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
    const rawState = this.route.snapshot.queryParams['state'] || 'calendar';

    if (error) {
      this.toast.error('Error de Google', 'La autenticación con Google falló.');
      return;
    }

    // Parse state: format is "service:csrfNonce"
    const stateParts = rawState.split(':');
    const state = stateParts[0] || 'calendar';
    const returnedNonce = stateParts[1] || '';

    if (code) {
      // CSRF verification: compare nonce from state with stored nonce
      const storedNonce = sessionStorage.getItem('oauth_csrf_nonce');
      sessionStorage.removeItem('oauth_csrf_nonce');
      if (!storedNonce || storedNonce !== returnedNonce) {
        this.toast.error('Error de seguridad', 'Token CSRF inválido. Inténtalo de nuevo.');
        return;
      }
      // Prevent double execution
      if (this.processingCode()) return;

      this.processingCode.set(true);
      console.log('Processing Google Auth Code:', code, 'for service:', state);

      // Remove code from URL immediately to prevent re-use
      this.router.navigate([], {
        queryParams: {
          code: null,
          scope: null,
          prompt: null,
          authuser: null,
          hd: null,
          state: null,
        },
        queryParamsHandling: 'merge',
      });

      try {
        const redirectUri = window.location.origin + '/configuracion';

        const { data, error: invokeError } = await this.supabase.instance.functions.invoke(
          'google-auth',
          {
            body: {
              action: 'exchange-code',
              code,
              service: state,
              redirect_uri: redirectUri,
            },
          },
        );

        if (invokeError || data?.error) {
          throw new Error(data?.error || invokeError?.message || 'Error desconocido');
        }

        const providerName = state === 'calendar' ? 'Calendar' : 'Drive';
        this.toast.success(
          'Conectado',
          `Tu cuenta de Google ${providerName} se ha conectado correctamente.`,
        );
        await this.loadIntegrations();
      } catch (e: any) {
        console.error('Auth Error:', e);
        this.toast.error('Error al conectar', e.message);
      } finally {
        this.processingCode.set(false);
      }
    }
  }

  /** Parse the most human-readable message out of a supabase-js FunctionsHttpError or plain Error */
  private extractErrorMessage(e: any): string {
    // FunctionsHttpError exposes a context object with the parsed response body
    try {
      const body = typeof e?.context === 'object' ? e.context : null;
      if (body?.message) return body.message;
      if (body?.error)   return body.error;
    } catch { /* ignore */ }
    return e?.message || 'Error desconocido';
  }

  async connectGoogle(service: 'calendar' | 'drive' = 'calendar') {
    if (service === 'calendar') {
      this.loadingCalendar.set(true);
      this.connectCalendarError.set('');
    } else {
      this.loadingDrive.set(true);
      this.connectDriveError.set('');
    }

    try {
      const redirectUri = window.location.origin + '/configuracion';

      const { data, error } = await this.supabase.instance.functions.invoke('google-auth', {
        body: { action: 'get-auth-url', service, redirect_uri: redirectUri },
      });

      if (error) throw error;
      // data.error: surface server-side errors returned with HTTP 200 (shouldn't happen but guard)
      if (data?.error) throw new Error(data.error);
      if (!data?.url)  throw new Error('La función no devolvió una URL de autorización.');

      const authUrl = new URL(data.url);
      if (!['https:', 'http:'].includes(authUrl.protocol)) {
        throw new Error('URL de autorización con protocolo inválido.');
      }

      // CSRF protection: store nonce in sessionStorage, append to state param
      const csrfNonce = crypto.randomUUID();
      sessionStorage.setItem('oauth_csrf_nonce', csrfNonce);
      authUrl.searchParams.set('state', `${service}:${csrfNonce}`);
      window.location.href = authUrl.toString();

    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      console.error('[connectGoogle] Error:', e);
      if (service === 'calendar') {
        this.connectCalendarError.set(msg);
      } else {
        this.connectDriveError.set(msg);
      }
      this.toast.error('Error al conectar', msg);
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

    const integration =
      service === 'calendar' ? this.googleIntegration() : this.googleDriveIntegration();
    const id = integration?.id;
    if (!id) {
      if (service === 'calendar') this.loadingCalendar.set(false);
      else this.loadingDrive.set(false);
      return;
    }

    const { error } = await this.supabase.instance.from('integrations').delete().eq('id', id);

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

  async syncHoldedServices() {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    this.syncingServices.set(true);
    this.syncResult.set(null);
    try {
      const { data, error } = await this.supabase.instance
        .from('services')
        .select('id, name, description, base_price, tax_rate, unit_type, holded_product_id')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (error) throw error;
      if (!data?.length) {
        this.toast.info('Sin servicios', 'No hay servicios activos para sincronizar.');
        return;
      }

      const result = await this.holdedService.syncServices(data);
      this.syncResult.set(result);

      if (result.errors.length === 0) {
        this.toast.success('Servicios sincronizados', `${result.synced} servicio(s) sincronizados con Holded.`);
      } else {
        this.toast.warning(
          'Sincronización parcial',
          `${result.synced} ok, ${result.errors.length} error(es).`,
        );
      }
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al sincronizar', msg);
    } finally {
      this.syncingServices.set(false);
    }
  }

  /* ── Holded Integration ─────────────────────────────────────── */

  async saveHolded() {
    if (!this.canEnableHolded()) {
      this.toast.warning('Módulos requeridos', 'Debes tener activados los módulos de Presupuestos y Facturación.');
      return;
    }

    const apiKey = this.holdedApiKeyInput().trim();
    if (!apiKey) {
      this.holdedConnectError.set('Introduce la API Key de Holded');
      return;
    }
    this.savingHolded.set(true);
    this.holdedConnectError.set('');

    try {
      await this.holdedService.saveApiKey(apiKey);
      this.holdedApiKeyInput.set('');
      this.toast.success('Holded conectado', 'La integración con Holded se ha activado correctamente.');
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      console.error('[saveHolded] Error:', e);
      this.holdedConnectError.set(msg);
      this.toast.error('Error al conectar Holded', msg);
    } finally {
      this.savingHolded.set(false);
    }
  }

  async disconnectHolded() {
    if (!confirm('¿Desconectar Holded? Las reservas futuras ya no generarán documentos en Holded automáticamente.')) return;

    this.savingHolded.set(true);
    try {
      await this.holdedService.disconnect();
      this.holdedTestResult.set(null);
      this.toast.success('Desconectado', 'La integración con Holded ha sido eliminada.');
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error', msg);
    } finally {
      this.savingHolded.set(false);
    }
  }

  async testHoldedConnection() {
    this.testingHolded.set(true);
    this.holdedTestResult.set(null);
    try {
      // Read-only call: fetch 1 page of contacts — never creates any document
      const contacts = await this.holdedService.listDocuments('contacts', { page: '1' });
      this.holdedTestResult.set({ ok: true, contactCount: Array.isArray(contacts) ? contacts.length : 0 });
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.holdedTestResult.set({ ok: false, error: msg });
    } finally {
      this.testingHolded.set(false);
    }
  }

  /* ── DocPlanner / Doctoralia Integration ────────────────────── */

  private async loadProfessionals() {
    const companyId = this.auth.companyId();
    if (!companyId) return;
    const { data } = await this.supabase.instance
      .from('professionals')
      .select('id, display_name')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('display_name');
    if (data) this.professionals.set(data);
  }

  getDPMappedProfessional(doctorId: string): string {
    const mapping = this.dpMappings().find((m) => m.dp_doctor_id === doctorId);
    return mapping?.professional_id || '';
  }

  async saveDPCredentials() {
    const clientId = this.dpClientIdInput().trim();
    const clientSecret = this.dpClientSecretInput().trim();
    if (!clientId || !clientSecret) {
      this.dpConnectError.set('Introduce el Client ID y Client Secret de DocPlanner');
      return;
    }
    this.savingDP.set(true);
    this.dpConnectError.set('');
    try {
      await this.dpService.saveCredentials(clientId, clientSecret);
      this.dpClientIdInput.set('');
      this.dpClientSecretInput.set('');
      this.toast.success('DocPlanner conectado', 'La integración con DocPlanner se ha activado.');
      // Auto-load facilities after connect
      await this.loadDPFacilities();
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.dpConnectError.set(msg);
      this.toast.error('Error al conectar DocPlanner', msg);
    } finally {
      this.savingDP.set(false);
    }
  }

  async disconnectDP() {
    if (!confirm('¿Desconectar DocPlanner? Las reservas ya no se sincronizarán.')) return;
    this.savingDP.set(true);
    try {
      await this.dpService.disconnect();
      this.dpTestResult.set(null);
      this.dpFacilities.set([]);
      this.dpDoctors.set([]);
      this.dpAddresses.set([]);
      this.dpMappings.set([]);
      this.dpSelectedFacility.set('');
      this.toast.success('Desconectado', 'La integración con DocPlanner ha sido eliminada.');
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error', msg);
    } finally {
      this.savingDP.set(false);
    }
  }

  async testDPConnection() {
    this.testingDP.set(true);
    this.dpTestResult.set(null);
    try {
      const result = await this.dpService.testConnection();
      this.dpTestResult.set(result);
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.dpTestResult.set({ ok: false, error: msg });
    } finally {
      this.testingDP.set(false);
    }
  }

  async loadDPFacilities() {
    this.loadingDPFacilities.set(true);
    try {
      const facilities = await this.dpService.getFacilities();
      this.dpFacilities.set(facilities);
      // If a facility was already configured, pre-select it
      const integration = this.dpService.integration();
      if (integration?.facility_id) {
        this.dpSelectedFacility.set(integration.facility_id);
        await this.loadDPDoctors(integration.facility_id);
      }
      // Restore mappings from integration
      if (integration?.doctor_mappings) {
        this.dpMappings.set(integration.doctor_mappings);
      }
    } catch (e: any) {
      this.toast.error('Error', 'No se pudieron cargar las instalaciones de DocPlanner.');
    } finally {
      this.loadingDPFacilities.set(false);
    }
  }

  async loadDPDoctors(facilityId: string) {
    this.loadingDPDoctors.set(true);
    this.dpSelectedFacility.set(facilityId);
    try {
      const doctors = await this.dpService.getDoctors(facilityId);
      this.dpDoctors.set(doctors);
      // Auto-load addresses for each doctor (first one for now)
      if (doctors.length > 0) {
        const addresses = await this.dpService.getAddresses(facilityId, doctors[0].id);
        this.dpAddresses.set(addresses);
      }
    } catch (e: any) {
      this.toast.error('Error', 'No se pudieron cargar los médicos de DocPlanner.');
    } finally {
      this.loadingDPDoctors.set(false);
    }
  }

  updateDPMapping(doctorId: string, doctorName: string, professionalId: string) {
    const current = this.dpMappings();
    const existing = current.findIndex((m) => m.dp_doctor_id === doctorId);
    const updated = [...current];
    // Use the first available address for this doctor
    const defaultAddress = this.dpAddresses().length > 0 ? this.dpAddresses()[0].id : '';
    if (existing >= 0) {
      updated[existing] = { ...updated[existing], professional_id: professionalId };
    } else {
      updated.push({ dp_doctor_id: doctorId, dp_doctor_name: doctorName, professional_id: professionalId, address_id: defaultAddress });
    }
    this.dpMappings.set(updated);
  }

  async saveDPConfig() {
    this.savingDPConfig.set(true);
    try {
      const facilityId = this.dpSelectedFacility();
      const facility = this.dpFacilities().find((f) => f.id === facilityId);
      await this.dpService.saveConfig({
        facility_id: facilityId,
        facility_name: facility?.name || '',
        doctor_mappings: this.dpMappings(),
        sync_bookings: true,
        sync_patients: true,
        auto_sync: true,
      });
      this.toast.success('Configuración guardada', 'Mapeo de DocPlanner actualizado.');
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error', msg);
    } finally {
      this.savingDPConfig.set(false);
    }
  }

  async syncDPBookings() {
    this.syncingDP.set(true);
    this.dpSyncResult.set(null);
    try {
      const result = await this.dpService.syncBookings();
      this.dpSyncResult.set(result);
      if (result.status === 'success') {
        this.toast.success('Sincronizado', `${result.synced} reserva(s) sincronizadas desde DocPlanner.`);
      } else {
        this.toast.warning('Sincronización parcial', `${result.synced} ok, ${result.failed} error(es).`);
      }
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al sincronizar', msg);
    } finally {
      this.syncingDP.set(false);
    }
  }

  async toggleDPSyncLogs() {
    const show = !this.dpShowSyncLogs();
    this.dpShowSyncLogs.set(show);
    if (show && this.dpSyncLogs().length === 0) {
      await this.loadDPSyncLogs();
    }
  }

  async importDocplannerDoctors() {
    const facilityId = this.dpSelectedFacility() || this.dpService.integration()?.facility_id;
    if (!facilityId) {
      this.toast.error('Error', 'Seleccioná una instalación primero.');
      return;
    }
    this.dpImportingDoctors.set(true);
    this.dpImportResult.set(null);
    try {
      const result = await this.dpService.importDoctors(facilityId);
      this.dpImportResult.set(result);
      this.toast.success('Profesionales importados', `${result.imported} importado(s) · ${result.skipped} ya existían.`);
      await this.loadProfessionals();
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al importar', msg);
    } finally {
      this.dpImportingDoctors.set(false);
    }
  }

  async loadDPSyncLogs() {
    this.loadingSyncLogs.set(true);
    try {
      const logs = await this.dpService.getSyncLogs();
      this.dpSyncLogs.set(logs);
    } finally {
      this.loadingSyncLogs.set(false);
    }
  }

  copyDPWebhookUrl() {
    const url = this.dpService.getWebhookUrl();
    if (url) {
      navigator.clipboard.writeText(url);
      this.dpWebhookCopied.set(true);
      setTimeout(() => this.dpWebhookCopied.set(false), 2000);
    }
  }
}
