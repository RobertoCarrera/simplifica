import { Component, inject, signal, OnInit } from "@angular/core";

import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthService } from "../../../services/auth.service";
import { SupabaseSettingsService } from "../../../services/supabase-settings.service";
import { SupabaseService } from "../../../services/supabase.service";
import {
  getDefaultOnboardingPolicy,
  normalizeOnboardingSubmissionData,
  onboardingFieldDefinitions,
  type ClientOnboardingFieldKey,
  type CompanyOnboardingFieldKey,
  type OnboardingFieldDefinition,
  type OnboardingFieldMode,
  type OnboardingPolicy,
  type OnboardingScope,
  type OnboardingSubmissionData,
  type UserOnboardingFieldKey,
} from "../../../services/onboarding-policy";

type OnboardingFieldKey = UserOnboardingFieldKey | ClientOnboardingFieldKey | CompanyOnboardingFieldKey;

@Component({
  selector: "app-complete-profile",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-200"
    >
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <!-- Step indicator -->
        <div class="flex items-center justify-center gap-3 mb-6">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
              [class.bg-blue-600]="step() === 1"
              [class.text-white]="step() === 1"
              [class.bg-green-500]="step() === 2"
              [class.text-white]="step() === 2">
              @if (step() === 2) { ✓ } @else { 1 }
            </div>
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Tus datos</span>
          </div>
          <div class="w-8 h-px bg-gray-300 dark:bg-gray-600"></div>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors"
              [class.bg-blue-600]="step() === 2"
              [class.text-white]="step() === 2"
              [class.bg-gray-200]="step() === 1"
              [class.text-gray-500]="step() === 1">
              2
            </div>
            <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Seguridad 2FA</span>
          </div>
        </div>

        <h2
          class="text-center text-3xl font-extrabold text-gray-900 dark:text-white"
        >
          @if (step() === 1) { Completa tu perfil }
          @if (step() === 2) { Activa la verificación en 2 pasos }
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          @if (step() === 1) { Necesitamos algunos datos adicionales para configurar tu cuenta. }
          @if (step() === 2) { Obligatorio para proteger el acceso a datos de salud de tus pacientes. }
        </p>
      </div>

      <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors duration-200"
        >

          <!-- ── STEP 1: Profile data ── -->
          @if (step() === 1) {
            <form class="space-y-6" (submit)="goToStep2($event)">
              @if (policyLoading()) {
                <div class="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-300">
                  Cargando política de onboarding...
                </div>
              }

              @if (!policyLoading()) {
                @for (section of onboardingSections; track section.scope) {
                  @if (hasVisibleFields(section.scope)) {
                    <section class="space-y-4">
                      <div>
                        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{{ section.title }}</h3>
                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ section.description }}</p>
                      </div>

                      @for (field of getVisibleFields(section.scope); track field.key) {
                        <div>
                          <label [for]="field.key" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            {{ field.label }}
                            @if (isFieldRequired(field)) {
                              <span class="text-red-500">*</span>
                            }
                          </label>
                          <div class="mt-1">
                            <input
                              [id]="field.key"
                              [name]="field.key"
                              [type]="field.inputType || 'text'"
                              [autocomplete]="field.autocomplete || 'off'"
                              [required]="isFieldRequired(field)"
                              [ngModel]="getFieldValue(field.key)"
                              (ngModelChange)="setFieldValue(field.key, $event)"
                              [ngModelOptions]="{ standalone: true }"
                              class="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white sm:text-sm transition-colors duration-200"
                              [placeholder]="field.placeholder || ''"
                            />
                          </div>
                          @if (field.description) {
                            <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">{{ field.description }}</p>
                          }
                        </div>
                      }
                    </section>
                  }
                }
              }

              @if (error()) {
                <div class="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
                  <p class="text-sm text-red-800 dark:text-red-200">{{ error() }}</p>
                </div>
              }

              <!-- Art. 13 RGPD Notice -->
              <div class="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                <h3 class="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">Información sobre protección de datos</h3>
                <ul class="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <li><strong>Responsable:</strong> Roberto Carrera Santa María (NIF: 45127276B)</li>
                  <li><strong>Finalidad:</strong> Gestión de su cuenta y prestación del servicio SimplificaCRM.</li>
                  <li><strong>Base jurídica:</strong> Ejecución de contrato (Art. 6.1.b RGPD).</li>
                  <li><strong>Derechos:</strong> Puede ejercer sus derechos de acceso, rectificación, supresión y portabilidad escribiendo a <a href="mailto:dpo@simplificacrm.es" class="underline">dpo&#64;simplificacrm.es</a>.</li>
                </ul>
              </div>

              <!-- Privacy acceptance checkbox -->
              <div class="flex items-start gap-3">
                <input id="privacyAccepted" name="privacyAccepted" type="checkbox" required [(ngModel)]="privacyAccepted"
                  class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                <label for="privacyAccepted" class="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                  He leído y acepto la
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline font-medium">Política de Privacidad</a>
                  de SimplificaCRM. <span class="text-red-500">*</span>
                </label>
              </div>

              <button type="submit" [disabled]="!canContinue()"
                class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200">
                Continuar →
              </button>

              <div class="text-center">
                <button type="button" (click)="logout()"
                  class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 underline transition-colors duration-200">
                  Cerrar sesión e intentar con otra cuenta
                </button>
              </div>
            </form>
          }

          <!-- ── STEP 2: Mandatory TOTP enrollment ── -->
          @if (step() === 2) {
            <div class="space-y-6">
              <!-- Why mandatory banner -->
              <div class="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
                <div class="flex gap-3">
                  <span class="text-amber-500 text-xl">🔐</span>
                  <div>
                    <p class="text-sm font-semibold text-amber-800 dark:text-amber-200">¿Por qué es obligatorio?</p>
                    <p class="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Simplifica gestiona datos de salud protegidos por el RGPD (Art. 9). La verificación en 2 pasos es un control de seguridad técnico exigido por normativa.
                    </p>
                  </div>
                </div>
              </div>

              @if (totpLoading()) {
                <div class="text-center py-6 text-gray-500 dark:text-gray-400">
                  <div class="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                  <p class="text-sm">Generando código QR...</p>
                </div>
              }

              @if (!totpLoading() && totpQr()) {
                <div class="text-center space-y-3">
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    1. Descarga <strong>Google Authenticator</strong>, <strong>Authy</strong> o cualquier app TOTP.<br>
                    2. Escanea el código QR con la app.
                  </p>
                  <div class="flex justify-center">
                    <img [src]="totpQr()" alt="QR Code 2FA" class="w-48 h-48 border-4 border-white rounded-lg shadow-md" />
                  </div>
                  <details class="text-left">
                    <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">¿No puedes escanear? Introducir clave manualmente</summary>
                    <div class="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs break-all text-center text-gray-800 dark:text-gray-200 select-all">
                      {{ totpSecret() }}
                    </div>
                  </details>
                </div>

                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    3. Introduce el código de 6 dígitos que muestra la app
                  </label>
                  <input
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    [(ngModel)]="totpCode"
                    placeholder="000000"
                    maxlength="6"
                    class="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-700 dark:text-white"
                    [disabled]="totpVerifying()"
                  />
                </div>

                @if (error()) {
                  <div class="rounded-md bg-red-50 dark:bg-red-900/30 p-3">
                    <p class="text-sm text-red-800 dark:text-red-200">{{ error() }}</p>
                  </div>
                }

                <button
                  (click)="onSubmit()"
                  [disabled]="totpCode.length < 6 || totpVerifying() || loading()"
                  class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200">
                  @if (totpVerifying() || loading()) { <span>Procesando...</span> }
                  @else { <span>✓ Activar 2FA y crear cuenta</span> }
                </button>
              }

              <div class="text-center">
                <button type="button" (click)="logout()"
                  class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 underline transition-colors duration-200">
                  Cerrar sesión
                </button>
              </div>
            </div>
          }

        </div>
      </div>
    </div>
  `,
})
export class CompleteProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private supabase = inject(SupabaseService);
  private settings = inject(SupabaseSettingsService);

  onboardingSections: Array<{ scope: OnboardingScope; title: string; description: string }> = [
    {
      scope: 'user',
      title: 'Datos de usuario',
      description: 'Información básica de la persona que accede a la cuenta.',
    },
    {
      scope: 'client',
      title: 'Datos de cliente',
      description: 'Datos comerciales y de contacto que se guardarán cuando exista un perfil cliente asociado.',
    },
    {
      scope: 'company',
      title: 'Datos de empresa',
      description: 'Información necesaria para crear o completar la organización inicial.',
    },
  ];
  onboardingValues = onboardingFieldDefinitions.reduce((accumulator, field) => {
    accumulator[field.key] = '';
    return accumulator;
  }, {} as Record<string, string>);
  policy = signal<OnboardingPolicy>(getDefaultOnboardingPolicy());
  policyLoading = signal(true);
  privacyAccepted = false;

  // ── Invited user detection ──
  isInvitedUser = signal(false);
  isOwnerInvite = signal(false);
  inviteCompanyId = signal<string | null>(null);

  // ── Shared state ──
  step = signal<1 | 2>(1);
  loading = signal(false);
  error = signal<string | null>(null);

  // ── Step 2: TOTP enrollment ──
  private totpFactorId = "";
  totpQr = signal<string | null>(null);
  totpSecret = signal<string | null>(null);
  totpLoading = signal(false);
  totpVerifying = signal(false);
  totpCode = "";

  async ngOnInit() {
    // Check if navigating here directly after accepting an invite.
    // When `from=invite`, the user is active but hasn't filled in their profile yet,
    // so we must NOT auto-redirect them to /inicio.
    // `from=incomplete` means the user was blocked by OwnerAdminGuard and needs to finish onboarding.
    const fromInvite = this.route.snapshot.queryParamMap.get('from') === 'invite';
    const fromIncomplete = this.route.snapshot.queryParamMap.get('from') === 'incomplete';
    const inviteRole = this.route.snapshot.queryParamMap.get('role');

    this.bootstrapFieldValues();

    // Detect invited users: Supabase sets invited_at for users created via inviteUserByEmail.
    // Owners who self-register have invited_at = null.
    // When coming from invite acceptance, status is already 'accepted' — detectPendingInvitation
    // (which queries status='pending') would return nothing. Force the signals directly instead.
    if (fromInvite) {
      this.isInvitedUser.set(true);
      if (inviteRole === 'owner') {
        this.isOwnerInvite.set(true);
      }
    } else if (fromIncomplete) {
      // User was redirected by OwnerAdminGuard because onboarding wasn't completed.
      // They need to finish onboarding before accessing the app.
      this.isInvitedUser.set(true);
      if (inviteRole === 'owner') {
        this.isOwnerInvite.set(true);
      }
    } else {
      const currentUser = this.auth.currentUser;
      if (currentUser?.invited_at) {
        this.isInvitedUser.set(true);
        await this.detectPendingInvitation(currentUser.email);
      }
    }

    // For owner invites (including from=incomplete), load existing company data if available
    if (this.isOwnerInvite()) {
      await this.loadExistingCompanyData();
    }

    await this.loadOnboardingPolicy();

    // Only auto-redirect active users away from this page when NOT coming from a fresh invite
    // acceptance or incomplete onboarding. After accepting an invite or being redirected for incomplete
    // onboarding, the user needs to complete their profile.
    if (!fromInvite && !fromIncomplete) {
      this.auth.userProfile$.subscribe((profile) => {
        if (profile && profile.role !== "none" && profile.active) {
          this.router.navigate(["/inicio"]);
        }
      });
    }
  }

  private bootstrapFieldValues() {
    const currentUser = this.auth.currentUser;
    const metadata = (currentUser?.user_metadata ?? {}) as Record<string, unknown>;
    const submission = normalizeOnboardingSubmissionData(metadata['onboarding_profile']);

    this.onboardingValues['name'] = submission.user.name ?? (typeof metadata['given_name'] === 'string' ? metadata['given_name'] : '');
    this.onboardingValues['surname'] = submission.user.surname ?? (typeof metadata['surname'] === 'string' ? metadata['surname'] : '');
    this.onboardingValues['company_name'] = submission.company.company_name ?? (typeof metadata['company_name'] === 'string' ? metadata['company_name'] : '');
    this.onboardingValues['company_nif'] = submission.company.company_nif ?? '';
    this.onboardingValues['phone'] = submission.client.phone ?? '';
    this.onboardingValues['dni'] = submission.client.dni ?? '';
    this.onboardingValues['billing_email'] = submission.client.billing_email ?? '';
    this.onboardingValues['website'] = submission.client.website ?? '';
    this.onboardingValues['business_name'] = submission.client.business_name ?? '';
    this.onboardingValues['trade_name'] = submission.client.trade_name ?? '';
  }

  /**
   * For owner invites to EXISTING companies: pre-populate company data from DB.
   * Owner creates their own company in the invite component (Step 1 company setup),
   * but owners joining an existing company have no company data in the invite.
   */
  private async loadExistingCompanyData() {
    if (!this.isOwnerInvite()) return;
    try {
      const { data: { user } } = await this.supabase.db.auth.getUser();
      if (!user) return;
      // Get user's public user record which has company_id
      const { data: userData, error: userErr } = await this.supabase.db
        .from('users')
        .select('company_id, name, surname')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (userErr || !userData?.company_id) return;
      // Get company data
      const { data: companyData, error: companyErr } = await this.supabase.db
        .from('companies')
        .select('name, nif')
        .eq('id', userData.company_id)
        .maybeSingle();
      if (companyErr || !companyData) return;
      // Pre-populate if not already set from metadata
      if (!this.onboardingValues['company_name'] && companyData.name) {
        this.onboardingValues['company_name'] = companyData.name;
      }
      if (!this.onboardingValues['company_nif'] && companyData.nif) {
        this.onboardingValues['company_nif'] = companyData.nif;
      }
      if (!this.onboardingValues['name'] && userData.name) {
        this.onboardingValues['name'] = userData.name;
      }
      if (!this.onboardingValues['surname'] && userData.surname) {
        this.onboardingValues['surname'] = userData.surname;
      }
    } catch (e) {
      console.warn('⚠️ Could not load existing company data:', e);
    }
  }

  private async detectPendingInvitation(email?: string | null) {
    if (!email) return;
    try {
      const { data } = await this.supabase.db
        .from('company_invitations')
        .select('role, company_id')
        .eq('email', email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (data?.role === 'owner') {
        this.isOwnerInvite.set(true);
      }
      this.inviteCompanyId.set(data?.company_id ?? null);
    } catch {
      // Silent: if the query fails we don't show the field (safe default for non-owners).
    }
  }

  private async loadOnboardingPolicy() {
    this.policyLoading.set(true);
    try {
      const policy = await this.settings.getEffectiveOnboardingPolicy(this.inviteCompanyId() || undefined);
      this.policy.set(policy);
    } catch {
      this.policy.set(getDefaultOnboardingPolicy());
    } finally {
      this.policyLoading.set(false);
    }
  }

  getVisibleFields(scope: OnboardingScope): OnboardingFieldDefinition[] {
    if (!this.shouldShowScope(scope)) {
      return [];
    }

    return onboardingFieldDefinitions.filter((field) => {
      if (field.scope !== scope) {
        return false;
      }
      return this.getFieldMode(field) !== 'hidden';
    });
  }

  hasVisibleFields(scope: OnboardingScope): boolean {
    return this.getVisibleFields(scope).length > 0;
  }

  getFieldMode(field: OnboardingFieldDefinition): OnboardingFieldMode {
    const scopedPolicy = this.policy()[field.scope] as Record<string, OnboardingFieldMode>;
    return scopedPolicy[field.key] ?? 'hidden';
  }

  isFieldRequired(field: OnboardingFieldDefinition): boolean {
    return this.getFieldMode(field) === 'required';
  }

  getFieldValue(fieldKey: string): string {
    return this.onboardingValues[fieldKey] ?? '';
  }

  setFieldValue(fieldKey: string, value: string) {
    this.onboardingValues[fieldKey] = value;
  }

  canContinue(): boolean {
    if (this.policyLoading() || !this.privacyAccepted) {
      return false;
    }

    return this.getMissingRequiredFields().length === 0;
  }

  private shouldShowScope(scope: OnboardingScope): boolean {
    if (scope === 'user') {
      return true;
    }

    if (scope === 'company') {
      return !this.isInvitedUser() || this.isOwnerInvite();
    }

    if (scope === 'client') {
      return !this.isInvitedUser() || this.isOwnerInvite();
    }

    return false;
  }

  private getMissingRequiredFields(): string[] {
    return this.onboardingSections.flatMap((section) =>
      this.getVisibleFields(section.scope)
        .filter((field) => this.isFieldRequired(field) && !this.getFieldValue(field.key as OnboardingFieldKey).trim())
        .map((field) => field.label),
    );
  }

  private buildSubmission(): OnboardingSubmissionData {
    const rawSubmission: OnboardingSubmissionData = {
      user: {},
      client: {},
      company: {},
    };

    for (const section of this.onboardingSections) {
      for (const field of this.getVisibleFields(section.scope)) {
        const value = this.getFieldValue(field.key as OnboardingFieldKey).trim();
        if (!value) {
          continue;
        }

        rawSubmission[section.scope][field.key as keyof typeof rawSubmission[typeof section.scope]] = value as never;
      }
    }

    return normalizeOnboardingSubmissionData(rawSubmission);
  }

  /** Step 1 submit: validate + enroll TOTP → go to step 2 */
  async goToStep2(event: Event) {
    event.preventDefault();
    const missingFields = this.getMissingRequiredFields();
    if (missingFields.length > 0 || !this.privacyAccepted) {
      this.error.set(
        missingFields.length > 0
          ? `Completa estos campos obligatorios: ${missingFields.join(', ')}.`
          : 'Debes aceptar la política de privacidad para continuar.',
      );
      return;
    }

    this.error.set(null);
    this.totpLoading.set(true);
    this.step.set(2);

    try {
      const result = await this.auth.enrollTotp("SimplificaCRM");
      this.totpFactorId = result.id;
      this.totpQr.set(result.totp.qr_code);
      this.totpSecret.set(result.totp.secret);
    } catch (e: any) {
      this.step.set(1);
      this.error.set(e.message || "Error al generar el código QR. Intenta de nuevo.");
    } finally {
      this.totpLoading.set(false);
    }
  }

  /** Step 2 submit: verify TOTP code + complete profile */
  async onSubmit() {
    if (this.totpCode.length < 6 || !this.totpFactorId) return;

    this.totpVerifying.set(true);
    this.error.set(null);

    try {
      await this.auth.challengeAndVerifyTotp(this.totpFactorId, this.totpCode);
    } catch (e: any) {
      this.error.set("Código incorrecto. Asegúrate de que la app muestra el código actual.");
      this.totpCode = "";
      this.totpVerifying.set(false);
      return;
    }

    this.loading.set(true);
    try {
      const success = await this.auth.completeProfile(this.buildSubmission());

      if (success) {
        // Mark onboarding as completed (TOTP verified + profile saved)
        try {
          const { data: { user } } = await this.supabase.db.auth.getUser();
          if (user) {
            await (this.supabase.db as any).rpc('complete_onboarding', { p_user_id: user.id });
            // Force profile refresh so guards see updated onboarding_completed flag
            await this.auth.refreshCurrentUser();
          }
        } catch (onboardingErr) {
          console.warn('⚠️ Could not mark onboarding complete:', onboardingErr);
        }
        this.router.navigate(["/accept-dpa"]);
      } else if (this.isInvitedUser()) {
        this.error.set("Tu perfil fue guardado. Revisa tu email para aceptar la invitación a la organización e inicia sesión de nuevo.");
      } else {
        this.error.set("No se pudo completar el perfil. Por favor intenta de nuevo.");
      }
    } catch (e: any) {
      this.error.set(e.message || "Error al guardar los datos.");
    } finally {
      this.loading.set(false);
      this.totpVerifying.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(["/login"]);
  }
}
