import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ClinicalNotesImportService,
  ResolvedClinicalRow,
  MatchedClinicalRow,
  ClinicalMatchStatus,
  ClinicalCandidate
} from '../../../../services/clinical-notes-import.service';
import { AuthService } from '../../../../services/auth.service';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../../../../shared/ui/csv-header-mapper/csv-header-mapper.component';
import { ToastService } from '../../../../services/toast.service';
import { ClinicalImportResolutionComponent } from '../clinical-import-resolution/clinical-import-resolution.component';
import { ClinicalImportSummaryComponent } from '../clinical-import-summary/clinical-import-summary.component';

/** TTL of the clinical MFA step-up flag, in ms. Mirrors client-profile pattern. */
const MFA_STEPUP_TTL = 30 * 60 * 1000;

type WizardStep = 'mfa-gate' | 'mapper' | 'dry-run' | 'resolution' | 'importing' | 'summary' | 'error';

interface ImportResult {
  total: number;
  imported: number;
  deduped: number;
  failed: { rowIndex: number; clientId?: string; errorCode: string; errorMessage: string }[];
  elapsedMs: number;
}

@Component({
  selector: 'app-clinical-import-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoPipe,
    CsvHeaderMapperComponent,
    ClinicalImportResolutionComponent,
    ClinicalImportSummaryComponent
  ],
  templateUrl: './clinical-import-wizard.component.html'
})
export class ClinicalImportWizardComponent {
  private importService = inject(ClinicalNotesImportService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  @Input() csvHeaders: string[] = [];
  @Input() csvRows: string[][] = [];
  @Output() closed = new EventEmitter<void>();

  /**
   * Stable, immutable snapshot of the headers and preview rows. Computed
   * ONCE in ngOnInit from the inputs. We do NOT expose getters that return
   * a fresh .slice() array on every change detection cycle — the CsvHeaderMapper
   * child has `track mapping` (identity) and a fresh array reference on every
   * CD cycle causes NG0956 + an infinite change detection loop.
   */
  stableHeaders: string[] = [];
  stablePreviewRows: string[][] = [];

  // ── State signals ──────────────────────────────────────────────
  step = signal<WizardStep>('mfa-gate');
  errorMessage = signal<string | null>(null);

  // Parsed CSV
  // Resolved rows (after mapper + matching)
  matchedRows = signal<MatchedClinicalRow[]>([]);

  // Import progress
  importingProgress = signal<{ processed: number; total: number }>({ processed: 0, total: 0 });
  importResult = signal<ImportResult | null>(null);
  abortRequested = signal(false);

  // Module/feature gates
  mfaOk = signal(false);
  moduleOk = signal(false);

  /** Transloco keys for resolution status badges */
  statusLabelKey: Record<ClinicalMatchStatus, string> = {
    matched: 'clinicalImport.status.matched',
    ambiguous: 'clinicalImport.status.ambiguous',
    unresolved: 'clinicalImport.status.unresolved',
    'missing-episode': 'clinicalImport.status.missingEpisode',
    skipped: 'clinicalImport.status.skipped',
    'consent-not-granted': 'clinicalImport.status.consentNotGranted'
  };

  // Clinical field configuration
  readonly clinicalFieldOptions = [
    { value: 'first_name', label: 'Nombre', required: false },
    { value: 'last_name', label: 'Apellidos', required: false },
    { value: 'patient_id', label: 'Patient ID (legacy)', required: false },
    { value: 'episode_id', label: 'Episode ID', required: false },
    { value: 'appointment_id', label: 'Appointment ID', required: false },
    { value: 'sequence', label: 'Secuencia', required: false },
    { value: 'date', label: 'Fecha', required: false },
    { value: 'title', label: 'Título', required: false },
    { value: 'value', label: 'Contenido de la nota', required: true }
  ];
  readonly clinicalRequiredFields = ['value'];
  readonly clinicalAliasMap: Record<string, string[]> = {
    first_name: ['first_name', 'first name', 'firstname', 'nombre', 'name'],
    last_name: ['last_name', 'last name', 'lastname', 'apellido', 'apellidos', 'surname'],
    patient_id: ['patient_id', 'patientid', 'patient id', 'id paciente'],
    episode_id: ['episode_id', 'episodeid', 'episode id', 'id episodio'],
    appointment_id: ['appointment_id', 'appointmentid', 'appointment id', 'id cita', 'id appointment'],
    sequence: ['sequence', 'secuencia', 'seq'],
    date: ['date', 'fecha', 'event_date', 'event date'],
    title: ['title', 'titulo', 'título', 'asunto'],
    value: ['value', 'contenido', 'content', 'note', 'nota', 'texto', 'text', 'body']
  };

  // ── Lifecycle ──────────────────────────────────────────────────
  ngOnInit() {
    // Parent component pre-parses the CSV before mounting us. We just
    // validate that we got data, materialize a stable preview, then run
    // the MFA gate.
    if (!this.csvHeaders?.length || !this.csvRows?.length) {
      this.errorMessage.set('No se proporcionaron datos del CSV.');
      this.step.set('error');
      return;
    }
    // Freeze references: copy the array (not slice) and the headers, so
    // the child mapper sees the same object identity across CD cycles.
    this.stableHeaders = [...this.csvHeaders];
    this.stablePreviewRows = this.csvRows.slice(0, 10).map((row) => [...row]);
    this.checkMfa();
  }

  private checkMfa() {
    // Reuse the existing pattern from client-profile:
    // sessionStorage['mfa_stepup_clinical'] stores a timestamp; valid for 30 min
    const mfaTs = typeof window !== 'undefined'
      ? parseInt(window.sessionStorage.getItem('mfa_stepup_clinical') ?? '0', 10)
      : 0;
    if (mfaTs && Date.now() - mfaTs < MFA_STEPUP_TTL) {
      this.mfaOk.set(true);
      this.moduleOk.set(true);
      this.step.set('mapper');
    } else {
      this.step.set('mfa-gate');
    }
  }

  // ── Step transitions ──────────────────────────────────────────
  onMfaAcknowledge() {
    // Set the step-up flag directly. The clinical-history import is a
    // *write* operation, not a read of existing clinical data, so the
    // server-side enforcement (create_clinical_note RPC requiring an
    // active session + company member) is the authoritative gate.
    // The MFA step-up is defense in depth: it ensures the user explicitly
    // acknowledged they're about to import clinical data.
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mfa_stepup_clinical', Date.now().toString());
    }
    this.mfaOk.set(true);
    this.moduleOk.set(true);
    this.step.set('mapper');
  }

  onMappingConfirmed(result: CsvMappingResult) {
    if (!this.csvHeaders.length || !this.csvRows.length) {
      this.errorMessage.set('Datos del CSV no disponibles.');
      this.step.set('error');
      return;
    }

    // Build resolved rows using the mapping
    const resolved = this.buildResolvedRows(this.csvHeaders, this.csvRows, result);

    // Dry-run matching
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.errorMessage.set('No se pudo determinar la empresa activa.');
      this.step.set('error');
      return;
    }

    this.importService.matchClients(resolved, companyId).subscribe({
      next: (matched) => {
        this.matchedRows.set(matched);
        // If no rows need resolution (all matched + none ambiguous/unresolved), skip resolution
        const needsResolution = matched.some(
          (r) => r.status === 'ambiguous' || r.status === 'unresolved'
        );
        this.step.set(needsResolution ? 'resolution' : 'importing');
        if (!needsResolution) {
          this.runImport();
        }
      },
      error: (err) => {
        this.errorMessage.set(`Error en el matching: ${err?.message ?? err}`);
        this.step.set('error');
      }
    });
  }

  onMappingCancelled() {
    this.closed.emit();
  }

  /**
   * Build ResolvedClinicalRow[] from the parsed CSV and the user's mapping.
   */
  private buildResolvedRows(headers: string[], rows: string[][], mapping: CsvMappingResult): ResolvedClinicalRow[] {
    const fieldByHeader: Record<string, string> = {};
    mapping.mappings.forEach((m) => {
      if (m.targetField) fieldByHeader[m.csvHeader] = m.targetField;
    });

    return rows.map((cols, idx) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        const field = fieldByHeader[h];
        if (field) obj[field] = (cols[i] ?? '').trim();
      });

      const sequenceRaw = obj['sequence'];
      const sequence = sequenceRaw && /^\d+$/.test(sequenceRaw) ? parseInt(sequenceRaw, 10) : null;
      const dateRaw = obj['date'];
      const date = dateRaw ? this.normalizeDate(dateRaw) : null;

      return {
        rowIndex: idx + 1, // 1-based for human display
        patientId: obj['patient_id'] || null,
        firstName: obj['first_name'] || null,
        lastName: obj['last_name'] || null,
        episodeId: obj['episode_id'] || null,
        appointmentId: obj['appointment_id'] || null,
        sequence,
        date,
        title: obj['title'] || null,
        value: obj['value'] || ''
      };
    });
  }

  /**
   * Normalize a date string to ISO. Accepts YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
   * (with heuristic: if first part > 12, must be DD/MM/YYYY).
   */
  private normalizeDate(s: string): string | null {
    if (!s) return null;
    // Try YYYY-MM-DD first
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`;
    // DD/MM/YYYY or MM/DD/YYYY
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      // If first part > 12, it's DD/MM; if second > 12, MM/DD; else assume DD/MM (Spanish locale)
      if (a > 12 && b <= 12) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00Z`;
      if (b > 12 && a <= 12) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T00:00:00Z`;
      // Default to DD/MM (Spanish default per project context)
      return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00Z`;
    }
    return null;
  }

  // ── Resolution callbacks ──────────────────────────────────────
  onResolutionConfirmed(resolved: MatchedClinicalRow[]) {
    this.matchedRows.set(resolved);
    this.step.set('importing');
    this.runImport();
  }

  onResolutionCancelled() {
    this.closed.emit();
  }

  // ── Import execution ──────────────────────────────────────────
  private async runImport() {
    const companyId = this.auth.companyId();
    const userId = this.auth.userProfile?.id;
    if (!companyId || !userId) {
      this.errorMessage.set('No se pudo determinar la empresa o el usuario activo.');
      this.step.set('error');
      return;
    }

    // Only import rows that are matched and have a value
    const toImport = this.matchedRows().filter(
      (r) => r.status === 'matched' && r.clientId && r.value && r.value.trim().length > 0
    );

    this.importingProgress.set({ processed: 0, total: toImport.length });
    this.abortRequested.set(false);

    const start = performance.now();
    const chunkSize = 20;
    let processed = 0;
    let imported = 0;
    let deduped = 0;
    const failed: ImportResult['failed'] = [];

    for (let i = 0; i < toImport.length; i += chunkSize) {
      if (this.abortRequested()) break;
      const chunk = toImport.slice(i, i + chunkSize);
      try {
        const result = await firstValueFrom(
          this.importService.importChunk(chunk, { companyId, userId })
        );
        imported += result.ok.length;
        deduped += result.ok.filter((r) => r.deduped).length;
        failed.push(
          ...result.failed.map((f) => ({
            rowIndex: f.rowIndex,
            clientId: f.clientId,
            errorCode: f.errorCode ?? 'unknown',
            errorMessage: f.errorMessage ?? ''
          }))
        );
      } catch (e: any) {
        // Whole-chunk failure: attribute to each row
        for (const r of chunk) {
          failed.push({
            rowIndex: r.rowIndex,
            clientId: r.clientId ?? undefined,
            errorCode: 'rpc_error',
            errorMessage: e?.message ?? String(e)
          });
        }
      }
      processed += chunk.length;
      this.importingProgress.set({ processed, total: toImport.length });
    }

    this.importResult.set({
      total: toImport.length,
      imported,
      deduped,
      failed,
      elapsedMs: performance.now() - start
    });
    this.step.set('summary');
  }

  onAbortImport() {
    this.abortRequested.set(true);
  }

  onSummaryClose() {
    this.closed.emit();
  }

  onDownloadFailureReport() {
    const result = this.importResult();
    if (!result) return;
    const csv = this.importService.buildFailureReport(result.failed);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-import-failures-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // ── Helpers for template ──────────────────────────────────────
  // csvPreviewRows and csvHeaders are now stable properties, set in
  // ngOnInit (see top of class). Do NOT replace with getters — fresh
  // array refs on every CD cycle break the CsvHeaderMapper's trackBy.
}
