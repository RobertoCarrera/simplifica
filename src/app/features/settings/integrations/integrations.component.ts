import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';
import { DocplannerIntegrationService, DPFacility, DPDoctor, DPAddress, DoctorMapping, DPService, SyncLogEntry } from '../../../services/docplanner-integration.service';
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
  googleWorkspaceIntegration = signal<any>(null); // Email

  loadingCalendar = signal<boolean>(false);
  loadingDrive = signal<boolean>(false);
  loadingWorkspace = signal<boolean>(false);
  sessionError = signal<string>('');
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
  dpImportingPatients = signal<boolean>(false);
  dpImportPatientsResult = signal<{ imported: number; tagged: number; total: number; message: string; bookings_scanned?: number; skipped_mappings?: number; errors?: string[] } | null>(null);
  dpResolvingAddresses = signal<boolean>(false);
  dpResolveResult = signal<{ resolved: number; unchanged: number; failed: number; total: number; details: string[]; message: string } | null>(null);
  // Collapsible sections
  showDoctorMapping = signal<boolean>(false);
  showServiceMapping = signal<boolean>(false);
  private _servicesAutoLoaded = false;
  // Service mapping
  dpServices = signal<DPService[]>([]);
  loadingDPServices = signal<boolean>(false);
  loadingDPServicesError = signal<string>('');
  crmServices = signal<{ id: string; name: string }[]>([]);
  loadingCRMServices = signal<boolean>(false);
  // Per-doctor service mappings (indexed by dp_doctor_id)
  serviceMappings = signal<Record<string, { dp_service_name: string; dp_address_id: string; crm_service_id: string | null; crm_service_name: string | null; imported_as_new: boolean }[]>>({});
  savingServiceMappings = signal<boolean>(false);
  creatingDPCRMService = signal<string>(''); // dp_service_name being created, empty = none
  // Professionals list for mapping dropdown
  professionals = signal<{ id: string; display_name: string; is_active: boolean }[]>([]);

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

  canUseGoogleDrive = computed(() => this.auth.userRole() === 'super_admin');
  canUseWorkspace = computed(() => this.auth.userRole() === 'super_admin');

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
      .in('provider', ['google_calendar', 'google_drive', 'google_workspace_email']);

    if (error) console.error('Error loading integrations:', error);

    console.log('Loaded Integration Data:', data);

    const calendar = data?.find((i) => i.provider === 'google_calendar') || null;
    const drive = data?.find((i) => i.provider === 'google_drive') || null;
    const workspace = data?.find((i) => i.provider === 'google_workspace_email') || null;

    this.googleIntegration.set(calendar);
    this.googleDriveIntegration.set(drive);
    this.googleWorkspaceIntegration.set(workspace);

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

        // Workspace uses company-email-accounts; Calendar/Drive use google-auth
        const isWorkspace = state === 'workspace';
        const invokeFn = isWorkspace ? 'company-email-accounts' : 'google-auth';
        const body = isWorkspace
          ? { action: 'google-callback', code, redirect_uri: redirectUri }
          : { action: 'exchange-code', code, service: state, redirect_uri: redirectUri };

        const { data, error: invokeError } = await this.supabase.instance.functions.invoke(
          invokeFn,
          { body },
        );

        if (invokeError || data?.error) {
          throw new Error(data?.error || invokeError?.message || 'Error desconocido');
        }

        if (isWorkspace) {
          // data contains { account } from the edge function
          const account = data?.account;
          // Save integration with email_account_id in metadata
          const companyId = this.auth.companyId();
          if (companyId && account?.id) {
            const { error: upsertErr } = await this.supabase.instance.from('integrations').upsert({
              provider: 'google_workspace_email',
              company_id: companyId,
              metadata: { email_account_id: account.id, email: account.email },
            }, { onConflict: 'provider,company_id' });

            if (upsertErr) console.error('[checkCallback] Failed to upsert workspace integration:', upsertErr);
          }
          this.toast.success('Conectado', `Email de Google Workspace conectado correctamente.`);
        } else {
          const providerName = state === 'calendar' ? 'Calendar' : 'Drive';
          this.toast.success(
            'Conectado',
            `Tu cuenta de Google ${providerName} se ha conectado correctamente.`,
          );
        }
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

  async connectGoogle(service: 'calendar' | 'drive' | 'workspace' = 'calendar') {
    if (service === 'calendar') {
      this.loadingCalendar.set(true);
      this.connectCalendarError.set('');
    } else if (service === 'drive') {
      this.loadingDrive.set(true);
      this.connectDriveError.set('');
    } else {
      this.loadingWorkspace.set(true);
    }

    try {
      const redirectUri = window.location.origin + '/configuracion';

      // Workspace uses company-email-accounts edge function; Calendar/Drive use google-auth
      const isWorkspace = service === 'workspace';
      const invokeFn = isWorkspace ? 'company-email-accounts' : 'google-auth';
      let body: any;
      if (isWorkspace) {
        // Find or create a google_workspace account for this company
        const companyId = this.auth.companyId();
        let { data: existingAccounts } = await this.supabase.instance
          .from('company_email_accounts')
          .select('id')
          .eq('provider_type', 'google_workspace')
          .eq('company_id', companyId)
          .limit(1);

        let accountId = existingAccounts?.[0]?.id;

        if (!accountId) {
          const domain = this.auth.currentUser?.email?.split('@')[1];
          if (!domain) throw new Error('No se pudo determinar el dominio de tu email');
          const cleanDomain = domain.trim().toLowerCase();
          const { data: newAccount, error: createErr } = await this.supabase.instance
            .from('company_email_accounts')
            .insert({
              company_id: companyId,
              email: `noreply@${cleanDomain}`,
              display_name: 'Google Workspace',
              provider: 'google_workspace',
              provider_type: 'google_workspace',
              is_active: true,
            })
            .select('id')
            .single();
          if (createErr || !newAccount) {
            throw new Error(`No se pudo crear cuenta Google Workspace: ${createErr?.message ?? 'error desconocido'}`);
          }
          accountId = newAccount.id;
        }
        body = { action: 'get-auth-url', account_id: accountId, redirect_uri: redirectUri };
      } else {
        body = { action: 'get-auth-url', service, redirect_uri: redirectUri };
      }

      // Use supabase.functions.invoke() for company-email-accounts (handles response format correctly)
      const result = await this.supabase.instance.functions.invoke(invokeFn, { body });
      const data = result.data;
      const error = result.error;
      // functions.invoke wraps response in { success, data } envelope
      const inner = data?.data ?? data;

      if (error?.sessionError) throw new Error('session_error');
      if (error) throw error;

      // data.error: surface server-side errors returned with HTTP 200 (shouldn't happen but guard)
      if (data?.error) throw new Error(data.error);
      // google-auth returns { url }; company-email-accounts returns { auth_url }
      const authUrlStr = inner?.url || inner?.auth_url;
      if (!authUrlStr) throw new Error(`La función no devolvió auth_url. data=${JSON.stringify(data)}`);

      const authUrl = new URL(authUrlStr);
      if (!['https:', 'http:'].includes(authUrl.protocol)) {
        throw new Error('URL de autorización con protocolo inválido.');
      }

      // CSRF protection: store nonce in sessionStorage, append to state param
      const csrfNonce = crypto.randomUUID();
      sessionStorage.setItem('oauth_csrf_nonce', csrfNonce);
      authUrl.searchParams.set('state', `${service}:${csrfNonce}`);
      window.location.href = authUrl.toString();

    } catch (e: any) {
      // session_error is handled inline, don't show toast
      if (e.message === 'session_error') return;
      const msg = this.extractErrorMessage(e);
      console.error('[connectGoogle] Error:', e);
      if (service === 'calendar') {
        this.connectCalendarError.set(msg);
      } else if (service === 'drive') {
        this.connectDriveError.set('');
      }
      this.toast.error('Error al conectar', msg);
    } finally {
      if (service === 'calendar') this.loadingCalendar.set(false);
      else if (service === 'drive') this.loadingDrive.set(false);
      else this.loadingWorkspace.set(false);
    }
  }

  async refreshSessionAndRetry(service: 'calendar' | 'drive' | 'workspace' = 'workspace') {
    this.sessionError.set('');
    try {
      const { error: refreshError } = await this.supabase.instance.auth.refreshSession();
      if (refreshError) {
        this.sessionError.set('No se pudo refrescar la sesión.');
        return;
      }
      await this.connectGoogle(service);
    } catch (e: any) {
      if (e.message !== 'session_error') {
        this.sessionError.set(this.extractErrorMessage(e));
      }
    }
  }

  async signOutAndClearSession() {
    await this.supabase.instance.auth.signOut();
    this.sessionError.set('');
    // Clear localStorage session to force fresh login
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-'));
    if (key) localStorage.removeItem(key);
    window.location.href = '/login';
  }

  async disconnectGoogle(service: 'calendar' | 'drive' | 'workspace' = 'calendar') {
    const providerName = service === 'calendar' ? 'calendario' : service === 'drive' ? 'Drive' : 'Workspace email';
    if (!confirm(`¿Estás seguro de que quieres desconectar tu ${providerName}?`)) return;

    if (service === 'calendar') this.loadingCalendar.set(true);
    else if (service === 'drive') this.loadingDrive.set(true);
    else this.loadingWorkspace.set(true);

    const integration =
      service === 'calendar' ? this.googleIntegration()
      : service === 'drive' ? this.googleDriveIntegration()
      : this.googleWorkspaceIntegration();
    const id = integration?.id;
    if (!id) {
      if (service === 'calendar') this.loadingCalendar.set(false);
      else if (service === 'drive') this.loadingDrive.set(false);
      else this.loadingWorkspace.set(false);
      return;
    }

    const { error } = await this.supabase.instance.from('integrations').delete().eq('id', id);

    // For workspace, also clear the email account OAuth tokens (don't delete the record,
    // as it preserves the email address configuration for SMTP fallback)
    if (!error && service === 'workspace') {
      const accountId = integration.metadata?.email_account_id;
      if (accountId) {
        await this.supabase.instance.from('company_email_accounts').update({
          oauth_access_token: null,
          oauth_refresh_token: null,
          oauth_token_expiry: null,
          auth_method: 'password',
          is_verified: false,
          verified_at: null,
        }).eq('id', accountId);
      }
    }

    if (error) {
      this.toast.error('Error', 'No se pudo desconectar');
    } else {
      if (service === 'calendar') {
        this.googleIntegration.set(null);
      } else if (service === 'drive') {
        this.googleDriveIntegration.set(null);
      } else {
        this.googleWorkspaceIntegration.set(null);
      }
      this.toast.success('Desconectado', `Cuenta de Google ${providerName} desconectada.`);
    }

    if (service === 'calendar') this.loadingCalendar.set(false);
    else if (service === 'drive') this.loadingDrive.set(false);
    else this.loadingWorkspace.set(false);
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error';
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
      .select('id, display_name, is_active')
      .eq('company_id', companyId)
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
      // Pre-load address map for all doctors (each doctor may have its own address)
      const addrMap = new Map<string, string>();
      for (const doc of doctors) {
        try {
          const addresses = await this.dpService.getAddresses(facilityId, doc.id);
          if (addresses.length > 0) {
            addrMap.set(String(doc.id), String(addresses[0].id));
          }
        } catch { /* best-effort */ }
      }
      this._dpDoctorAddressMap = addrMap;
      // Keep dpAddresses populated for backward-compat (e.g. UI display)
      if (doctors.length > 0) {
        try {
          const addresses = await this.dpService.getAddresses(facilityId, doctors[0].id);
          this.dpAddresses.set(addresses);
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      this.toast.error('Error', 'No se pudieron cargar los médicos de DocPlanner.');
    } finally {
      this.loadingDPDoctors.set(false);
    }
  }

  /** Maps dp_doctor_id → correct address_id for that doctor */
  private _dpDoctorAddressMap = new Map<string, string>();

  updateDPMapping(doctorId: string, doctorName: string, professionalId: string) {
    const current = this.dpMappings();
    const existing = current.findIndex((m) => m.dp_doctor_id === doctorId);
    const updated = [...current];
    // Use the address resolved for THIS specific doctor, not a shared one
    const addressForDoctor = this._dpDoctorAddressMap.get(String(doctorId))
      || (this.dpAddresses().length > 0 ? this.dpAddresses()[0].id : '');
    if (existing >= 0) {
      // Preserve existing address_id if already set, update professional only
      updated[existing] = { ...updated[existing], professional_id: professionalId };
      // If address was empty or wrong, update it too
      if (!updated[existing].address_id) {
        updated[existing] = { ...updated[existing], address_id: addressForDoctor };
      }
    } else {
      updated.push({ dp_doctor_id: doctorId, dp_doctor_name: doctorName, professional_id: professionalId, address_id: addressForDoctor });
    }
    this.dpMappings.set(updated);
  }

  /** Get the currently mapped CRM service ID for a DP service */
  getDPSvcCRMService(dpService: { id: string; name: string; address_id: string; dp_doctor_id: string }): string {
    const doctorMappings = this.serviceMappings()[dpService.dp_doctor_id] || [];
    const mapping = doctorMappings.find(
      (m) => m.dp_service_name === dpService.name && m.dp_address_id === dpService.address_id,
    );
    return mapping?.crm_service_id || '';
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
      if ((result.roomConflicts ?? 0) > 0) {
        this.toast.warning('Salas ocupadas', `${result.roomConflicts} cita(s) importada(s) sin sala asignada — todas las salas estaban ocupadas en ese horario.`);
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

  toggleDoctorMapping() {
    this.showDoctorMapping.update((v) => !v);
  }

  async toggleServiceMapping() {
    const show = !this.showServiceMapping();
    this.showServiceMapping.set(show);
    // Auto-load services on first expand (same pattern as toggleDPSyncLogs)
    if (show && !this._servicesAutoLoaded) {
      this._servicesAutoLoaded = true;
      await this.importDPServices();
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

  async importDocplannerPatients() {
    if (!this.dpService.integration()?.facility_id && !this.dpSelectedFacility()) {
      this.toast.error('Error', 'Seleccioná una instalación primero.');
      return;
    }
    this.dpImportingPatients.set(true);
    this.dpImportPatientsResult.set(null);
    try {
      const result = await this.dpService.importPatients();
      this.dpImportPatientsResult.set(result);
      const details = [`${result.imported} importado(s)`, `${result.tagged} etiquetado(s)`];
      if (result.total != null) details.push(`de ${result.total} únicos`);
      if (result.bookings_scanned != null) details.push(`${result.bookings_scanned} reservas`);
      this.toast.success('Pacientes importados', details.join(' · '));
      if (result.errors?.length) {
        console.warn('[import-patients] Diagnostics:', result.errors);
      }
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al importar pacientes', msg);
    } finally {
      this.dpImportingPatients.set(false);
    }
  }

  async resolveDocplannerAddresses() {
    this.dpResolvingAddresses.set(true);
    this.dpResolveResult.set(null);
    try {
      const result = await this.dpService.resolveAddresses();
      this.dpResolveResult.set(result);
      if (result.resolved > 0) {
        this.toast.success('Direcciones actualizadas', result.message);
        // Reload integration to get updated mappings
        await this.dpService.loadIntegration();
        const integration = this.dpService.integration();
        if (integration?.doctor_mappings) {
          this.dpMappings.set(integration.doctor_mappings);
        }
      } else if (result.failed > 0) {
        this.toast.warning('Sin cambios', result.message);
      } else {
        this.toast.success('Todo correcto', 'Todas las direcciones ya eran correctas.');
      }
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al resolver direcciones', msg);
    } finally {
      this.dpResolvingAddresses.set(false);
    }
  }

  async loadCRMServices() {
    const companyId = this.auth.companyId();
    if (!companyId) return;
    this.loadingCRMServices.set(true);
    try {
      const { data } = await this.supabase.instance
        .from('services')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');
      if (data) this.crmServices.set(data);
    } finally {
      this.loadingCRMServices.set(false);
    }
  }

  async importDPServices() {
    if (!this.dpSelectedFacility()) {
      this.toast.error('Error', 'Seleccioná una instalación primero.');
      return;
    }
    const integration = this.dpService.integration();
    const mappings = integration?.doctor_mappings || [];
    if (mappings.length === 0) {
      this.toast.error('Error', 'Mapeá al menos un médico antes de importar servicios.');
      return;
    }
    this.loadingDPServices.set(true);
    this.loadingDPServicesError.set('');
    this.dpServices.set([]);
    try {
      await this.loadCRMServices();
      const allServices: { id: string; name: string; address_id: string; type?: string; dp_doctor_id: string }[] = [];
      const seen = new Set<string>(); // dedup: doctor_id|address_id|service_name
      
      // For each doctor mapping, fetch bookings and extract unique address_service entries
      for (const mapping of mappings) {
        if (!mapping.address_id) continue;
        try {
          // Fetch recent bookings from this doctor/address to discover services
          // Doctoralia API requires dates in format: YYYY-MM-DDTHH:MM:SSZ (no milliseconds)
          const now = new Date();
          const fmtDate = (d: Date) => d.toISOString().slice(0, 19) + 'Z';
          const start = fmtDate(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
          const end = fmtDate(new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000));
          const bookings = await this.dpService.getDPBookings(
            this.dpSelectedFacility(),
            mapping.dp_doctor_id,
            mapping.address_id,
            start,
            end,
          );
          for (const bk of bookings) {
            const svc = bk.address_service;
            if (!svc?.name) continue;
            const key = `${mapping.dp_doctor_id}|${mapping.address_id}|${svc.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            allServices.push({
              id: svc.id || svc.name,
              name: svc.name,
              address_id: mapping.address_id,
              dp_doctor_id: mapping.dp_doctor_id,
              type: svc.type || undefined,
            });
          }
        } catch (e) {
          console.warn('[importDPServices] Error fetching services for doctor', mapping.dp_doctor_id, e);
        }
      }
      if (allServices.length === 0) {
        this.loadingDPServicesError.set('No se encontraron servicios en Doctoralia para esta configuración.');
        return;
      }
      this.dpServices.set(allServices);
      // Restore existing service mappings from doctor_mappings
      const restored: Record<string, any[]> = {};
      for (const mapping of mappings) {
        if (mapping.service_mappings?.length) {
          restored[mapping.dp_doctor_id] = [...mapping.service_mappings];
        } else {
          restored[mapping.dp_doctor_id] = [];
        }
      }
      this.serviceMappings.set(restored);
    } catch (e: any) {
      this.loadingDPServicesError.set(this.extractErrorMessage(e));
      this.toast.error('Error al importar servicios', this.loadingDPServicesError());
    } finally {
      this.loadingDPServices.set(false);
    }
  }

  updateServiceMapping(doctorId: string, serviceName: string, addressId: string, crmServiceId: string | null) {
    const current = this.serviceMappings();
    const doctorMappings = current[doctorId] || [];
    const idx = doctorMappings.findIndex(
      (m) => m.dp_service_name === serviceName && m.dp_address_id === addressId,
    );
    const crmService = crmServiceId ? this.crmServices().find((s) => s.id === crmServiceId) : null;
    const updated = [...doctorMappings];
    if (idx >= 0) {
      updated[idx] = { dp_service_name: serviceName, dp_address_id: addressId, crm_service_id: crmServiceId, crm_service_name: crmService?.name || null, imported_as_new: false };
    } else {
      updated.push({ dp_service_name: serviceName, dp_address_id: addressId, crm_service_id: crmServiceId, crm_service_name: crmService?.name || null, imported_as_new: false });
    }
    this.serviceMappings.set({ ...current, [doctorId]: updated });
  }

  async saveServiceMappings() {
    this.savingServiceMappings.set(true);
    try {
      const integration = this.dpService.integration();
      const currentMappings = integration?.doctor_mappings || [];
      // 🛡️ GUARD: never save empty doctor_mappings — it would wipe professional assignments.
      // The user must assign professionals to doctors before saving service mappings.
      if (currentMappings.length === 0) {
        this.toast.error('Error', 'No hay médicos asociados. Asigná los profesionales a los médicos de Doctoralia antes de guardar el mapeo de servicios.');
        return;
      }
      // Merge service_mappings into each doctor mapping
      const newDoctorMappings = currentMappings.map((m: any) => ({
        ...m,
        service_mappings: this.serviceMappings()[m.dp_doctor_id] || [],
      }));
      await this.dpService.saveConfig({
        facility_id: this.dpSelectedFacility(),
        facility_name: this.dpFacilities().find((f) => f.id === this.dpSelectedFacility())?.name || '',
        doctor_mappings: newDoctorMappings,
        sync_bookings: true,
        sync_patients: true,
        auto_sync: true,
      });
      this.toast.success('Guardado', 'Mapeo de servicios guardado correctamente.');
    } catch (e: any) {
      this.toast.error('Error', this.extractErrorMessage(e));
    } finally {
      this.savingServiceMappings.set(false);
    }
  }

  async createServiceFromDP(dpDoctorId: string, dpServiceName: string) {
    const companyId = this.auth.currentCompanyId();
    if (!companyId) return;
    this.creatingDPCRMService.set(dpServiceName);
    try {
      // Insert the Doctoralia service as a new CRM service
      const { data: newService, error } = await this.supabase.instance
        .from('services')
        .insert({
          company_id: companyId,
          name: dpServiceName,
          category: 'Doctoralia',
          is_active: true,
          is_bookable: true,
        })
        .select('id, name')
        .single();
      if (error) throw error;
      if (newService) {
        // Refresh CRM services list
        await this.loadCRMServices();
        // Auto-map the newly created service
        this.updateServiceMapping(dpDoctorId, dpServiceName, '', newService.id);
        this.toast.success('Servicio creado', `"${dpServiceName}" importado de Doctoralia y asociado.`);
      }
    } catch (e: any) {
      this.toast.error('Error', this.extractErrorMessage(e));
    } finally {
      this.creatingDPCRMService.set('');
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

  syncingCalendar = signal<boolean>(false);
  calendarSyncResult = signal<{ synced: number; skipped: number; errors: number } | null>(null);

  async backfillGoogleCalendar() {
    this.syncingCalendar.set(true);
    this.calendarSyncResult.set(null);
    try {
      const { data, error } = await this.supabase.instance.functions.invoke(
        'backfill-gcal-bookings',
        { body: { limit: 200 } }
      );
      if (error) throw error;
      this.calendarSyncResult.set({
        synced: data?.synced ?? 0,
        skipped: data?.skipped ?? 0,
        errors: data?.errors ?? 0,
      });
      if ((data?.errors ?? 0) > 0) {
        this.toast.warning(
          'Sincronización parcial',
          `${data.synced} sincronizada(s), ${data.errors} error(es). Revisa la consola para detalles.`
        );
      } else if ((data?.synced ?? 0) === 0) {
        this.toast.info('Sin cambios', 'Todas las reservas ya estaban sincronizadas con Google Calendar.');
      } else {
        this.toast.success(
          'Sincronización completada',
          `${data.synced} reserva(s) enviadas a Google Calendar.`
        );
      }
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al sincronizar con Calendar', msg);
    } finally {
      this.syncingCalendar.set(false);
    }
  }

  syncingResourceCalendar = signal<boolean>(false);
  resourceCalendarSyncResult = signal<{ synced: number; skipped: number; errors: number } | null>(null);

  async backfillResourceCalendar() {
    this.syncingResourceCalendar.set(true);
    this.resourceCalendarSyncResult.set(null);
    try {
      const { data, error } = await this.supabase.instance.functions.invoke(
        'backfill-gcal-bookings',
        { body: { limit: 200, mode: 'resources' } }
      );
      if (error) throw error;
      this.resourceCalendarSyncResult.set({
        synced: data?.synced ?? 0,
        skipped: data?.skipped ?? 0,
        errors: data?.errors ?? 0,
      });
      if ((data?.errors ?? 0) > 0) {
        this.toast.warning(
          'Sincronización parcial',
          `${data.synced} sala(s) sincronizada(s), ${data.errors} error(es).`
        );
      } else if (data?.synced === 0) {
        this.toast.info('Sin cambios', 'Todas las salas ya estaban sincronizadas con Google Calendar.');
      } else {
        this.toast.success(
          'Sincronización completada',
          `${data.synced} sala(s) enviadas a Google Calendar.`
        );
      }
    } catch (e: any) {
      const msg = this.extractErrorMessage(e);
      this.toast.error('Error al sincronizar salas con Calendar', msg);
    } finally {
      this.syncingResourceCalendar.set(false);
    }
  }
}
