import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ClassifiedCustomerRow,
  RowClassificationStatus,
} from '../../../../services/customer-import.types';

/**
 * Dry-run classification table for the customer import wizard.
 *
 * Shows every CSV row with its classification status. Inline-edit fields
 * appear for `invalid` rows. Edits + skip decisions emit `rowsUpdated`
 * back to the parent (the wizard shell), which re-classifies the row.
 */
@Component({
  selector: 'app-customer-import-dry-run',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './customer-import-dry-run.component.html',
})
export class CustomerImportDryRunComponent {
  @Input() set rows(value: ClassifiedCustomerRow[]) {
    this._rows.set(value ? value.map((r) => ({ ...r, csv: { ...r.csv } })) : []);
  }
  get rows(): ClassifiedCustomerRow[] {
    return this._rows();
  }

  @Output() rowsUpdated = new EventEmitter<ClassifiedCustomerRow[]>();
  @Output() next = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  /** Local mirror of rows so edits don't mutate the parent's reference. */
  _rows = signal<ClassifiedCustomerRow[]>([]);

  /** Live counts derived from the local rows. */
  validCount = computed<number>(
    () => this._rows().filter((r) => r.status === 'valid').length,
  );
  duplicateCount = computed<number>(
    () => this._rows().filter((r) => r.status === 'likely_duplicate').length,
  );
  invalidCount = computed<number>(
    () => this._rows().filter((r) => r.status === 'invalid').length,
  );
  alreadyExistsCount = computed<number>(
    () => this._rows().filter((r) => r.status === 'alreadyExists').length,
  );
  totalCount = computed<number>(() => this._rows().length);

  /** Track row index for template iteration. */
  trackRow = (_: number, r: ClassifiedCustomerRow) => r.csv.rowIndex;

  // ── Status badge helpers ────────────────────────────────────────
  statusClass(status: RowClassificationStatus): string {
    const map: Record<RowClassificationStatus, string> = {
      valid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
      likely_duplicate:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      invalid: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      alreadyExists:
        'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return map[status] ?? '';
  }

  statusIcon(status: RowClassificationStatus): string {
    const map: Record<RowClassificationStatus, string> = {
      valid: 'fa-check-circle',
      likely_duplicate: 'fa-question-circle',
      invalid: 'fa-times-circle',
      alreadyExists: 'fa-link',
    };
    return map[status] ?? '';
  }

  statusLabel(status: RowClassificationStatus): string {
    const map: Record<RowClassificationStatus, string> = {
      valid: 'customerImport.status.valid',
      likely_duplicate: 'customerImport.status.likelyDuplicate',
      invalid: 'customerImport.status.invalid',
      alreadyExists: 'customerImport.status.alreadyExists',
    };
    return map[status];
  }

  // ── Edit handling ───────────────────────────────────────────────
  /**
   * Update a single field of a row's CSV data. The parent will re-classify
   * when `rowsUpdated` is emitted. We don't run the matcher here — the
   * wizard shell is the single source of truth for classification.
   */
  onFieldChanged(
    rowIndex: number,
    field:
      | 'firstName'
      | 'surname'
      | 'email'
      | 'phone'
      | 'cif'
      | 'dni'
      | 'clientType'
      | 'businessName'
      | 'addressCity'
      | 'addressState'
      | 'addressPostalCode'
      | 'addressCountry',
    value: string,
  ) {
    const next = this._rows().map((r) => {
      if (r.csv.rowIndex !== rowIndex) return r;
      return { ...r, csv: { ...r.csv, [field]: value === '' ? null : value } };
    });
    this._rows.set(next);
    this.rowsUpdated.emit(next);
  }

  // ── Row actions ─────────────────────────────────────────────────
  skipRow(row: ClassifiedCustomerRow) {
    const next = this._rows().map((r) =>
      r.csv.rowIndex === row.csv.rowIndex
        ? { ...r, resolution: { choice: 'skip' as const } }
        : r,
    );
    this._rows.set(next);
    this.rowsUpdated.emit(next);
  }

  // ── Navigation ──────────────────────────────────────────────────
  onContinue() {
    this.next.emit();
  }

  onBack() {
    this.back.emit();
  }

  /**
   * Force-create a row that was classified as `alreadyExists` (i.e. the
   * CSV row matches an existing CRM client). The user wants the row
   * auto-skipped by default but has the option to override here when they
   * verify the match is wrong (e.g. two different people who happen to
   * share an email or DNI).
   */
  forceCreate(row: ClassifiedCustomerRow) {
    const next = this._rows().map((r) =>
      r.csv.rowIndex === row.csv.rowIndex
        ? { ...r, resolution: { choice: 'create' as const } }
        : r,
    );
    this._rows.set(next);
    this.rowsUpdated.emit(next);
  }

  /** Reverse a force-create override, going back to the default (skip). */
  clearResolution(row: ClassifiedCustomerRow) {
    const next = this._rows().map((r) => {
      if (r.csv.rowIndex !== row.csv.rowIndex) return r;
      const { resolution: _resolution, ...rest } = r;
      return rest as ClassifiedCustomerRow;
    });
    this._rows.set(next);
    this.rowsUpdated.emit(next);
  }

  /**
   * Human-readable label for the matched existing client (used in the
   * Estado column for `alreadyExists` and `likely_duplicate` rows).
   * Falls back to email or "(sin nombre)" when the client row is missing
   * the standard name fields.
   */
  existingClientLabel(row: ClassifiedCustomerRow): string {
    const c = row.candidates?.[0]?.client;
    if (!c) return '';
    const name = (c.name ?? '').trim();
    const surname = (c.surname ?? '').trim();
    const full = `${name} ${surname}`.trim();
    if (full) return full;
    const business = (c as any).business_name?.trim();
    if (business) return business;
    const email = (c as any).email?.trim();
    if (email) return email;
    return '(sin nombre)';
  }

  /** True if the row has an explicit force-create override. */
  isForceCreate(row: ClassifiedCustomerRow): boolean {
    return row.resolution?.choice === 'create';
  }
}