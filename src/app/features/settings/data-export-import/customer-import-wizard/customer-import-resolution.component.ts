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
  CustomerMatchCandidate,
} from '../../../../services/customer-import.types';

interface ResolutionChoice {
  choice: 'link' | 'create' | 'skip';
  linkedClientId?: string;
}

/**
 * Resolution UI for ⚠️ (likely_duplicate) rows. Each row shows the CSV
 * data, the CRM candidate list, and three buttons: Vincular, Crear,
 * Saltar. When 2+ rows share the same email, a per-row bulk checkbox
 * appears so the user can broadcast the decision to the sibling rows
 * (mirrors the Doctoralia round 4 broadcast pattern).
 */
@Component({
  selector: 'app-customer-import-resolution',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './customer-import-resolution.component.html',
})
export class CustomerImportResolutionComponent {
  @Input() set rows(value: ClassifiedCustomerRow[]) {
    this._rows.set(value ? value.map((r) => ({ ...r, csv: { ...r.csv } })) : []);
  }
  get rows(): ClassifiedCustomerRow[] {
    return this._rows();
  }

  @Output() rowsResolved = new EventEmitter<ClassifiedCustomerRow[]>();
  @Output() back = new EventEmitter<void>();

  _rows = signal<ClassifiedCustomerRow[]>([]);

  /**
   * Bulk decision toggle state, keyed by rowIndex. When true, the next
   * resolution action also applies to all other rows sharing the same
   * email. Reset on `confirm`.
   */
  broadcastByRow = signal<Map<number, boolean>>(new Map());

  /**
   * Counts derived from the local rows.
   */
  duplicateCount = computed<number>(
    () => this._rows().filter((r) => r.status === 'likely_duplicate').length,
  );

  resolvedCount = computed<number>(
    () => this._rows().filter((r) => !!r.resolution).length,
  );

  /**
   * Returns the number of OTHER rows (excluding `excludeRowIndex`) that
   * share the same exact normalized email. Used to decide whether to
   * show the "Aplicar a las N filas con este mismo email" checkbox.
   */
  countEmailDuplicates(row: ClassifiedCustomerRow, excludeRowIndex: number): number {
    const key = this.normalizeEmail(row.csv.email);
    if (!key) return 0;
    return this._rows().filter(
      (r) =>
        r.csv.rowIndex !== excludeRowIndex && this.normalizeEmail(r.csv.email) === key,
    ).length;
  }

  private normalizeEmail(email: string | null | undefined): string {
    return (email ?? '').trim().toLowerCase();
  }

  /**
   * Apply a Vincular decision: link to the chosen CRM client. If
   * broadcast is on, also link all sibling rows that share the same
   * normalized email.
   */
  pickLink(row: ClassifiedCustomerRow, candidate: CustomerMatchCandidate) {
    const decision: ResolutionChoice = {
      choice: 'link',
      linkedClientId: candidate.client.id,
    };
    const broadcast = !!this.broadcastByRow().get(row.csv.rowIndex);
    const next = this._rows().map((r) => {
      if (r.csv.rowIndex === row.csv.rowIndex) {
        return { ...r, resolution: decision };
      }
      if (broadcast && this.normalizeEmail(r.csv.email) === this.normalizeEmail(row.csv.email)) {
        return { ...r, resolution: decision };
      }
      return r;
    });
    this._rows.set(next);
    this.clearBroadcast(row.csv.rowIndex);
  }

  /** Apply a "Crear nuevo" decision (no client id). */
  pickCreate(row: ClassifiedCustomerRow) {
    const decision: ResolutionChoice = { choice: 'create' };
    const broadcast = !!this.broadcastByRow().get(row.csv.rowIndex);
    const next = this._rows().map((r) => {
      if (r.csv.rowIndex === row.csv.rowIndex) {
        return { ...r, resolution: decision };
      }
      if (broadcast && this.normalizeEmail(r.csv.email) === this.normalizeEmail(row.csv.email)) {
        return { ...r, resolution: decision };
      }
      return r;
    });
    this._rows.set(next);
    this.clearBroadcast(row.csv.rowIndex);
  }

  /** Apply a "Saltar fila" decision. */
  pickSkip(row: ClassifiedCustomerRow) {
    const decision: ResolutionChoice = { choice: 'skip' };
    const broadcast = !!this.broadcastByRow().get(row.csv.rowIndex);
    const next = this._rows().map((r) => {
      if (r.csv.rowIndex === row.csv.rowIndex) {
        return { ...r, resolution: decision };
      }
      if (broadcast && this.normalizeEmail(r.csv.email) === this.normalizeEmail(row.csv.email)) {
        return { ...r, resolution: decision };
      }
      return r;
    });
    this._rows.set(next);
    this.clearBroadcast(row.csv.rowIndex);
  }

  /** Toggle the broadcast checkbox for a single row. */
  setBroadcast(rowIndex: number, value: boolean) {
    const next = new Map(this.broadcastByRow());
    if (value) {
      next.set(rowIndex, true);
    } else {
      next.delete(rowIndex);
    }
    this.broadcastByRow.set(next);
  }

  isBroadcast(rowIndex: number): boolean {
    return !!this.broadcastByRow().get(rowIndex);
  }

  private clearBroadcast(rowIndex: number) {
    const next = new Map(this.broadcastByRow());
    next.delete(rowIndex);
    this.broadcastByRow.set(next);
  }

  // ── Navigation ──────────────────────────────────────────────────
  onContinue() {
    if (this.unresolvedCount() > 0) {
      return;
    }
    this.rowsResolved.emit(this._rows());
  }

  onBack() {
    this.back.emit();
  }

  /** Number of ⚠️ rows still without a resolution choice. */
  unresolvedCount = computed<number>(
    () => this._rows().filter((r) => r.status === 'likely_duplicate' && !r.resolution).length,
  );

  /** Track by index. */
  trackRow = (_: number, r: ClassifiedCustomerRow) => r.csv.rowIndex;
}