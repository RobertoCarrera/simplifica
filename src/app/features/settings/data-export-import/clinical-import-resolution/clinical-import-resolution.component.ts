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
import {
  MatchedClinicalRow,
  ClinicalCandidate,
  ClinicalMatchStatus
} from '../../../../services/clinical-notes-import.service';
import { ClinicalNotesImportService } from '../../../../services/clinical-notes-import.service';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-clinical-import-resolution',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './clinical-import-resolution.component.html'
})
export class ClinicalImportResolutionComponent {
  private importService = inject(ClinicalNotesImportService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  @Input() set rows(value: MatchedClinicalRow[]) {
    this._rows.set([...value]);
  }
  get rows(): MatchedClinicalRow[] { return this._rows(); }

  @Output() confirmed = new EventEmitter<MatchedClinicalRow[]>();
  @Output() cancelled = new EventEmitter<void>();

  /** Public signal for the template to iterate. Set via the @Input rows setter. */
  _rows = signal<MatchedClinicalRow[]>([]);

  // Inline "create new client" form state
  creatingFor = signal<number | null>(null); // rowIndex being created
  newClientFirst = signal('');
  newClientLast = signal('');
  newClientEmail = signal('');
  newClientPhone = signal('');

  // ── Counts ────────────────────────────────────────────────────
  get countMatched()    { return this._rows().filter(r => r.status === 'matched').length; }
  get countAmbiguous()  { return this._rows().filter(r => r.status === 'ambiguous').length; }
  get countUnresolved() { return this._rows().filter(r => r.status === 'unresolved').length; }
  get countSkipped()    { return this._rows().filter(r => r.status === 'skipped').length; }
  get countToImport()   {
    return this._rows().filter(r =>
      r.status === 'matched' && r.clientId && r.value && r.value.trim().length > 0
    ).length;
  }

  // ── Row actions ───────────────────────────────────────────────
  pickCandidate(row: MatchedClinicalRow, candidateId: string) {
    const candidate = row.candidates.find((c) => c.id === candidateId);
    if (!candidate) return;
    this._rows.update((rows) =>
      rows.map((r) =>
        r.rowIndex === row.rowIndex
          ? { ...r, status: 'matched' as const, clientId: candidate.id, candidates: [candidate] }
          : r
      )
    );
  }

  skipRow(row: MatchedClinicalRow) {
    this._rows.update((rows) =>
      rows.map((r) =>
        r.rowIndex === row.rowIndex
          ? { ...r, status: 'skipped' as const, clientId: null }
          : r
      )
    );
  }

  openCreateClient(row: MatchedClinicalRow) {
    this.creatingFor.set(row.rowIndex);
    this.newClientFirst.set(row.firstName ?? '');
    this.newClientLast.set(row.lastName ?? '');
    this.newClientEmail.set('');
    this.newClientPhone.set('');
  }

  cancelCreateClient() {
    this.creatingFor.set(null);
  }

  async confirmCreateClient() {
    const rowIndex = this.creatingFor();
    if (rowIndex == null) return;
    const first = this.newClientFirst().trim();
    const last = this.newClientLast().trim();
    if (!first || !last) {
      this.toast.error('Datos requeridos', 'Nombre y apellidos son obligatorios.');
      return;
    }
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toast.error('Error', 'No se pudo determinar la empresa activa.');
      return;
    }

    this.importService
      .createClientFromImport(
        first,
        last,
        companyId,
        {
          email: this.newClientEmail().trim() || undefined,
          phone: this.newClientPhone().trim() || undefined
        }
      )
      .subscribe({
        next: ({ id }) => {
          this._rows.update((rows) =>
            rows.map((r) =>
              r.rowIndex === rowIndex
                ? {
                    ...r,
                    status: 'matched' as const,
                    clientId: id,
                    candidates: [{
                      id,
                      name: first,
                      surname: last,
                      email: this.newClientEmail().trim() || null,
                      health_data_consent: false,
                      company_id: companyId
                    }]
                  }
                : r
            )
          );
          this.toast.success('Cliente creado', `${first} ${last} fue creado. Recordá que necesitará consent explícito.`);
          this.creatingFor.set(null);
        },
        error: (err) => {
          this.toast.error('Error al crear cliente', err?.message ?? String(err));
        }
      });
  }

  // ── Confirm / cancel ─────────────────────────────────────────
  onConfirm() {
    // Only allow confirm when no rows are unresolved (they must create or skip)
    const stillUnresolved = this._rows().filter(r => r.status === 'unresolved').length;
    if (stillUnresolved > 0) {
      this.toast.error(
        'Filas sin resolver',
        `Quedan ${stillUnresolved} fila(s) sin cliente asignado. Creá un cliente o saltá cada una antes de continuar.`
      );
      return;
    }
    this.confirmed.emit(this._rows());
  }

  onCancel() {
    this.cancelled.emit();
  }

  // ── Status helpers ───────────────────────────────────────────
  statusLabelKey(status: ClinicalMatchStatus): string {
    const map: Record<ClinicalMatchStatus, string> = {
      matched: 'clinicalImport.status.matched',
      ambiguous: 'clinicalImport.status.ambiguous',
      unresolved: 'clinicalImport.status.unresolved',
      'missing-episode': 'clinicalImport.status.missingEpisode',
      skipped: 'clinicalImport.status.skipped',
      'consent-not-granted': 'clinicalImport.status.consentNotGranted'
    };
    return map[status];
  }

  statusClass(status: ClinicalMatchStatus): string {
    const map: Record<ClinicalMatchStatus, string> = {
      matched: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
      ambiguous: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      unresolved: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      'missing-episode': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      skipped: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      'consent-not-granted': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
    };
    return map[status];
  }

  candidateLabel(c: ClinicalCandidate): string {
    const email = c.email ? ` · ${c.email}` : '';
    return `${c.name} ${c.surname ?? ''}${email}`;
  }
}
