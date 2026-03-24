import { Component, inject } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-portal-invite',
  standalone: true,
  imports: [FormsModule, RouterModule],
  template: `
    <div
      class="min-h-screen flex items-center py-4 justify-center bg-gray-50 dark:bg-gray-900 px-4 transition-colors duration-500"
      [style.backgroundColor]="companyColors ? companyColors.primary + '0A' : ''"
      [style.backgroundImage]="
        companyColors
          ? 'radial-gradient(circle at top right, ' +
            companyColors.primary +
            '15, transparent), radial-gradient(circle at bottom left, ' +
            companyColors.primary +
            '10, transparent)'
          : ''
      "
    >
      <div
        class="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700 backdrop-blur-sm bg-white/95 dark:bg-gray-800/95 relative overflow-hidden"
      >
        <!-- Top Accent Bar -->
        <div
          class="absolute top-0 left-0 w-full h-1.5"
          [style.backgroundColor]="companyColors?.primary || '#4f46e5'"
        ></div>

        <!-- Branding Section -->
        <div class="text-center mb-8">
          @if (companyLogoUrl) {
            <div
              class="mb-5 flex justify-center transform hover:scale-105 transition-transform duration-300"
            >
              <img [src]="companyLogoUrl" alt="Company Logo" class="h-20 w-auto object-contain" />
            </div>
          }
          <h1 class="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {{ companyNameDisplay || (isStaff || invitationData?.role === 'owner' ? 'Configura tu Cuenta' : 'Portal de Clientes') }}
          </h1>
          @if (companyNameDisplay) {
            <p
              class="font-semibold mt-2 text-sm"
              [style.color]="companyColors?.primary || '#6366f1'"
            >
              Te ha invitado a unirte a su plataforma
            </p>
          }
        </div>

        @if (loading) {
          <div class="text-center py-8">
            <div
              class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"
            ></div>
            <p class="text-gray-600 dark:text-gray-400">Procesando invitación...</p>
          </div>
        }

        @if (error && !showDetailsForm) {
          <div
            class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4"
          >
            <p class="text-red-800 dark:text-red-200">{{ error }}</p>
          </div>
        }

        @if (success && !showDetailsForm) {
          <div
            class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4"
          >
            <p class="text-green-800 dark:text-green-200">
              ¡Cuenta creada! Redirigiendo al login...
            </p>
          </div>
        }

        <!-- Registration form -->
        @if (showDetailsForm) {
          <form class="space-y-6" (submit)="submitRegistration(); $event.preventDefault()">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                Completa tus datos para finalizar el registro
              </p>
              <div class="flex items-center justify-center gap-2 mb-4">
                <span
                  class="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300"
                >
                  {{ userEmail }}
                </span>
                <span
                  class="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800"
                >
                  {{ getRoleLabel(invitationData?.role) }}
                </span>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  [(ngModel)]="name"
                  (ngModelChange)="persistFormDraft()"
                  name="name"
                  required
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white transition-shadow"
                  placeholder="Tu nombre"
                  [disabled]="submitting"
                  autocomplete="name"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Apellidos
                </label>
                <input
                  type="text"
                  [(ngModel)]="surname"
                  (ngModelChange)="persistFormDraft()"
                  name="surname"
                  required
                  class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white transition-shadow"
                  placeholder="Tus apellidos"
                  [disabled]="submitting"
                  autocomplete="family-name"
                />
              </div>
            </div>
            <!-- Extra fields for Owner/New Company -->
            @if (invitationData?.role === 'owner') {
              <div
                class="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800"
              >
                <h4
                  class="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-3 flex items-center gap-2"
                >
                  <i class="fas fa-building"></i> Datos de tu Nueva Empresa
                </h4>
                <div class="grid grid-cols-1 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >Nombre de la Empresa</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="companyName"
                      (ngModelChange)="persistFormDraft()"
                      name="companyName"
                      class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="Mi Empresa S.L."
                      required
                      [disabled]="submitting"
                      autocomplete="organization"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                      >NIF / CIF</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="companyNif"
                      (ngModelChange)="persistFormDraft()"
                      name="companyNif"
                      class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-emerald-500"
                      placeholder="B12345678"
                      required
                      [disabled]="submitting"
                    />
                  </div>
                </div>
              </div>
            }
            <!-- Password fields removed for Zero Password Policy -->
            <!-- GDPR Consent (Only for Clients and Owners) -->
            @if (!isStaff) {
              <div class="space-y-3 pt-2">
                @if (invitationData?.role === 'client' && hasClinicModule) {
                  <div
                    class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700"
                  >
                    <div class="flex items-center h-5">
                      <input
                        id="health"
                        type="checkbox"
                        [(ngModel)]="healthDataAccepted"
                        (ngModelChange)="persistFormDraft()"
                        name="health"
                        required
                        class="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>
                    <div class="ml-2 text-sm">
                      <label
                        for="health"
                        class="font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                      >
                        Autorizo el tratamiento de mis
                        <span class="font-bold text-gray-900 dark:text-white">datos de salud</span>
                        <span
                          class="text-xs uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded ml-1"
                          >Requerido</span
                        >
                      </label>
                      <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Necesario para la prestación de servicios asistenciales y gestión de
                        historia clínica.
                      </p>
                    </div>
                  </div>
                }
                <div
                  class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700"
                >
                  <div class="flex items-center h-5">
                    <input
                      id="privacy"
                      type="checkbox"
                      [(ngModel)]="privacyAccepted"
                      (ngModelChange)="persistFormDraft()"
                      name="privacy"
                      required
                      class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div class="ml-2 text-sm">
                    <label
                      for="privacy"
                      class="font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                    >
                      He leído y acepto la
                    </label>
                    <a
                      (click)="openLegal($event, '/privacy-policy')"
                      class="text-indigo-600 hover:text-indigo-500 underline font-semibold cursor-pointer ml-1"
                    >política de privacidad</a>
                    <span class="text-red-500">*</span>
                  </div>
                </div>
                <div
                  class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700"
                >
                  <div class="flex items-center h-5">
                    <input
                      id="marketing"
                      type="checkbox"
                      [(ngModel)]="marketingAccepted"
                      (ngModelChange)="persistFormDraft()"
                      name="marketing"
                      class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div class="ml-2 text-sm">
                    <label
                      for="marketing"
                      class="font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                    >
                      Acepto recibir comunicaciones comerciales
                    </label>
                  </div>
                </div>
              </div>
            }
            @if (passwordError) {
              <div
                class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2"
              >
                <span class="text-red-500">⚠️</span>
                <p class="text-sm text-red-800 dark:text-red-200 font-medium">
                  {{ passwordError }}
                </p>
              </div>
            }
            <button
              type="submit"
              [disabled]="disabledState"
              class="w-full font-bold py-4 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
              [style.backgroundColor]="companyColors?.primary || '#4f46e5'"
              [style.color]="getContrastColor(companyColors?.primary || '#4f46e5')"
            >
              {{ submitting ? 'Creando cuenta...' : 'Crear Cuenta' }}
            </button>
            <p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-6 font-medium">
              Al crear la cuenta aceptas nuestros
              <a
                (click)="openLegal($event, '/terms-of-service')"
                class="hover:underline cursor-pointer"
                [style.color]="companyColors?.primary || '#4f46e5'"
                >términos de servicio</a>.
            </p>
            <!-- Legal Shielding Footer -->
            <div
              class="mt-8 border-t border-gray-200 dark:border-gray-700 pt-4 text-xs text-gray-500 dark:text-gray-400"
            >
              <h4
                class="font-bold mb-2 uppercase text-[10px] tracking-wider text-gray-400 dark:text-gray-500"
              >
                Información Básica sobre Protección de Datos
              </h4>
              <table class="w-full text-left border-collapse">
                <tr class="border-b border-gray-100 dark:border-gray-800">
                  <td class="py-1.5 pr-2 font-bold w-24 align-top">Responsable</td>
                  <td class="py-1.5">
                    {{ companyNameDisplay || 'El Responsable del Tratamiento' }}
                  </td>
                </tr>
                <tr class="border-b border-gray-100 dark:border-gray-800">
                  <td class="py-1.5 pr-2 font-bold align-top">Finalidad</td>
                  <td class="py-1.5">
                    Prestación de servicios contratados, gestión administrativa y envío de info.
                    comercial (si se autoriza).
                  </td>
                </tr>
                <tr class="border-b border-gray-100 dark:border-gray-800">
                  <td class="py-1.5 pr-2 font-bold align-top">Legitimación</td>
                  <td class="py-1.5">
                    Ejecución del contrato y consentimiento explícito del interesado.
                  </td>
                </tr>
                <tr class="border-b border-gray-100 dark:border-gray-800">
                  <td class="py-1.5 pr-2 font-bold align-top">Destinatarios</td>
                  <td class="py-1.5">No se cederán datos a terceros, salvo obligación legal.</td>
                </tr>
                <tr>
                  <td class="py-1.5 pr-2 font-bold align-top">Derechos</td>
                  <td class="py-1.5">
                    Acceder, rectificar y suprimir los datos.
                    <a
                      (click)="openLegal($event, '/privacy-policy')"
                      class="text-indigo-600 hover:underline cursor-pointer"
                      >Ver Política de Privacidad</a>.
                  </td>
                </tr>
              </table>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class PortalInviteComponent {
  private readonly formDraftStoragePrefix = 'portal-invite-form-draft';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private gdprService = inject(GdprComplianceService);

  // Form data
  // password = ''; // Removed
  // passwordConfirm = ''; // Removed
  name = '';
  surname = '';
  // New fields for Owner invites (New Company)
  companyName = '';
  companyNif = '';

  // GDPR Consent
  privacyAccepted = false;
  marketingAccepted = false;
  healthDataAccepted = false;
  hasClinicModule = false;

  // UI state
  loading = true;
  submitting = false;
  success = false;
  error: string | null = null;
  userEmail = '';

  // Branding
  companyNameDisplay: string | null = null;
  companyLogoUrl: string | null = null;
  companyColors: { primary: string; secondary: string } | null = null;

  get disabledState(): boolean {
    const needsHealthData = this.invitationData?.role === 'client' && this.hasClinicModule;
    // Privacy is required for clients and owners (!isStaff). Health is required only if needsHealthData is true.
    return (
      this.submitting ||
      !this.name ||
      !this.surname ||
      (!this.privacyAccepted && !this.isStaff) ||
      (needsHealthData && !this.healthDataAccepted)
    );
  }

  getContrastColor(hexcolor: string): string {
    const r = parseInt(hexcolor.substring(1, 3), 16);
    const g = parseInt(hexcolor.substring(3, 5), 16);
    const b = parseInt(hexcolor.substring(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#1a1a1a' : 'white';
  }

  // Registration Form UI
  showDetailsForm = false;

  passwordError = '';

  invitationToken = '';
  invitationData: any = null;

  getRoleLabel(role: string): string {
    const roles: Record<string, string> = {
      owner: 'Propietario',
      admin: 'Administrador',
      member: 'Miembro',
      client: 'Cliente',
      professional: 'Profesional',
      agent: 'Agente',
    };
    return roles[role] || role;
  }

  get isStaff(): boolean {
    const role = this.invitationData?.role;
    // Staff roles: professional, agent, member, admin.
    // Owner also usually needs consents (contracts), but user asked specifically about these roles.
    // Assuming Owner behaves like 'Client' in terms of needing to accept legal terms initially?
    // Actually, Owner creates the company. They MUST accept terms.
    // Staff are invited by Owner, so they are covered by employment/contract.
    return ['professional', 'agent', 'member', 'admin'].includes(role);
  }

  private get formDraftStorageKey(): string {
    return `${this.formDraftStoragePrefix}:${this.invitationToken || this.userEmail || 'pending'}`;
  }

  persistFormDraft() {
    if (typeof window === 'undefined') {
      return;
    }

    const draft = {
      name: this.name,
      surname: this.surname,
      companyName: this.companyName,
      companyNif: this.companyNif,
      privacyAccepted: this.privacyAccepted,
      marketingAccepted: this.marketingAccepted,
      healthDataAccepted: this.healthDataAccepted,
    };

    window.sessionStorage.setItem(this.formDraftStorageKey, JSON.stringify(draft));
  }

  private restoreFormDraft() {
    if (typeof window === 'undefined') {
      return;
    }

    const rawDraft = window.sessionStorage.getItem(this.formDraftStorageKey);
    if (!rawDraft) {
      return;
    }

    try {
      const draft = JSON.parse(rawDraft) as Partial<{
        name: string;
        surname: string;
        companyName: string;
        companyNif: string;
        privacyAccepted: boolean;
        marketingAccepted: boolean;
        healthDataAccepted: boolean;
      }>;

      this.name = draft.name || this.name;
      this.surname = draft.surname || this.surname;
      this.companyName = draft.companyName || this.companyName;
      this.companyNif = draft.companyNif || this.companyNif;
      this.privacyAccepted = draft.privacyAccepted ?? this.privacyAccepted;
      this.marketingAccepted = draft.marketingAccepted ?? this.marketingAccepted;
      this.healthDataAccepted = draft.healthDataAccepted ?? this.healthDataAccepted;
    } catch {
      window.sessionStorage.removeItem(this.formDraftStorageKey);
    }
  }

  private clearFormDraft() {
    if (typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.removeItem(this.formDraftStorageKey);
  }

  private static readonly ALLOWED_LEGAL_URLS = new Set(['/privacy-policy', '/terms-of-service']);

  openLegal(event: Event, url: string) {
    this.persistFormDraft();
    event.preventDefault();
    event.stopPropagation();
    if (!PortalInviteComponent.ALLOWED_LEGAL_URLS.has(url)) {
      return;
    }
    window.open(url, '_blank');
  }

  constructor() {
    this.handle();
  }

  // Password methods removed

  private handle = async () => {
    // 1. Primero manejar magic link si existe (viene del email)
    try {
      const rawHash = window.location.hash;
      const fragment = rawHash.startsWith('#') ? rawHash.substring(1) : rawHash;
      const hashParams = new URLSearchParams(fragment);

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Establecer sesión desde el magic link
        await this.auth.client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        // Limpiar hash para evitar reprocesamiento
        history.replaceState({}, document.title, window.location.pathname + window.location.search);

        // Esperar un momento para que la sesión se establezca
        await new Promise((r) => setTimeout(r, 300));
      } else {
        // No hay magic link: limpiar cualquier sesión stale del browser para evitar
        // el "Invalid Refresh Token" que genera ruido y puede interferir con el flujo.
        await this.auth.client.auth.signOut({ scope: 'local' });
      }
    } catch (e) {
      console.warn('Error processing magic link:', e);
    }

    // 2. Obtener el token de invitación
    let token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      const fragment = (window.location.hash || '').replace(/^#/, '');
      const hashParams = new URLSearchParams(fragment);
      token = hashParams.get('token') || token;
    }

    if (!token) {
      // Si no hay token, intentar obtener el email de la sesión actual
      const {
        data: { user },
      } = await this.auth.client.auth.getUser();
      if (user?.email) {
        // Buscar invitación pendiente por email
        const invData = await this.getInvitationByEmail(user.email);
        if (invData) {
          this.invitationData = invData;
          this.userEmail = invData.email;
          this.loadBranding(invData.company_id);
          this.restoreFormDraft();
          this.loading = false;
          this.showDetailsForm = true;
          return;
        }
      }

      this.loading = false;
      this.error = 'Falta el token de invitación';
      return;
    }

    this.invitationToken = token;

    // 3. Obtener datos de la invitación
    const invData = await this.getInvitationData(token);
    if (!invData) {
      this.loading = false;
      this.error = 'Invitación no válida o expirada';
      return;
    }

    this.invitationData = invData;
    this.userEmail = invData.email;
    this.restoreFormDraft();

    // Si la invitación ya fue aceptada, redirigir directamente al dashboard
    if (invData.status === 'accepted') {
      console.log('✅ Invitation already accepted, redirecting to dashboard');
      this.router.navigate(['/']);
      return;
    }

    // Comprobar si tiene módulo clínico si es un cliente
    if (invData.role === 'client' && invData.company_id) {
      try {
        const { data, error } = await this.auth.client.rpc('check_public_company_module', {
          p_company_id: invData.company_id,
          p_module_key: 'moduloClinico',
        });
        if (!error) {
          this.hasClinicModule = !!data;
        }
      } catch (e) {
        console.warn('Could not check clinic module status', e);
      }
    }

    this.loadBranding(invData.company_id);
    this.loading = false;
    this.showDetailsForm = true;
  };

  private async loadBranding(companyId: string) {
    if (!companyId) return;
    try {
      const { data, error } = await this.auth.client
        .from('companies')
        .select('name, logo_url, settings')
        .eq('id', companyId)
        .maybeSingle();

      if (!error && data) {
        this.companyNameDisplay = data.name;
        this.companyLogoUrl = data.logo_url;
        // Map the properties from the settings JSON - standard is branding.primary_color
        const settings = data.settings || {};
        const branding = settings.branding || {};

        this.companyColors = {
          primary: branding.primary_color || branding.primary || settings.primaryColor || '#4f46e5',
          secondary:
            branding.secondary_color || branding.secondary || settings.secondaryColor || '#10b981',
        };
      }
    } catch (e) {
      console.warn('Could not load company branding');
    }
  }

  private async getInvitationByEmail(email: string): Promise<any> {
    try {
      const { data, error } = await this.auth.client
        .from('company_invitations')
        .select('id, email, company_id, role, status')
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  private async getInvitationData(token: string): Promise<any> {
    try {
      // Usar cliente anónimo para lectura pública
      const { data, error } = await this.auth.client
        .from('company_invitations')
        .select('id, email, company_id, role, status')
        .eq('token', token)
        .maybeSingle();

      if (error) {
        console.error('Error fetching invitation:', error);
        return null;
      }

      if (!data) {
        console.warn('No invitation found for token');
        return null;
      }

      return data;
    } catch (e) {
      console.error('Exception fetching invitation:', e);
      return null;
    }
  }

  async submitRegistration() {
    this.passwordError = '';

    if (!this.name.trim() || !this.surname.trim()) {
      this.passwordError = 'Por favor completa tu nombre y apellido';
      return;
    }

    // Validation for New Company
    if (this.invitationData?.role === 'owner') {
      if (!this.companyName.trim()) {
        this.passwordError = 'Por favor introduce el nombre de la empresa';
        return;
      }
      if (!this.companyNif.trim()) {
        this.passwordError = 'Por favor introduce el NIF/CIF de la empresa';
        return;
      }
    }

    if (!this.isStaff) {
      if (!this.privacyAccepted) {
        this.passwordError = 'Debes aceptar la política de privacidad';
        return;
      }

      const needsHealthData = this.invitationData?.role === 'client' && this.hasClinicModule;
      if (needsHealthData && !this.healthDataAccepted) {
        this.passwordError = 'Debes aceptar el tratamiento de datos de salud';
        return;
      }
    }

    this.submitting = true;

    try {
      // Special flow for New Company Owner
      if (this.invitationData?.role === 'owner') {
        await this.handleOwnerRegistration();
        return;
      }

      // Standard flow (Join existing company)
      await this.handleStandardRegistration();
    } catch (e: any) {
      this.passwordError = e?.message || 'Error inesperado';
      this.submitting = false;
    }
  }

  private async handleOwnerRegistration() {
    // 1. Create User via Edge Function (handles Auth user creation)
    // We reuse create-invited-user but it might need to know this is a special case? No, it just makes the auth user.
    // Actually, we should probably use a dedicated function OR update create-invited-user to handle everything.
    // BUT, simpler approach:
    // a. Create Auth User (using existing function or SignUp if no session)
    // b. Call RPC 'create_company_and_owner' which takes the auth_id and company details.

    // Check session first
    const {
      data: { user: existingUser },
    } = await this.auth.client.auth.getUser();
    let authUserId = existingUser?.id;

    if (!existingUser) {
      // Create user — prefer session JWT over anonKey for authenticated requests
      const { data: { session: currentSession } } = await this.auth.client.auth.getSession();
      const authToken = currentSession?.access_token ?? environment.supabase.anonKey;
      const response = await fetch(`${environment.supabase.url}/functions/v1/create-invited-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: environment.supabase.anonKey,
        },
        body: JSON.stringify({
          email: this.userEmail,
          invitation_token: this.invitationToken,
        }),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Error al crear la cuenta');
      }

      // Automatically logged in by the function returning session
      if (result.session) {
        await this.auth.client.auth.setSession(result.session);
        const {
          data: { user },
        } = await this.auth.client.auth.getUser();
        authUserId = user?.id;
      } else {
        throw new Error('Error al iniciar sesión tras crear cuenta (sin sesión)');
      }
    } else {
      // User exists, just continue
      // No password update needed
    }

    // 2. Call RPC to create company and link user
    // We need a NEW RPC for this: 'register_company_owner'
    // It should: Create Company, Create User (in public.users) linked to company as Owner, Mark Invitation as Accepted.

    const { data: rpcData, error: rpcError } = await this.auth.client.rpc(
      'register_new_owner_from_invite',
      {
        p_invitation_token: this.invitationToken,
        p_company_name: this.companyName,
        p_company_nif: this.companyNif,
        p_user_name: this.name,
        p_user_surname: this.surname,
      },
    );

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      throw new Error(rpcError.message || 'Error al registrar la empresa');
    }

    // Check logical error returned by function
    if (rpcData && (rpcData as any).success === false) {
      console.error('RPC Logic Error:', rpcData);
      throw new Error((rpcData as any).error || 'Error lógico al registrar la empresa');
    }

    // Verify we have a user ID (should be in rpcData or we use the one we created/logged in with)
    // authUserId is valid here.
    if (authUserId) {
      const newCompanyId = (rpcData as any)?.company_id;
      await this.saveConsents(authUserId, this.userEmail, newCompanyId);
    }

    this.finishSuccess();
  }

  private async handleStandardRegistration() {
    // Verificar si ya hay una sesión activa del magic link
    const {
      data: { user: existingUser },
    } = await this.auth.client.auth.getUser();

    if (!existingUser) {
      // No hay sesión - usar Edge Function para crear usuario con email confirmado
      // Prefer session JWT over anonKey when available
      const { data: { session: currentSession } } = await this.auth.client.auth.getSession();
      const authToken = currentSession?.access_token ?? environment.supabase.anonKey;
      const response = await fetch(`${environment.supabase.url}/functions/v1/create-invited-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          apikey: environment.supabase.anonKey,
        },
        body: JSON.stringify({
          email: this.userEmail,
          invitation_token: this.invitationToken,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Error al crear la cuenta');
      }

      if (result.session) {
        await this.auth.client.auth.setSession(result.session);
      } else {
        throw new Error('No se pudo establecer la sesión automáticamente.');
      }
    }

    // Esperar un momento para que la sesión se establezca
    await new Promise((r) => setTimeout(r, 500));

    // Aceptar la invitación
    const res = await this.auth.acceptInvitation(this.invitationToken);
    if (!res.success) {
      console.error('Invitation acceptance failed:', res.error);
      throw new Error(res.error || 'No se pudo aceptar la invitación. Contacta con soporte.');
    }

    // Update User Profile with Name and Surname
    const {
      data: { user: currentUser },
    } = await this.auth.client.auth.getUser();
    if (currentUser) {
      const profile = await this.auth.reloadProfile();
      if (profile) {
        await this.auth.updateProfile(profile.id, {
          name: this.name.trim(),
          surname: this.surname.trim(),
        });
      }
    }

    // Save GDPR Consent
    if (currentUser) {
      await this.saveConsents(currentUser.id, this.userEmail);
    }

    await this.finishSuccess();
  }

  private async saveConsents(authUserId: string, email: string, companyId?: string) {
    // 1. Record individual consents in the logs (GDPR Audit Trail)
    const linkedCompanyId = companyId || this.invitationData?.company_id;

    if (this.privacyAccepted) {
      this.gdprService
        .recordConsent(
          {
            subject_id: authUserId,
            subject_email: email,
            consent_type: 'data_processing',
            consent_given: true,
            consent_method: 'portal_digital',
            purpose: 'Aceptación Política Privacidad en Invitación',
            data_processing_purposes: ['service_delivery', 'contractual'],
          },
          { userId: authUserId, companyId: linkedCompanyId },
        )
        .subscribe();
    }

    if (this.healthDataAccepted) {
      this.gdprService
        .recordConsent(
          {
            subject_id: authUserId,
            subject_email: email,
            consent_type: 'health_data',
            consent_given: true,
            consent_method: 'portal_digital',
            purpose: 'Consentimiento Explícito Datos Salud (Invitación)',
            data_processing_purposes: ['health_data_processing', 'clinical_history'],
          },
          { userId: authUserId, companyId: linkedCompanyId },
        )
        .subscribe();
    }

    // Always record marketing status (even if false, for clarity)
    this.gdprService
      .recordConsent(
        {
          subject_id: authUserId,
          subject_email: email,
          consent_type: 'marketing',
          consent_given: this.marketingAccepted,
          consent_method: 'portal_digital',
          purpose: 'Configuración Comunicaciones Comerciales en Invitación',
          data_processing_purposes: ['marketing'],
        },
        { userId: authUserId, companyId: linkedCompanyId },
      )
      .subscribe();

    // 2. Sync to Clients table (Master Record)
    if (linkedCompanyId) {
      try {
        const { data: clientData } = await this.auth.client
          .from('clients')
          .select('id')
          .eq('email', email)
          .eq('company_id', linkedCompanyId)
          .maybeSingle();

        if (clientData) {
          const updateData: any = {
            name: this.name.trim(),
            surname: this.surname.trim(),
            marketing_consent: this.marketingAccepted,
            data_processing_consent: this.privacyAccepted,
            health_data_consent: this.healthDataAccepted,
            data_processing_consent_date: new Date().toISOString(),
          };

          const { error: syncError } = await this.auth.client
            .from('clients')
            .update(updateData)
            .eq('id', clientData.id);

          if (syncError) console.error('Error syncing client GDPR/Profile:', syncError);
        }
      } catch (e) {
        console.error('Exception during client sync:', e);
      }
    }
  }

  private async finishSuccess() {
    this.clearFormDraft();
    this.success = true;
    this.showDetailsForm = false;

    // Éxito: Ya estamos logueados (por acceptInvitation o magic link), así que redirigimos al dashboard directamente.
    // Evitamos signOut() para no causar parpadeos ni perder la sesión.
    // Pero nos aseguramos de que el perfil está cargado ANTES de navegar para que el Layout sepa qué mostrar.
    await this.auth.reloadProfile();

    // Pequeño retardo para asegurar que los signals se propagan y no hay race condition con el guard
    await new Promise((r) => setTimeout(r, 800));

    // Si después del reload seguimos sin perfil, algo va mal con la membresía; forzamos login como último recurso
    // para cumplir con la petición del usuario de "mejor redirigir a login si está roto".
    const profile = this.auth.userProfileSignal();
    if (!profile) {
      if (this.invitationData?.role === 'owner') {
        console.log('🚀 Owner profile has no company yet, navigating to complete-profile');
        this.router.navigate(['/complete-profile'], { replaceUrl: true });
        return;
      }
      console.warn('Profile still not resolved after reload. Forcing logout/login for stability.');
      await this.auth.logout();
      return;
    }

    // Redirigir a inicio (Staff) o portal (Client)
    const target = profile.role === 'client' ? '/portal' : '/inicio';
    console.log('🚀 Profile ready, navigating to:', target);

    this.router.navigate([target], {
      replaceUrl: true,
    });
  }
}
