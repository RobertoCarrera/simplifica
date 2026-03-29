import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  GdprComplianceService,
  GdprConsentRecord,
} from '../../../../services/gdpr-compliance.service';
import { ToastService } from '../../../../services/toast.service';
import { AuthService } from '../../../../services/auth.service';

/**
 * ConsentGateComponent — Task 1.5 (pentest-audit-clients-table-remediation)
 *
 * Hard-blocks saving health or minor client data until explicit consent
 * is recorded (GDPR Art. 9 — special category data).
 *
 * Usage:
 *   <app-consent-gate
 *     [clientEmail]="formData.email"
 *     [clientId]="existingClientId"
 *     consentType="health_data"
 *     (consentGranted)="onConsentGranted($event)"
 *     (consentDenied)="onConsentDenied()"
 *   />
 *
 * Design contract (from design.md):
 *   - Consent gate is a hard block (prevents save) per Art. 9 GDPR.
 *   - Backend is the authoritative gate; this component collects explicit consent
 *     and persists it via GdprComplianceService before allowing the save.
 */
@Component({
  selector: 'app-consent-gate',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  template: `
    <div
      class="consent-gate rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600 p-6 space-y-4"
      role="dialog"
      aria-modal="false"
      [attr.aria-label]="ariaLabel()"
    >
      <!-- Icon + Header -->
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 mt-0.5">
          <i class="fas fa-shield-alt text-amber-600 dark:text-amber-400 text-2xl"></i>
        </div>
        <div class="flex-1">
          <h3 class="font-bold text-amber-800 dark:text-amber-200 text-base leading-tight">
            {{ title() }}
          </h3>
          <p class="text-sm text-amber-700 dark:text-amber-300 mt-1">
            {{ description() }}
          </p>
        </div>
      </div>

      <!-- Legal basis info -->
      <div
        class="bg-white dark:bg-slate-800 rounded-lg p-4 text-xs text-gray-600 dark:text-gray-300 space-y-1 border border-amber-200 dark:border-amber-700"
      >
        <p class="font-semibold text-gray-800 dark:text-gray-200">{{ 'clients.gdpr.informacionLegal' | transloco }}</p>
        <p>
          <strong>{{ 'clients.gdpr.baseLegal' | transloco }}:</strong>
          {{ legalBasis() }}
        </p>
        <p>
          <strong>{{ 'clients.gdpr.finalidad' | transloco }}:</strong>
          {{ purposeText() }}
        </p>
        <p class="text-gray-400 dark:text-gray-500">
          {{ 'clients.gdpr.retirarConsentimientoDesc' | transloco }}
        </p>
      </div>

      <!-- Already granted state -->
      @if (consentAlreadyGranted()) {
        <div
          class="flex items-center gap-2 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-4 py-3 border border-green-200 dark:border-green-700"
        >
          <i class="fas fa-check-circle"></i>
          <span class="text-sm font-medium">{{ 'clients.gdpr.gate.yaOtorgado' | transloco }}</span>
        </div>
      }

      <!-- Error state -->
      @if (errorMessage()) {
        <div
          class="flex items-start gap-2 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3 border border-red-200 dark:border-red-700"
        >
          <i class="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i>
          <div class="flex-1 min-w-0">
            <span class="text-sm">{{ errorMessage() }}</span>
            <button
              type="button"
              class="mt-2 flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 underline hover:no-underline"
              (click)="retryConsent()"
            >
              <i class="fas fa-redo-alt text-[10px]"></i> {{ 'shared.reintentar' | transloco }}
            </button>
          </div>
        </div>
      }

      <!-- Actions -->
      @if (!consentAlreadyGranted()) {
        <div class="flex flex-col sm:flex-row gap-3 pt-2">
          <!-- Grant consent (primary) -->
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            [disabled]="loading()"
            (click)="grantConsent()"
          >
            @if (loading()) {
              <i class="fas fa-spinner fa-spin"></i>
            } @else {
              <i class="fas fa-check"></i>
            }
            {{ loading() ? ('clients.gdpr.gate.registrando' | transloco) : ('clients.gdpr.gate.otorgar' | transloco) }}
          </button>

          <!-- Deny / cancel -->
          <button
            type="button"
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 font-medium text-sm transition-colors disabled:opacity-50"
            [disabled]="loading()"
            (click)="denyConsent()"
          >
            <i class="fas fa-times"></i>
            {{ 'clients.gdpr.sinDatosSalud' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ConsentGateComponent implements OnInit {
  /** Client email — used as subject_email in consent record */
  @Input({ required: true }) clientEmail!: string;

  /** Optional: existing client ID (for linking consent record) */
  @Input() clientId?: string;

  /**
   * Type of consent required.
   * - 'health_data': GDPR Art. 9 — special category health data
   * - 'minor_data':  Parental consent for subjects under 18
   *                  (stored as 'data_processing' with purpose indicating minor)
   */
  @Input() consentType: 'health_data' | 'minor_data' = 'health_data';

  /** Emits the created/existing consent record when consent is granted */
  @Output() consentGranted = new EventEmitter<GdprConsentRecord>();

  /** Emits when user explicitly denies or dismisses the consent gate */
  @Output() consentDenied = new EventEmitter<void>();

  /**
   * Emits `true` when async consent recording starts, `false` when it finishes
   * (success or error). Allows the host component to track sync state.
   */
  @Output() syncLoading = new EventEmitter<boolean>();

  // ── Injected services ──────────────────────────────────────────────────────
  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  // ── State signals ──────────────────────────────────────────────────────────
  protected loading = signal(false);
  protected consentAlreadyGranted = signal(false);
  protected errorMessage = signal<string | null>(null);

  // ── Computed labels ────────────────────────────────────────────────────────
  protected title = computed(() =>
    this.consentType === 'health_data'
      ? 'Consentimiento para datos de salud requerido'
      : 'Consentimiento parental requerido (menor de edad)',
  );

  protected description = computed(() =>
    this.consentType === 'health_data'
      ? 'Este cliente será marcado como paciente / cliente con datos sanitarios. ' +
        'Según el Art. 9 del RGPD, es obligatorio registrar su consentimiento explícito antes de almacenar datos de salud.'
      : 'El cliente es menor de edad. Se requiere consentimiento parental explícito ' +
        'conforme al Art. 8 del RGPD y la LOPDGDD antes de proceder.',
  );

  protected legalBasis = computed(() =>
    this.consentType === 'health_data'
      ? 'Art. 9.2(a) RGPD — consentimiento explícito para categorías especiales'
      : 'Art. 8 RGPD — consentimiento del titular de la patria potestad',
  );

  protected purposeText = computed(() =>
    this.consentType === 'health_data'
      ? 'Prestación de servicios asistenciales, gestión de historia clínica y seguimiento terapéutico.'
      : 'Prestación de servicios a menores de edad con supervisión del representante legal.',
  );

  protected ariaLabel = computed(
    () =>
      `Formulario de consentimiento obligatorio para ${this.consentType === 'health_data' ? 'datos de salud' : 'menores de edad'}`,
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async ngOnInit(): Promise<void> {
    if (this.clientEmail) {
      await this.checkExistingConsent();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Check if an active consent record already exists for this client.
   * If yes, emit consentGranted immediately so the parent form can proceed.
   */
  async checkExistingConsent(): Promise<void> {
    try {
      const consents = await firstValueFrom(this.gdprService.getConsentRecords(this.clientEmail));

      // Map consentType to the GdprConsentRecord type values
      const targetConsentType: GdprConsentRecord['consent_type'] =
        this.consentType === 'health_data' ? 'health_data' : 'data_processing';

      const records = consents as GdprConsentRecord[];
      const activeConsent = records?.find(
        (c: GdprConsentRecord) =>
          c.consent_type === targetConsentType &&
          c.consent_given &&
          !c.withdrawn_at &&
          (this.consentType === 'health_data' || (c.purpose ?? '').toLowerCase().includes('menor')),
      );

      if (activeConsent) {
        this.consentAlreadyGranted.set(true);
        this.consentGranted.emit(activeConsent);
      }
    } catch (e) {
      // Silently ignore — user will see the grant UI
      console.warn('[ConsentGateComponent] checkExistingConsent error:', e);
    }
  }

  /**
   * Records explicit consent for the client and emits consentGranted.
   * This is the primary action — clicking this allows the parent save to proceed.
   */
  async grantConsent(): Promise<void> {
    if (!this.clientEmail) {
      this.errorMessage.set('El email del cliente es requerido para registrar el consentimiento.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.syncLoading.emit(true);

    try {
      const companyId = this.resolveCompanyId();
      if (!companyId) {
        this.errorMessage.set(
          'No se pudo determinar la empresa. Recarga la página e intenta de nuevo.',
        );
        return;
      }

      // Map our semantic consentType to the GdprConsentRecord type
      const consentTypeForRecord: GdprConsentRecord['consent_type'] =
        this.consentType === 'health_data' ? 'health_data' : 'data_processing';

      const record: GdprConsentRecord = {
        subject_email: this.clientEmail,
        subject_id: this.clientId,
        consent_type: consentTypeForRecord,
        purpose: this.purposeText(),
        consent_given: true,
        consent_method: 'form',
        legal_basis: this.legalBasis(),
        data_processing_purposes: [this.consentType],
      };

      const saved = await firstValueFrom(this.gdprService.recordConsent(record, { companyId }));

      this.consentAlreadyGranted.set(true);
      this.toastService.success(
        'Consentimiento registrado',
        `Consentimiento para ${this.consentType === 'health_data' ? 'datos de salud' : 'menores'} registrado correctamente.`,
      );
      this.consentGranted.emit(saved || record);
    } catch (e: unknown) {
      console.error('[ConsentGateComponent] grantConsent error:', e);
      const msg = e instanceof Error ? e.message : String(e);
      this.errorMessage.set(
        msg ?? 'Error al registrar el consentimiento. Por favor intenta de nuevo.',
      );
    } finally {
      this.loading.set(false);
      this.syncLoading.emit(false);
    }
  }

  /**
   * Retries the consent recording after a failure.
   * Clears the error state and calls grantConsent() again.
   */
  retryConsent(): void {
    this.errorMessage.set(null);
    this.grantConsent();
  }

  /**
   * User explicitly declines or dismisses the consent gate.
   * Parent form should clear the health data flag and NOT save health data.
   */
  denyConsent(): void {
    this.consentDenied.emit();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Synchronously resolves the company ID from the auth service signal.
   * Uses the signal (not Observable) so no async is needed.
   */
  private resolveCompanyId(): string | null {
    const id = this.authService.companyId();
    return id || null;
  }
}
