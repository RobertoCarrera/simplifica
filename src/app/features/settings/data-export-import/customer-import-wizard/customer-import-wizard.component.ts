import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { lastValueFrom } from 'rxjs';

import { AuthService } from '../../../../services/auth.service';
import { SupabaseCustomersService } from '../../../../services/supabase-customers.service';
import { ToastService } from '../../../../services/toast.service';
import {
  CustomerCsvRow,
  ClassifiedCustomerRow,
  CustomerImportProgress,
  CustomerLite,
  RowClassificationStatus,
} from '../../../../services/customer-import.types';

import { CustomerImportDryRunComponent } from './customer-import-dry-run.component';
import { CustomerImportResolutionComponent } from './customer-import-resolution.component';
import { CustomerImportSummaryComponent } from './customer-import-summary.component';

export type CustomerImportWizardStep =
  | 'mapper'
  | 'dry-run'
  | 'resolution'
  | 'preview'
  | 'importing'
  | 'summary'
  | 'error';

/**
 * Alias map for the CSV header → CustomerCsvRow field. Mirrors the table in
 * `data-export-import.component.ts` (which lives in the parent shell, but
 * we can't reach into the parent). Keys are aliases, values are the
 * CustomerCsvRow field name. Matching is case-insensitive + accent-stripped.
 *
 * Also includes `bill_to:` and `ship_to:` prefixed aliases (Stripe, etc.).
 */
const HEADER_ALIASES: Record<string, string> = {
  // name
  name: 'firstName', nombre: 'firstName', firstname: 'firstName', 'first name': 'firstName', 'first_name': 'firstName',
  'bill_to:first_name': 'firstName', 'ship_to:first_name': 'firstName',
  // surname
  surname: 'surname', lastname: 'surname', 'last name': 'surname', 'last_name': 'surname', apellidos: 'surname',
  'bill_to:last_name': 'surname', 'ship_to:last_name': 'surname',
  // email
  email: 'email', correo: 'email', 'e-mail': 'email', mail: 'email',
  'bill_to:email': 'email', 'ship_to:email': 'email',
  // phone
  phone: 'phone', telefono: 'phone', teléfono: 'phone', tel: 'phone', mobile: 'phone', movil: 'phone', 'móvil': 'phone',
  'bill_to:phone': 'phone', 'ship_to:phone': 'phone',
  // cif — Stripe puts the legal CIF/tax id in `bill_to:legal` or `ship_to:legal`.
  // We treat `legal` as a strong alias for the CIF column because that's how
  // Stripe's billing exports expose it.
  cif: 'cif', cif_nif: 'cif', 'cif/nif': 'cif', tax_id: 'cif', vat: 'cif', legal: 'cif',
  'bill_to:legal': 'cif', 'ship_to:legal': 'cif',
  // dni
  dni: 'dni', nif: 'dni', documento: 'dni',
  // Structured address components (city, state, postal code, country).
  // Stripe exposes these as bill_to:city / bill_to:state / bill_to:postal_code /
  // bill_to:country (and ship_to:* equivalents). The fallback suffix-match in
  // buildAliasIndex handles the ship_to variants automatically.
  city: 'addressCity', localidad: 'addressCity', 'bill_to:city': 'addressCity',
  state: 'addressState', provincia: 'addressState', 'bill_to:state': 'addressState',
  postal_code: 'addressPostalCode', cp: 'addressPostalCode', postcode: 'addressPostalCode',
  zip: 'addressPostalCode', 'bill_to:postal_code': 'addressPostalCode', 'bill_to:zip': 'addressPostalCode',
  country: 'addressCountry', pais: 'addressCountry', 'bill_to:country': 'addressCountry',
  // clientType
  client_type: 'clientType', tipo_cliente: 'clientType', type: 'clientType', 'tipo cliente': 'clientType',
  // businessName (Stripe uses `bill_to:company` or `ship_to:company`)
  business_name: 'businessName', razon_social: 'businessName', company_name: 'businessName', empresa: 'businessName',
  'razón social': 'businessName', 'razon social': 'businessName',
  'bill_to:company': 'businessName', 'ship_to:company': 'businessName', company: 'businessName',
  // tradeName
  trade_name: 'tradeName', nombre_comercial: 'tradeName',
  // legalRepresentativeName
  legal_representative_name: 'legalRepresentativeName',
  // legalRepresentativeDni
  legal_representative_dni: 'legalRepresentativeDni',
  // address
  address: 'address', direccion: 'address', dirección: 'address', domicilio: 'address',
  street: 'address', calle: 'address',
  'bill_to:address': 'address', 'ship_to:address': 'address',
  'bill_to:address1': 'address', 'bill_to:address2': 'address', 'ship_to:address1': 'address',
};

/**
 * Light helper used both by the shell (initial parse) and the dry-run
 * component (inline edit → re-map back to the same shape).
 */
function buildAliasIndex(headers: string[]): Map<number, string> {
  const norm = (s: string): string =>
    (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const out = new Map<number, string>();
  headers.forEach((h, idx) => {
    const key = norm(h);
    // Pass 1: exact match (handles "bill_to:first_name" etc. when listed).
    if (HEADER_ALIASES[key]) {
      out.set(idx, HEADER_ALIASES[key]);
      return;
    }
    // Pass 2: fallback — if the header has a prefix like "bill_to:" or
    // "ship_to:" or a path-like "user.name", try the SUFFIX (the part
    // after the last "." or ":"). This is intentionally lenient because
    // real-world CSVs (Stripe, Holded, exported from old CRMs) frequently
    // add a prefix that breaks naive exact-match.
    const lastDot = key.lastIndexOf('.');
    const lastColon = key.lastIndexOf(':');
    const cutAt = Math.max(lastDot, lastColon);
    if (cutAt >= 0 && cutAt < key.length - 1) {
      const suffix = key.slice(cutAt + 1);
      if (HEADER_ALIASES[suffix]) {
        out.set(idx, HEADER_ALIASES[suffix]);
      }
    }
  });
  return out;
}

function emptyString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

@Component({
  selector: 'app-customer-import-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslocoPipe,
    CustomerImportDryRunComponent,
    CustomerImportResolutionComponent,
    CustomerImportSummaryComponent,
  ],
  templateUrl: './customer-import-wizard.component.html',
})
export class CustomerImportWizardComponent implements OnInit {
  private auth = inject(AuthService);
  private customers = inject(SupabaseCustomersService);
  private toast = inject(ToastService);

  @Input() csvHeaders: string[] = [];
  @Input() csvRows: string[][] = [];

  @Output() closed = new EventEmitter<void>();

  /** Current wizard step. */
  step = signal<CustomerImportWizardStep>('dry-run');
  /** Error message shown when step === 'error'. */
  errorMessage = signal<string | null>(null);
  /** Loaded once on init. */
  existingClients = signal<CustomerLite[]>([]);
  /** Classified rows flowing through the wizard. */
  classifiedRows = signal<ClassifiedCustomerRow[]>([]);
  /** Stable list of CSV rows used by the sub-components. */
  csvRowModels = signal<CustomerCsvRow[]>([]);
  /** Loaded once on init. */
  loading = signal<boolean>(true);
  /** Import result (final counts) shown in the summary. */
  importResult = signal<CustomerImportProgress | null>(null);
  /** Failures surfaced to the summary for CSV download. */
  importFailures = signal<{ rowIndex: number; errorCode: string; errorMessage: string }[]>([]);

  /** ⚠️ rows that need resolution. Pre-filtered from classifiedRows(). */
  resolutionRows = computed<ClassifiedCustomerRow[]>(() =>
    this.classifiedRows().filter((r) => r.status === 'likely_duplicate'),
  );

  /** Counts in the preview. */
  previewWillImport = computed<number>(() => {
    const rows = this.classifiedRows();
    return rows.filter(
      (r) =>
        (r.status === 'valid' || r.status === 'alreadyExists' || r.status === 'likely_duplicate') &&
        r.resolution?.choice !== 'skip' &&
        r.resolution?.choice !== 'link',
    ).length;
  });

  previewAlreadyExists = computed<number>(() => {
    const rows = this.classifiedRows();
    return rows.filter(
      (r) => r.status === 'alreadyExists' && (!r.resolution || r.resolution.choice !== 'create'),
    ).length;
  });

  previewSkipped = computed<number>(() =>
    this.classifiedRows().filter((r) => r.resolution?.choice === 'skip').length,
  );

  previewInvalid = computed<number>(() =>
    this.classifiedRows().filter((r) => r.status === 'invalid').length,
  );

  // ── Lifecycle ──────────────────────────────────────────────────
  async ngOnInit() {
    try {
      if (!this.csvHeaders?.length || !this.csvRows?.length) {
        this.errorMessage.set('No se proporcionaron datos del CSV.');
        this.step.set('error');
        this.loading.set(false);
        return;
      }

      const companyId = this.auth.companyId();
      if (!companyId) {
        this.errorMessage.set('No se pudo determinar la empresa activa.');
        this.step.set('error');
        this.loading.set(false);
        return;
      }

      const [clients] = await Promise.all([
        this.customers.fetchClientsForMatcher(companyId),
      ]);
      this.existingClients.set(clients);

      // Map CSV rows → CustomerCsvRow[] and classify.
      const csvRowModels = this.csvRows.map((cols, idx) => this.mapCsvRow(cols, idx));
      this.csvRowModels.set(csvRowModels);
      this.classifiedRows.set(
        this.customers.classifyAllCustomerRows(csvRowModels, clients),
      );

      this.step.set('dry-run');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.errorMessage.set(`Error al clasificar las filas: ${message}`);
      this.step.set('error');
    } finally {
      this.loading.set(false);
    }
  }

  // ── CSV row mapping ────────────────────────────────────────────
  private mapCsvRow(cols: string[], idx: number): CustomerCsvRow {
    const aliasIndex = buildAliasIndex(this.csvHeaders);
    const out: Record<string, string> = {};
    const fieldMap: Partial<Record<keyof CustomerCsvRow, string | null>> = {};
    aliasIndex.forEach((field, colIdx) => {
      const raw = (cols[colIdx] ?? '').trim();
      if (!raw) return;
      out[field] = raw;
      // The shell only fills the canonical fields here; the dry-run can
      // mutate the row later via inline edits.
      if (
        field === 'firstName' ||
        field === 'surname' ||
        field === 'email' ||
        field === 'phone' ||
        field === 'cif' ||
        field === 'dni' ||
        field === 'clientType' ||
        field === 'businessName' ||
        field === 'tradeName' ||
        field === 'legalRepresentativeName' ||
        field === 'legalRepresentativeDni' ||
        field === 'address' ||
        field === 'addressCity' ||
        field === 'addressState' ||
        field === 'addressPostalCode' ||
        field === 'addressCountry'
      ) {
        (fieldMap as any)[field] = emptyString(raw);
      }
    });
    return {
      rowIndex: idx + 1,
      firstName: fieldMap.firstName ?? null,
      surname: fieldMap.surname ?? null,
      email: fieldMap.email ?? null,
      phone: fieldMap.phone ?? null,
      cif: fieldMap.cif ?? null,
      dni: fieldMap.dni ?? null,
      clientType: fieldMap.clientType ?? null,
      businessName: fieldMap.businessName ?? null,
      tradeName: fieldMap.tradeName ?? null,
      legalRepresentativeName: fieldMap.legalRepresentativeName ?? null,
      legalRepresentativeDni: fieldMap.legalRepresentativeDni ?? null,
      address: fieldMap.address ?? null,
      addressCity: fieldMap.addressCity ?? null,
      addressState: fieldMap.addressState ?? null,
      addressPostalCode: fieldMap.addressPostalCode ?? null,
      addressCountry: fieldMap.addressCountry ?? null,
      raw: out,
    };
  }

  /**
   * Re-classify a single row after an inline edit in the dry-run.
   * Used by the dry-run's `onRowEdited` callback. Returns the updated
   * `ClassifiedCustomerRow` for the parent to splice into the list.
   */
  reclassify(rowIndex: number): ClassifiedCustomerRow | null {
    const rows = this.classifiedRows();
    const target = rows.find((r) => r.csv.rowIndex === rowIndex);
    if (!target) return null;
    const next = this.customers.classifyCustomerRow(target.csv, this.existingClients());
    const updated: ClassifiedCustomerRow = { ...target, ...next };
    this.classifiedRows.set(
      rows.map((r) => (r.csv.rowIndex === rowIndex ? updated : r)),
    );
    return updated;
  }

  // ── Dry-run events ─────────────────────────────────────────────
  /**
   * The dry-run child emits rowsUpdated after any inline edit. We re-classify
   * every row here so that changes to classification-relevant fields
   * (firstName, surname, businessName, clientType) update the row status
   * and the `invalid` badges reflect the new reality. The matcher is
   * sub-millisecond per row so this is cheap even for hundreds of rows.
   */
  onDryRunUpdated(rows: ClassifiedCustomerRow[]) {
    const reclassified = rows.map((r) => {
      const next = this.customers.classifyCustomerRow(r.csv, this.existingClients());
      return { ...r, ...next };
    });
    this.classifiedRows.set(reclassified);
  }

  onDryRunNext() {
    const needsResolution = this.classifiedRows().some(
      (r) => r.status === 'likely_duplicate' && !r.resolution,
    );
    this.step.set(needsResolution ? 'resolution' : 'preview');
  }

  onDryRunBack() {
    // The dry-run is the first visible step (mapper is handled by the
    // parent shell). Going back closes the wizard — there's nowhere to
    // return to.
    this.cancel();
  }

  // ── Resolution events ──────────────────────────────────────────
  onResolutionResolved(rows: ClassifiedCustomerRow[]) {
    // Merge the resolved subset back into the full classifiedRows list.
    const resolvedByIndex = new Map(rows.map((r) => [r.csv.rowIndex, r]));
    this.classifiedRows.set(
      this.classifiedRows().map((r) => resolvedByIndex.get(r.csv.rowIndex) ?? r),
    );
    this.step.set('preview');
  }

  onResolutionBack() {
    this.step.set('dry-run');
  }

  // ── Preview events ─────────────────────────────────────────────
  onPreviewConfirm() {
    this.step.set('importing');
    void this.runImport();
  }

  onPreviewBack() {
    const needsResolution = this.classifiedRows().some(
      (r) => r.status === 'likely_duplicate' && !r.resolution,
    );
    this.step.set(needsResolution ? 'resolution' : 'dry-run');
  }

  // ── Import execution ───────────────────────────────────────────
  private async runImport() {
    try {
      const companyId = this.auth.companyId();
      if (!companyId) {
        this.errorMessage.set('No se pudo determinar la empresa activa.');
        this.step.set('error');
        return;
      }

      const payloads = this.customers.buildCustomersForInsert(this.classifiedRows());
      const last = await lastValueFrom(this.customers.importCustomersWizard(payloads));
      this.importResult.set(last);
      // The failures list isn't part of CustomerImportProgress, so we re-derive it.
      // The service emits `latestError` per failure; here we only have the final progress,
      // so the summary will just show the count. The parent can re-read if it wants the
      // per-row breakdown.
      this.importFailures.set(
        last.latestError ? [last.latestError] : [],
      );
      this.step.set('summary');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.errorMessage.set(`Error durante la importación: ${message}`);
      this.step.set('error');
    }
  }

  // ── Summary events ─────────────────────────────────────────────
  onDownloadFailures() {
    // The wizard shell handles the actual CSV generation so the summary
    // component stays pure-presentational. This is a passthrough so the
    // parent (or this shell) can wire up the download.
    const failures = this.importFailures();
    if (!failures.length) return;
    const header = 'rowIndex,errorCode,errorMessage';
    const lines = failures.map(
      (f) => `${f.rowIndex},"${(f.errorCode ?? '').replace(/"/g, '""')}","${(f.errorMessage ?? '').replace(/"/g, '""')}"`,
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-import-failures-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  onSummaryClose() {
    this.closed.emit();
  }

  // ── Cancel ─────────────────────────────────────────────────────
  cancel() {
    this.classifiedRows.set([]);
    this.csvRowModels.set([]);
    this.importResult.set(null);
    this.importFailures.set([]);
    this.errorMessage.set(null);
    this.closed.emit();
  }

  /** Diagnostic helper exposed for templates. */
  trackRow = (_: number, r: ClassifiedCustomerRow) => r.csv.rowIndex;

  /** True if the current step should show a cancel button. */
  get canCancel(): boolean {
    return this.step() !== 'importing';
  }

  /** Diagnostic helper — returns the step for the template. */
  get currentStep(): CustomerImportWizardStep {
    return this.step();
  }
}