import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
  OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DoctoraliaBookingsImportService,
  RawDoctoraliaRow,
  ResolvedDoctoraliaRow,
  DoctoraliaField,
} from '../../../../services/doctoralia-bookings-import.service';
import { AuthService } from '../../../../services/auth.service';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../../../../shared/ui/csv-header-mapper/csv-header-mapper.component';
import { ToastService } from '../../../../services/toast.service';
import { DoctoraliaImportResolutionComponent } from './doctoralia-import-resolution.component';
import { DoctoraliaImportSummaryComponent } from './doctoralia-import-summary.component';
import { DoctoraliaImportSummary } from './doctoralia-import-summary.types';
import { firstValueFrom } from 'rxjs';

/** TTL of the MFA step-up flag, in ms. Mirrors clinical wizard. */
const MFA_STEPUP_TTL = 30 * 60 * 1000;

type WizardStep =
  | 'mfa-gate' | 'date-filter' | 'mapper' | 'dry-run'
  | 'resolution' | 'preview' | 'importing' | 'summary' | 'error';

interface ImportResultInternal {
  total: number;
  imported: number;
  deduped: number;
  notesImported: number;
  notesDropped: number;
  failed: { rowIndex: number; errorCode: string; errorMessage: string }[];
  elapsedMs: number;
}

@Component({
  selector: 'app-doctoralia-bookings-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslocoPipe,
    CsvHeaderMapperComponent,
    DoctoraliaImportResolutionComponent,
    DoctoraliaImportSummaryComponent,
  ],
  templateUrl: './doctoralia-bookings-wizard.component.html',
})
export class DoctoraliaBookingsWizardComponent implements OnInit {
  private importService = inject(DoctoraliaBookingsImportService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  @Output() closed = new EventEmitter<void>();

  // ── State ───────────────────────────────────────────────────────
  step = signal<WizardStep>('mfa-gate');
  errorMessage = signal<string | null>(null);

  /**
   * When the user is on the `preview` step and clicks "Resolver filas
   * problemáticas", the resolution component is mounted INLINE on top
   * of the preview (not as a separate step). This keeps the summary
   * numbers in view while the user fixes the bad rows. When they confirm
   * the resolution, the inline view is dismissed and the counts update.
   */
  showInlineResolution = signal(false);

  // CSV input (set by parent via @Input bindings)
  @Input() csvHeaders: string[] = [];
  @Input() csvRows: string[][] = [];

  // Date filter (REQ-2)
  dateFrom = signal<string>('');
  dateTo = signal<string>('');
  tz = signal<string>('Europe/Madrid');

  // Stable snapshot for the CsvHeaderMapper
  stableHeaders: string[] = [];
  stablePreviewRows: string[][] = [];

  // After parse + date filter
  filteredHeaders: string[] = [];
  filteredRows: RawDoctoraliaRow[] = [];
  filteredOutCount = signal<number>(0);

  // After mapper + resolve
  resolvedRows = signal<ResolvedDoctoraliaRow[]>([]);
  mapping: Record<string, DoctoraliaField> | null = null;

  // Import progress
  importingProgress = signal<{ processed: number; total: number }>({ processed: 0, total: 0 });
  importResult = signal<ImportResultInternal | null>(null);
  abortRequested = signal(false);

  // ── Lifecycle ───────────────────────────────────────────────────
  ngOnInit() {
    if (!this.csvHeaders?.length || !this.csvRows?.length) {
      this.errorMessage.set('No se proporcionaron datos del CSV.');
      this.step.set('error');
      return;
    }
    // Freeze references to avoid NG0956 in CsvHeaderMapper (same trick as clinical wizard)
    this.stableHeaders = [...this.csvHeaders];
    this.stablePreviewRows = this.csvRows.slice(0, 10).map((row) => [...row]);
    this.filteredHeaders = [...this.csvHeaders];
    this.checkMfa();
  }

  private checkMfa() {
    const mfaTs = typeof window !== 'undefined'
      ? parseInt(window.sessionStorage.getItem('mfa_stepup_doctoralia_import') ?? '0', 10)
      : 0;
    if (mfaTs && Date.now() - mfaTs < MFA_STEPUP_TTL) {
      this.step.set('date-filter');
    } else {
      this.step.set('mfa-gate');
    }
  }

  // ── Step transitions ───────────────────────────────────────────
  onMfaAcknowledge() {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mfa_stepup_doctoralia_import', Date.now().toString());
    }
    this.step.set('date-filter');
  }

  async onDateFilterContinue() {
    try {
      // Apply date filter client-side. We rebuild a fake File from the rows
      // so we can reuse `parseCsv` (or, simpler, filter the rows directly
      // here). For simplicity we use the service's parseCsv with a
      // reconstructed File, but since we already have the rows, we can
      // just apply the filter inline:
      const from = this.dateFrom() || undefined;
      const to = this.dateTo() || undefined;
      const tzValue = this.tz();
      const filtered: RawDoctoraliaRow[] = [];
      let filteredOut = 0;
      this.csvRows.forEach((cols, idx) => {
        const canonical: DoctoraliaField[] = [
          'patient_id', 'first_name', 'last_name', 'agenda', 'service',
          'start_time', 'end_time', 'created', 'lastmodified', 'comments',
          'appointment_status', 'recurrency_type', 'schedule_id', 'event_id',
        ];
        const fields: Partial<Record<DoctoraliaField, string>> = {};
        canonical.forEach((f, i) => { fields[f] = (cols[i] ?? '').trim(); });
        const st = fields.start_time;
        let inRange = true;
        if ((from || to) && st) {
          const startUtc = this.importService.applyTimezone(st, tzValue);
          const ts = new Date(startUtc).getTime();
          if (from) {
            const fromTs = new Date(from + 'T00:00:00Z').getTime();
            if (ts < fromTs) inRange = false;
          }
          if (to) {
            const toTs = new Date(to + 'T23:59:59Z').getTime();
            if (ts > toTs) inRange = false;
          }
        }
        if (inRange) {
          filtered.push({ rowIndex: idx + 1, fields });
        } else {
          filteredOut += 1;
        }
      });

      this.filteredRows = filtered;
      this.filteredHeaders = this.csvHeaders;
      this.filteredOutCount.set(filteredOut);
      this.step.set('mapper');
    } catch (e: any) {
      this.errorMessage.set(e?.message ?? String(e));
      this.step.set('error');
    }
  }

  onMappingConfirmed(result: CsvMappingResult) {
    // Build mapping (csv header → field)
    const mapping: Record<string, DoctoraliaField> = {};
    result.mappings.forEach((m) => {
      if (m.targetField) {
        mapping[m.csvHeader] = m.targetField as DoctoraliaField;
      }
    });
    this.mapping = mapping;

    // Rebuild filtered rows using the confirmed mapping
    const rebuilt: RawDoctoraliaRow[] = [];
    this.csvRows.forEach((cols, idx) => {
      const fields: Partial<Record<DoctoraliaField, string>> = {};
      this.csvHeaders.forEach((h, i) => {
        const f = mapping[h];
        if (f) fields[f] = (cols[i] ?? '').trim();
      });
      rebuilt.push({ rowIndex: idx + 1, fields });
    });

    // Apply date filter
    const from = this.dateFrom() || undefined;
    const to = this.dateTo() || undefined;
    const tzValue = this.tz();
    const filtered: RawDoctoraliaRow[] = [];
    let filteredOut = 0;
    rebuilt.forEach((r) => {
      let inRange = true;
      const st = r.fields.start_time;
      if ((from || to) && st) {
        const startUtc = this.importService.applyTimezone(st, tzValue);
        const ts = new Date(startUtc).getTime();
        if (from) {
          const fromTs = new Date(from + 'T00:00:00Z').getTime();
          if (ts < fromTs) inRange = false;
        }
        if (to) {
          const toTs = new Date(to + 'T23:59:59Z').getTime();
          if (ts > toTs) inRange = false;
        }
      }
      if (inRange) {
        filtered.push(r);
      } else {
        filteredOut += 1;
      }
    });

    this.filteredRows = filtered;
    this.filteredOutCount.set(filteredOut);

    // Dry-run resolve
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.errorMessage.set('No se pudo determinar la empresa activa.');
      this.step.set('error');
      return;
    }
    this.step.set('dry-run');
    this.resolveRowsAsync(filtered, companyId, tzValue);
  }

  private async resolveRowsAsync(
    filtered: RawDoctoraliaRow[],
    companyId: string,
    tzValue: string,
  ): Promise<void> {
    try {
      const resolved = await this.importService.resolveRows(filtered, companyId, tzValue);
      this.resolvedRows.set(resolved);
      // Both paths (with or without ambiguities) go to the preview step.
      // The user always gets a final confirmation before any insert runs.
      this.step.set('preview');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(`Error en el matching: ${message}`);
      this.step.set('error');
    }
  }

  onMappingCancelled() {
    this.closed.emit();
  }

  onResolutionConfirmed(resolved: ResolvedDoctoraliaRow[]) {
    this.resolvedRows.set(resolved);
    // After resolution, always go to the preview step so the user gets
    // a final "Confirmar e Importar" confirmation before any insert.
    this.step.set('preview');
  }

  onResolutionCancelled() {
    this.closed.emit();
  }

  /**
   * Final confirmation from the preview step. Triggers the actual import.
   */
  onPreviewConfirm() {
    this.showInlineResolution.set(false);
    this.step.set('importing');
    this.runImport();
  }

  /**
   * From the preview, open the resolution UI inline (overlay) so the
   * user can fix problematic rows without losing the preview context.
   */
  onPreviewResolveInline() {
    this.showInlineResolution.set(true);
  }

  /**
   * The inline resolution confirmed: update rows, dismiss the overlay.
   */
  onInlineResolutionConfirmed(resolved: ResolvedDoctoraliaRow[]) {
    this.resolvedRows.set(resolved);
    this.showInlineResolution.set(false);
  }

  /**
   * The inline resolution cancelled: dismiss the overlay without
   * changing anything.
   */
  onInlineResolutionCancelled() {
    this.showInlineResolution.set(false);
  }

  /**
   * Go back from the preview step to the resolution step (legacy
   * full-step navigation; kept as fallback). The preferred path is now
   * the inline overlay via `onPreviewResolveInline()`.
   */
  onPreviewBack() {
    // If there are no ambiguous/unresolved rows we can skip the resolution
    // step on the way back (it would be empty).
    const needsResolution = this.resolvedRows().some(
      (r) => r.status === 'ambiguous' || r.status === 'unresolved',
    );
    this.step.set(needsResolution ? 'resolution' : 'dry-run');
  }

  // ── Preview helpers (counts per section, sample rows) ────────────
  get previewTotal(): number {
    return this.resolvedRows().length;
  }

  get previewWillImport(): number {
    return this.resolvedRows().filter((r) => r.status === 'matched').length;
  }

  get previewWillSkip(): number {
    return this.resolvedRows().filter((r) => r.status === 'skipped').length;
  }

  get previewWillFail(): number {
    return this.resolvedRows().filter((r) =>
      r.status === 'ambiguous' || r.status === 'unresolved',
    ).length;
  }

  /** Count of rows that have non-empty comments (will become notes). */
  get previewWithComments(): number {
    return this.resolvedRows().filter(
      (r) => r.comments && r.comments.trim() !== '',
    ).length;
  }

  /** Per-section breakdown (client / professional / service). */
  sectionMatchCount(section: 'client' | 'professional' | 'service'): number {
    return this.resolvedRows().filter((r) => {
      if (r.status === 'skipped') return false;
      if (section === 'client') return Boolean(r.clientId);
      if (section === 'professional') return Boolean(r.professionalId);
      if (section === 'service') return Boolean(r.serviceId);
      return false;
    }).length;
  }

  sectionUnresolvedCount(section: 'client' | 'professional' | 'service'): number {
    return this.resolvedRows().filter((r) => {
      if (r.status === 'skipped') return false;
      if (section === 'client') return !r.clientId;
      if (section === 'professional') return !r.professionalId;
      if (section === 'service') return !r.serviceId;
      return false;
    }).length;
  }

  /** Sample of the first 8 rows for the preview table. */
  previewSample(): ResolvedDoctoraliaRow[] {
    return this.resolvedRows().slice(0, 8);
  }

  labelForRow(section: 'client' | 'professional' | 'service', r: ResolvedDoctoraliaRow): string {
    if (section === 'client') {
      if (r.clientId) {
        return r.clientCandidates[0]?.label ?? '(matched, label unknown)';
      }
      return r.firstName && r.lastName ? `${r.firstName} ${r.lastName} (huérfano)` : '(sin nombre)';
    }
    if (section === 'professional') {
      if (r.professionalId) {
        return r.professionalCandidates[0]?.label ?? '(matched)';
      }
      return r.agenda ? `${r.agenda} (huérfano)` : '(sin agenda)';
    }
    if (section === 'service') {
      if (r.serviceId) {
        return r.serviceCandidates[0]?.label ?? '(matched)';
      }
      return r.serviceName ? `${r.serviceName} (huérfano)` : '(sin servicio)';
    }
    return '';
  }

  // ── Import execution (REQ-20: chunked + abort) ──────────────────
  private async runImport() {
    const companyId = this.auth.companyId();
    const userId = this.auth.userProfile?.id;
    if (!companyId || !userId) {
      this.errorMessage.set('No se pudo determinar la empresa o el usuario activo.');
      this.step.set('error');
      return;
    }

    const toImport = this.resolvedRows().filter(
      (r) => r.status === 'matched' || r.status === 'skipped',
    );

    this.importingProgress.set({ processed: 0, total: toImport.length });
    this.abortRequested.set(false);

    const start = performance.now();
    const chunkSize = 20;
    let processed = 0;
    let imported = 0;
    let deduped = 0;
    let notesImported = 0;
    let notesDropped = 0;
    const failed: ImportResultInternal['failed'] = [];

    for (let i = 0; i < toImport.length; i += chunkSize) {
      if (this.abortRequested()) {
        // Mark the remaining rows as aborted failures
        for (let j = i; j < toImport.length; j++) {
          failed.push({
            rowIndex: toImport[j].rowIndex,
            errorCode: 'aborted',
            errorMessage: 'Importación abortada por el usuario',
          });
        }
        break;
      }
      const chunk = toImport.slice(i, i + chunkSize);
      try {
        const result = await firstValueFrom(
          this.importService.importChunk(chunk, { companyId, userId }),
        );
        imported += result.results.filter((r) => r.ok && !r.deduped).length;
        deduped += result.results.filter((r) => r.deduped).length;
        notesImported += result.notesImported;
        notesDropped += result.notesDropped;
        // Any error from the chunk is reported as a failure
        result.results
          .filter((r) => !r.ok)
          .forEach((r) => {
            failed.push({
              rowIndex: r.rowIndex,
              errorCode: r.errorCode ?? 'unknown',
              errorMessage: r.errorMessage ?? '',
            });
          });
      } catch (e: any) {
        for (const r of chunk) {
          failed.push({
            rowIndex: r.rowIndex,
            errorCode: 'edge_function_error',
            errorMessage: e?.message ?? String(e),
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
      notesImported,
      notesDropped,
      failed,
      elapsedMs: performance.now() - start,
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
    const csv = this.importService.buildFailureReport(
      result.failed.map((f) => ({
        rowIndex: f.rowIndex,
        ok: false,
        deduped: false,
        errorCode: f.errorCode,
        errorMessage: f.errorMessage,
      })),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doctoralia-import-failures-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // ── Field configuration (REQ-3) ─────────────────────────────────
  readonly fieldOptions: { value: DoctoraliaField; label: string; required: boolean }[] = [
    { value: 'event_id', label: 'Event ID (Doctoralia)', required: true },
    { value: 'patient_id', label: 'Patient ID (Doctoralia)', required: true },
    { value: 'first_name', label: 'Nombre', required: true },
    { value: 'last_name', label: 'Apellidos', required: true },
    { value: 'agenda', label: 'Profesional (agenda)', required: true },
    { value: 'service', label: 'Servicio', required: true },
    { value: 'start_time', label: 'Inicio', required: true },
    { value: 'end_time', label: 'Fin', required: true },
    { value: 'appointment_status', label: 'Estado cita (Doctoralia)', required: true },
    { value: 'comments', label: 'Comentarios', required: false },
    { value: 'recurrency_type', label: 'Recurrencia', required: false },
    { value: 'schedule_id', label: 'Schedule ID', required: false },
    { value: 'created', label: 'Created', required: false },
    { value: 'lastmodified', label: 'Last modified', required: false },
  ];

  get aliasMap(): Record<string, string[]> {
    return {
      event_id: ['eventid', 'event id', 'id', 'id_evento', 'id evento'],
      patient_id: ['patientid', 'patient id', 'id paciente', 'id_paciente', 'idpaciente'],
      first_name: ['firstname', 'first name', 'nombre', 'name'],
      last_name: ['lastname', 'last name', 'apellido', 'apellidos', 'surname'],
      agenda: ['agenda', 'profesional', 'doctor', 'professional', 'staff'],
      service: ['service', 'servicio'],
      start_time: ['start time', 'starttime', 'start_time', 'inicio', 'start', 'datetime start'],
      end_time: ['end time', 'endtime', 'end_time', 'fin', 'end'],
      appointment_status: ['appointment status', 'appointmentstatus', 'status', 'estado', 'estado cita'],
      comments: ['comments', 'comentarios', 'notes', 'notas'],
      recurrency_type: ['recurrency type', 'recurrencytype', 'recurrencia'],
      schedule_id: ['schedule id', 'scheduleid', 'id agenda', 'idagenda'],
      created: ['created', 'creado', 'fecha creacion'],
      lastmodified: ['lastmodified', 'last modified', 'modificado', 'ultima modificacion'],
    };
  }
}
