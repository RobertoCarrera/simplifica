import {
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DoctoraliaBookingsImportService,
  ResolvedDoctoraliaRow,
  DoctoraliaResolutionStatus,
} from '../../../../services/doctoralia-bookings-import.service';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';

type SectionStatus = 'matched' | 'ambiguous' | 'unresolved';
type LinkSection = 'client' | 'professional' | 'service';

interface SectionState {
  status: SectionStatus;
  id: string | null;
  candidates: { id: string; label: string }[];
  /** Inline create form state */
  creating: boolean;
  newName: string;
}

interface LinkPickerState {
  rowIndex: number;
  section: LinkSection;
  loading: boolean;
  query: string;
  items: { id: string; label: string; sublabel?: string }[];
}

@Component({
  selector: 'app-doctoralia-import-resolution',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslocoPipe],
  templateUrl: './doctoralia-import-resolution.component.html'
})
export class DoctoraliaImportResolutionComponent {
  private importService = inject(DoctoraliaBookingsImportService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  @Input() set rows(value: ResolvedDoctoraliaRow[]) {
    this._rows.set([...value]);
  }
  get rows(): ResolvedDoctoraliaRow[] { return this._rows(); }

  @Output() confirmed = new EventEmitter<ResolvedDoctoraliaRow[]>();
  @Output() cancelled = new EventEmitter<void>();

  _rows = signal<ResolvedDoctoraliaRow[]>([]);

  /**
   * When false (default), rows that are 'matched' or 'skipped' are hidden from
   * the list to reduce scroll. The user can toggle the visibility on from the
   * header (e.g. to fix a wrong pick). The onConfirm logic still operates on
   * ALL rows regardless of this flag — the toggle is purely a view concern.
   */
  showResolved = signal<boolean>(false);

  /**
   * Rows to render in the list. When showResolved is off, hides rows that
   * are already 'skipped' OR have all 3 sections in the 'matched' state
   * (fully resolved). A row whose overall status is 'matched' but has
   * an amber/red section stays visible — the user must fix that section
   * first. Order is preserved (the same order as _rows()).
   */
  visibleRows = computed<ResolvedDoctoraliaRow[]>(() => {
    const all = this._rows();
    if (this.showResolved()) return all;
    return all.filter((r) => r.status === 'skipped' ? false : !this.rowIsFullyResolved(r));
  });

  /** Number of rows currently hidden by the resolved-rows filter. */
  get hiddenResolvedCount(): number {
    return this._rows().filter((r) => r.status === 'skipped' || this.rowIsFullyResolved(r)).length;
  }

  /** Flip the showResolved flag. */
  toggleShowResolved(): void {
    this.showResolved.update((v) => !v);
  }

  /** Index of row currently showing the inline "create service" form. */
  creatingServiceFor = signal<number | null>(null);
  newServiceName = signal('');

  /** State for the "Vincular existente" picker modal. */
  linkPicker = signal<LinkPickerState | null>(null);
  linkPickerFilter = signal<string>('');
  /** All CRM entities (fetched once per picker opening). */
  linkPickerItems = signal<{ id: string; label: string; sublabel?: string }[]>([]);
  linkPickerLoading = signal(false);
  /**
   * "Apply to all rows with the same {service|professional}" checkbox in the picker.
   * Persists the broadcast decision keyed by the CSV's literal value
   * (csvServiceName or csvAgenda) so the choice sticks for the rest of the
   * resolution session. Reset on picker close.
   */
  linkPickerBroadcast = signal<boolean>(false);
  serviceBroadcastDecisions = signal<Map<string, string>>(new Map());
  professionalBroadcastDecisions = signal<Map<string, string>>(new Map());
  /**
   * Client broadcast is keyed by normalized firstName|lastName, NOT by a
   * single CSV field. Two reasons: (1) surnames avoid same-first-name
   * collisions; (2) the matcher already groups by both, so the broadcast
   * target is the same identity the user is reasoning about.
   *
   * Defense: if the group has rows with NON-NULL distinct patientIds, the
   * broadcast is BLOCKED — same name + different Docplanner id means
   * different people in the source system.
   */
  clientBroadcastDecisions = signal<Map<string, string>>(new Map());

  // ── Counts ─────────────────────────────────────────────────────
  get countMatched()    { return this._rows().filter((r) => r.status === 'matched').length; }
  get countAmbiguous()  { return this._rows().filter((r) => r.status === 'ambiguous').length; }
  get countUnresolved() { return this._rows().filter((r) => r.status === 'unresolved').length; }
  get countToImport()   {
    return this._rows().filter((r) => r.status === 'matched' || r.status === 'skipped').length;
  }

  // ── Broadcast helpers ──────────────────────────────────────────
  /**
   * Number of OTHER rows (excluding the current rowIndex) that share the
   * exact same csvServiceName AND are in ambiguous/unresolved state. Used
   * to decide whether to show the "apply to N rows" checkbox in the picker.
   */
  countServiceDuplicates(csvServiceName: string | null, excludeRowIndex: number): number {
    if (!csvServiceName) return 0;
    return this._rows().filter(
      (r) =>
        r.rowIndex !== excludeRowIndex &&
        r.serviceName === csvServiceName &&
        (r.status === 'ambiguous' || r.status === 'unresolved'),
    ).length;
  }

  /** Same as countServiceDuplicates but for the agenda (professional) column. */
  countProfessionalDuplicates(csvAgenda: string | null, excludeRowIndex: number): number {
    if (!csvAgenda) return 0;
    return this._rows().filter(
      (r) =>
        r.rowIndex !== excludeRowIndex &&
        r.agenda === csvAgenda &&
        (r.status === 'ambiguous' || r.status === 'unresolved'),
    ).length;
  }

  /**
   * Stable key for client identity broadcast: lowercase + accent-stripped
   * "firstName|lastName". Returns null when either name is missing — those
   * rows can't be safely broadcast.
   */
  clientKey(r: ResolvedDoctoraliaRow): string | null {
    const first = this.normalizeName(r.firstName);
    const last = this.normalizeName(r.lastName);
    if (!first || !last) return null;
    return `${first}|${last}`;
  }

  /** Accent-stripped, lowercased, single-spaced. Falls back to empty string. */
  private normalizeName(s: string | null | undefined): string {
    return (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * True if the row's firstName + lastName normalizes to a non-empty key.
   * Used by the broadcast logic to short-circuit on incomplete rows.
   */
  hasClientKey(r: ResolvedDoctoraliaRow): boolean {
    return this.clientKey(r) !== null;
  }

  /**
   * Defense: if the group of rows sharing a client key has at least two
   * rows with NON-NULL and DISTINCT patientIds, we REFUSE to broadcast —
   * same name + different Docplanner id means different people.
   * Returns true if the group is safe to broadcast.
   */
  isClientGroupSafe(rows: ResolvedDoctoraliaRow[]): boolean {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.patientId != null && r.patientId !== '') {
        ids.add(r.patientId);
        if (ids.size > 1) return false;
      }
    }
    return true;
  }

  /**
   * Number of OTHER rows (excluding the current rowIndex) that share the
   * same normalized firstName + lastName AND are in ambiguous/unresolved
   * state AND are safe to broadcast with (no conflicting patientIds).
   * Returns 0 if the group is unsafe.
   */
  countClientDuplicates(row: ResolvedDoctoraliaRow, excludeRowIndex: number): number {
    const key = this.clientKey(row);
    if (!key) return 0;
    const matching = this._rows().filter(
      (r) =>
        r.rowIndex !== excludeRowIndex &&
        this.clientKey(r) === key &&
        (r.status === 'ambiguous' || r.status === 'unresolved'),
    );
    // Apply the patientId safety check against the union of the current row
    // and the matches. If unsafe, no broadcast at all.
    const union = [row, ...matching];
    if (!this.isClientGroupSafe(union)) return 0;
    return matching.length;
  }

  /**
   * For the currently open picker, the number of rows that would be
   * affected by a broadcast pick (excluding the row being resolved now).
   */
  get currentPickerBroadcastCount(): number {
    const picker = this.linkPicker();
    if (!picker) return 0;
    const rows = this._rows();
    const current = rows.find((r) => r.rowIndex === picker.rowIndex);
    if (!current) return 0;
    if (picker.section === 'service') {
      return this.countServiceDuplicates(current.serviceName, picker.rowIndex);
    }
    if (picker.section === 'professional') {
      return this.countProfessionalDuplicates(current.agenda, picker.rowIndex);
    }
    if (picker.section === 'client') {
      return this.countClientDuplicates(current, picker.rowIndex);
    }
    return 0;
  }

  /**
   * For the currently open client picker, the normalized "FIRST LAST" used
   * in the checkbox label. Empty string if the row has no client key.
   */
  get currentPickerClientNameLabel(): string {
    const picker = this.linkPicker();
    if (!picker || picker.section !== 'client') return '';
    const current = this._rows().find((r) => r.rowIndex === picker.rowIndex);
    if (!current) return '';
    const first = this.normalizeName(current.firstName);
    const last = this.normalizeName(current.lastName);
    if (!first || !last) return '';
    return `${first} ${last}`.toUpperCase();
  }

  // ── Section helpers (read the row, normalize to per-section state)
  // Each section is evaluated INDEPENDENTLY of the row's overall status.
  // A section is "matched" if it has an id (resolved), "ambiguous" if it has
  // >1 candidate but no id chosen, "unresolved" otherwise. The row's overall
  // status is the worst of the 3 (see recomputeStatus).
  clientSection(r: ResolvedDoctoraliaRow): SectionState {
    if (r.clientId) {
      return {
        status: 'matched', id: r.clientId, candidates: r.clientCandidates,
        creating: false, newName: '',
      };
    }
    if (r.clientCandidates.length > 1) {
      return {
        status: 'ambiguous', id: null, candidates: r.clientCandidates,
        creating: false, newName: '',
      };
    }
    return {
      status: 'unresolved', id: null, candidates: [],
      creating: false, newName: '',
    };
  }

  professionalSection(r: ResolvedDoctoraliaRow): SectionState {
    if (r.professionalId) {
      return {
        status: 'matched', id: r.professionalId, candidates: r.professionalCandidates,
        creating: false, newName: '',
      };
    }
    if (r.professionalCandidates.length > 1) {
      return {
        status: 'ambiguous', id: null, candidates: r.professionalCandidates,
        creating: false, newName: '',
      };
    }
    return {
      status: 'unresolved', id: null, candidates: [],
      creating: false, newName: '',
    };
  }

  serviceSection(r: ResolvedDoctoraliaRow): SectionState {
    if (r.serviceId) {
      return {
        status: 'matched', id: r.serviceId, candidates: r.serviceCandidates,
        creating: false, newName: '',
      };
    }
    if (r.serviceCandidates.length > 1) {
      return {
        status: 'ambiguous', id: null, candidates: r.serviceCandidates,
        creating: false, newName: '',
      };
    }
    return {
      status: 'unresolved', id: null, candidates: [],
      creating: this.creatingServiceFor() === r.rowIndex, newName: this.newServiceName(),
    };
  }

  /**
   * Status of a single section. Convenience accessor used by the
   * row-level recompute logic so we don't have to instantiate the full
   * SectionState for each call.
   */
  private sectionStatus(r: ResolvedDoctoraliaRow, section: 'client' | 'professional' | 'service'): SectionStatus {
    if (section === 'client') return this.clientSection(r).status;
    if (section === 'professional') return this.professionalSection(r).status;
    return this.serviceSection(r).status;
  }

  // ── Row actions ───────────────────────────────────────────────
  pickClient(row: ResolvedDoctoraliaRow, candidateId: string) {
    this._rows.update((rows) =>
      rows.map((r) =>
        r.rowIndex === row.rowIndex
          ? { ...r, clientId: candidateId, clientCandidates: r.clientCandidates.filter((c) => c.id === candidateId), status: this.recomputeStatus(r, 'client', candidateId) }
          : r,
      ),
    );
  }

  pickProfessional(row: ResolvedDoctoraliaRow, candidateId: string) {
    this._rows.update((rows) =>
      rows.map((r) =>
        r.rowIndex === row.rowIndex
          ? { ...r, professionalId: candidateId, professionalCandidates: r.professionalCandidates.filter((c) => c.id === candidateId), status: this.recomputeStatus(r, 'professional', candidateId) }
          : r,
      ),
    );
  }

  pickService(row: ResolvedDoctoraliaRow, candidateId: string) {
    this._rows.update((rows) =>
      rows.map((r) =>
        r.rowIndex === row.rowIndex
          ? { ...r, serviceId: candidateId, serviceCandidates: r.serviceCandidates.filter((c) => c.id === candidateId), status: this.recomputeStatus(r, 'service', candidateId) }
          : r,
      ),
    );
  }

  skipRow(row: ResolvedDoctoraliaRow) {
    this._rows.update((rows) =>
      rows.map((r) => r.rowIndex === row.rowIndex ? { ...r, status: 'skipped' as const } : r),
    );
  }

  // ── Service on-the-fly creation ────────────────────────────────
  openCreateService(row: ResolvedDoctoraliaRow) {
    this.creatingServiceFor.set(row.rowIndex);
    this.newServiceName.set(row.serviceName ?? '');
  }

  cancelCreateService() {
    this.creatingServiceFor.set(null);
    this.newServiceName.set('');
  }

  confirmCreateService() {
    const rowIndex = this.creatingServiceFor();
    if (rowIndex == null) return;
    const name = this.newServiceName().trim();
    if (!name) {
      this.toast.error('Datos requeridos', 'El nombre del servicio es obligatorio.');
      return;
    }
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toast.error('Error', 'No se pudo determinar la empresa activa.');
      return;
    }

    this.importService.createServiceOnTheFly(companyId, name).subscribe({
      next: ({ id }) => {
        this._rows.update((rows) =>
          rows.map((r) => {
            if (r.rowIndex !== rowIndex) return r;
            const updated: ResolvedDoctoraliaRow = {
              ...r,
              serviceId: id,
              serviceCandidates: [{ id, label: name }],
              status: this.recomputeStatus(r, 'service', id),
            };
            return updated;
          }),
        );
        this.toast.success('Servicio creado', `"${name}" fue creado. Recordá revisar su precio y duración.`);
        this.creatingServiceFor.set(null);
        this.newServiceName.set('');
      },
      error: (err) => {
        this.toast.error('Error al crear servicio', err?.message ?? String(err));
      },
    });
  }

  // ── Client on-the-fly creation (delegates to clinical service) ─
  openCreateClient(row: ResolvedDoctoraliaRow) {
    const firstName = row.firstName ?? '';
    const lastName = row.lastName ?? '';
    if (!firstName || !lastName) {
      this.toast.error('Datos faltantes', 'La fila no tiene nombre o apellidos.');
      return;
    }
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toast.error('Error', 'No se pudo determinar la empresa activa.');
      return;
    }
    this.importService.createClientOnTheFly(companyId, firstName, lastName).subscribe({
      next: ({ id }) => {
        this._rows.update((rows) =>
          rows.map((r) =>
            r.rowIndex === row.rowIndex
              ? { ...r, clientId: id, clientCandidates: [{ id, label: `${firstName} ${lastName}` }], status: this.recomputeStatus(r, 'client', id) }
              : r,
          ),
        );
        this.toast.success('Cliente creado', `${firstName} ${lastName} fue creado. Necesitará consentimiento explícito.`);
      },
      error: (err) => {
        this.toast.error('Error al crear cliente', err?.message ?? String(err));
      },
    });
  }

  // ── "Vincular existente" picker ─────────────────────────────────
  /**
   * Open the picker modal for a given (row, section). Fetches the full
   * CRM entity list for that section type once and lets the user search
   * + pick. This is the PREFERRED way to resolve a row (over on-the-fly
   * creation) because it links the import to existing data.
   */
  async openLinkPicker(row: ResolvedDoctoraliaRow, section: LinkSection) {
    const companyId = this.auth.companyId();
    if (!companyId) {
      this.toast.error('Error', 'No se pudo determinar la empresa activa.');
      return;
    }
    this.linkPicker.set({ rowIndex: row.rowIndex, section, loading: true, query: '', items: [] });
    this.linkPickerFilter.set('');
    this.linkPickerLoading.set(true);
    // Reset broadcast checkbox; if there's a stored decision for this
    // {section, csvValue} pair, default to checked so the user can see it
    // and uncheck if they want one-off behavior.
    const stored = this.getStoredBroadcastDecision(row, section);
    this.linkPickerBroadcast.set(stored != null);
    try {
      const items = await this.fetchLinkPickerItems(section, companyId, row);
      this.linkPickerItems.set(items);
      this.linkPicker.update((p) => p ? { ...p, loading: false, items } : p);
    } catch (e: any) {
      this.toast.error('Error al cargar', e?.message ?? String(e));
      this.closeLinkPicker();
    }
  }

  private async fetchLinkPickerItems(
    section: LinkSection,
    companyId: string,
    row: ResolvedDoctoraliaRow,
  ): Promise<{ id: string; label: string; sublabel?: string }[]> {
    if (section === 'client') {
      const clients = await this.importService.fetchClientsForLink(companyId);
      return clients.map((c) => ({
        id: c.id,
        label: `${c.name} ${c.surname ?? ''}`.trim(),
        sublabel: c.email ?? c.docplanner_patient_id ?? undefined,
      }));
    }
    if (section === 'professional') {
      const profs = await this.importService.fetchProfessionalsForLink(companyId);
      return profs.map((p) => ({ id: p.id, label: p.display_name }));
    }
    if (section === 'service') {
      const services = await this.importService.fetchServicesForLink(companyId);
      return services.map((s) => ({ id: s.id, label: s.name }));
    }
    return [];
  }

  closeLinkPicker() {
    this.linkPicker.set(null);
    this.linkPickerFilter.set('');
    this.linkPickerItems.set([]);
    this.linkPickerBroadcast.set(false);
  }

  /**
   * Compute the visible items in the picker after applying the current
   * filter query. The filter is accent-insensitive (NFD strip) and
   * case-insensitive so "aran" matches "Aránzazu". Items are also
   * deduplicated by normalized label to avoid showing the same client
   * several times (the DB has duplicates in some companies).
   */
  get filteredLinkPickerItems(): { id: string; label: string; sublabel?: string }[] {
    const q = this.normalize(this.linkPickerFilter().trim());
    const items = this.linkPickerItems();
    // Dedupe by normalized label (keep first occurrence).
    const seen = new Set<string>();
    const deduped = items.filter((i) => {
      const key = this.normalize(i.label);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!q) return deduped.slice(0, 50);
    return deduped
      .filter((i) => {
        const label = this.normalize(i.label);
        const sub = this.normalize(i.sublabel ?? '');
        return label.includes(q) || sub.includes(q);
      })
      .slice(0, 50);
  }

  /** Accent-stripped, lowercase string for fuzzy matching. */
  private normalize(s: string): string {
    return (s ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Confirm the pick: link the chosen CRM entity to the row's section.
   * If the broadcast checkbox is on, also propagate to all other rows
   * that share the same CSV value (csvServiceName or csvAgenda, or for
   * clients the normalized firstName + lastName) and are in
   * ambiguous/unresolved state. Already-matched rows are NOT touched.
   * For clients, the broadcast is BLOCKED if the group has conflicting
   * patientIds (see isClientGroupSafe).
   */
  pickFromLinkPicker(item: { id: string; label: string }) {
    const picker = this.linkPicker();
    if (!picker) return;
    const broadcast = this.linkPickerBroadcast();
    const targetRowIndex = picker.rowIndex;
    const targetRow = this._rows().find((r) => r.rowIndex === targetRowIndex);

    if (picker.section === 'client') {
      this.pickClientById(picker.rowIndex, item.id, item.label);
      if (broadcast && targetRow) {
        const key = this.clientKey(targetRow);
        if (key) {
          this.broadcastClient(key, targetRowIndex, item.id, item.label);
        }
      }
    } else if (picker.section === 'professional') {
      this.pickProfessionalById(picker.rowIndex, item.id, item.label);
      if (broadcast && targetRow?.agenda) {
        this.broadcastProfessional(targetRow.agenda, targetRowIndex, item.id, item.label);
      }
    } else if (picker.section === 'service') {
      this.pickServiceById(picker.rowIndex, item.id, item.label);
      if (broadcast && targetRow?.serviceName) {
        this.broadcastService(targetRow.serviceName, targetRowIndex, item.id, item.label);
      }
    }
    this.closeLinkPicker();
  }

  /**
   * Apply the chosen CRM service to every other row that shares the same
   * csvServiceName and is in ambiguous/unresolved state. Stores the
   * decision in serviceBroadcastDecisions so subsequent resolutions
   * default to the same broadcast-on state.
   */
  private broadcastService(csvServiceName: string, sourceRowIndex: number, crmServiceId: string, crmServiceLabel: string) {
    // Persist the decision for this csvServiceName.
    const next = new Map(this.serviceBroadcastDecisions());
    next.set(csvServiceName, crmServiceId);
    this.serviceBroadcastDecisions.set(next);

    this._rows.update((rows) =>
      rows.map((r) => {
        if (
          r.rowIndex === sourceRowIndex ||
          r.serviceName !== csvServiceName ||
          (r.status !== 'ambiguous' && r.status !== 'unresolved')
        ) {
          return r;
        }
        return {
          ...r,
          serviceId: crmServiceId,
          serviceCandidates: [{ id: crmServiceId, label: crmServiceLabel }],
          status: this.recomputeStatus(r, 'service', crmServiceId),
        };
      }),
    );
  }

  /** Same as broadcastService but for the professional section, keyed by agenda. */
  private broadcastProfessional(csvAgenda: string, sourceRowIndex: number, crmProfessionalId: string, crmProfessionalLabel: string) {
    const next = new Map(this.professionalBroadcastDecisions());
    next.set(csvAgenda, crmProfessionalId);
    this.professionalBroadcastDecisions.set(next);

    this._rows.update((rows) =>
      rows.map((r) => {
        if (
          r.rowIndex === sourceRowIndex ||
          r.agenda !== csvAgenda ||
          (r.status !== 'ambiguous' && r.status !== 'unresolved')
        ) {
          return r;
        }
        return {
          ...r,
          professionalId: crmProfessionalId,
          professionalCandidates: [{ id: crmProfessionalId, label: crmProfessionalLabel }],
          status: this.recomputeStatus(r, 'professional', crmProfessionalId),
        };
      }),
    );
  }

  /**
   * Broadcast a CRM client pick to all other rows that share the same
   * normalized firstName + lastName. Applies the patientId safety check
   * (isClientGroupSafe) before doing anything — if the group has
   * conflicting patientIds, the broadcast is silently aborted. Already-
   * matched rows are never touched.
   */
  private broadcastClient(
    key: string,
    sourceRowIndex: number,
    crmClientId: string,
    crmClientLabel: string,
  ) {
    // Re-check safety using the current rows in case the user changed something.
    const sourceRow = this._rows().find((r) => r.rowIndex === sourceRowIndex);
    if (!sourceRow) return;
    const candidates = this._rows().filter(
      (r) =>
        r.rowIndex !== sourceRowIndex &&
        this.clientKey(r) === key &&
        (r.status === 'ambiguous' || r.status === 'unresolved'),
    );
    if (!this.isClientGroupSafe([sourceRow, ...candidates])) {
      // Don't update the decision map; user must explicitly re-try with a
      // tighter group. (The picker checkbox would also be hidden in this
      // case, but we keep this guard as defense in depth.)
      return;
    }

    // Persist the decision for this client key.
    const next = new Map(this.clientBroadcastDecisions());
    next.set(key, crmClientId);
    this.clientBroadcastDecisions.set(next);

    this._rows.update((rows) =>
      rows.map((r) => {
        if (r.rowIndex === sourceRowIndex) return r;
        if (this.clientKey(r) !== key) return r;
        if (r.status !== 'ambiguous' && r.status !== 'unresolved') return r;
        return {
          ...r,
          clientId: crmClientId,
          clientCandidates: [{ id: crmClientId, label: crmClientLabel }],
          status: this.recomputeStatus(r, 'client', crmClientId),
        };
      }),
    );
  }

  /** Returns the stored broadcast decision for a (row, section) pair, or null. */
  private getStoredBroadcastDecision(row: ResolvedDoctoraliaRow, section: LinkSection): string | null {
    if (section === 'service' && row.serviceName) {
      return this.serviceBroadcastDecisions().get(row.serviceName) ?? null;
    }
    if (section === 'professional' && row.agenda) {
      return this.professionalBroadcastDecisions().get(row.agenda) ?? null;
    }
    if (section === 'client') {
      const key = this.clientKey(row);
      if (key) return this.clientBroadcastDecisions().get(key) ?? null;
    }
    return null;
  }

  // Lower-level setters (called from the picker; mirror the pickClient/pickProfessional/pickService methods).
  private pickClientById(rowIndex: number, id: string, label: string) {
    this._rows.update((rows) =>
      rows.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        return {
          ...r,
          clientId: id,
          clientCandidates: [{ id, label }],
          status: this.recomputeStatus(r, 'client', id),
        };
      }),
    );
  }
  private pickProfessionalById(rowIndex: number, id: string, label: string) {
    this._rows.update((rows) =>
      rows.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        return {
          ...r,
          professionalId: id,
          professionalCandidates: [{ id, label }],
          status: this.recomputeStatus(r, 'professional', id),
        };
      }),
    );
  }
  private pickServiceById(rowIndex: number, id: string, label: string) {
    this._rows.update((rows) =>
      rows.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        return {
          ...r,
          serviceId: id,
          serviceCandidates: [{ id, label }],
          status: this.recomputeStatus(r, 'service', id),
        };
      }),
    );
  }

  // ── Status helpers ─────────────────────────────────────────────
  statusLabelKey(status: DoctoraliaResolutionStatus): string {
    const map: Record<DoctoraliaResolutionStatus, string> = {
      matched: 'doctoraliaBookingsImport.status.matched',
      ambiguous: 'doctoraliaBookingsImport.status.ambiguous',
      unresolved: 'doctoraliaBookingsImport.status.unresolved',
      skipped: 'doctoraliaBookingsImport.status.skipped',
    };
    return map[status];
  }

  statusClass(status: DoctoraliaResolutionStatus): string {
    const map: Record<DoctoraliaResolutionStatus, string> = {
      matched: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
      ambiguous: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      unresolved: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      skipped: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return map[status];
  }

  sectionStatusClass(s: SectionStatus): string {
    const map: Record<SectionStatus, string> = {
      matched: 'text-emerald-600 dark:text-emerald-400',
      ambiguous: 'text-amber-600 dark:text-amber-400',
      unresolved: 'text-red-600 dark:text-red-400',
    };
    return map[s];
  }

  sectionStatusIcon(s: SectionStatus): string {
    const map: Record<SectionStatus, string> = {
      matched: 'fa-check-circle',
      ambiguous: 'fa-question-circle',
      unresolved: 'fa-exclamation-circle',
    };
    return map[s];
  }

  // ── Confirm / cancel ──────────────────────────────────────────
  onConfirm() {
    // The import is allowed to proceed with rows that are 'matched' or 'skipped'.
    // Any 'ambiguous' or 'unresolved' row blocks the import.
    const blocking = this._rows().filter((r) =>
      r.status === 'ambiguous' || r.status === 'unresolved',
    );
    if (blocking.length > 0) {
      this.toast.error(
        'Filas sin resolver',
        `Quedan ${blocking.length} fila(s) sin resolver. Elegí un candidato, creá uno nuevo, o saltá cada una antes de continuar.`,
      );
      return;
    }
    this.confirmed.emit(this._rows());
  }

  onCancel() {
    this.cancelled.emit();
  }

  // ── Internal: recompute the overall row status ─────────────────
  /**
   * Recompute the overall row status from its 3 sections. The result is the
   * WORST of the 3 section statuses:
   *   - if any section is 'unresolved' → row is 'unresolved'
   *   - else if any section is 'ambiguous' → row is 'ambiguous'
   *   - else → row is 'matched'
   *
   * The `section` arg is informational (which section was just edited) and
   * does not affect the result. The `_id` arg is accepted for backward
   * compatibility with the existing callers.
   */
  private recomputeStatus(
    r: ResolvedDoctoraliaRow,
    _section: 'client' | 'professional' | 'service',
    _id: string,
  ): DoctoraliaResolutionStatus {
    const c = this.sectionStatus(r, 'client');
    const p = this.sectionStatus(r, 'professional');
    const s = this.sectionStatus(r, 'service');
    if (c === 'unresolved' || p === 'unresolved' || s === 'unresolved') return 'unresolved';
    if (c === 'ambiguous' || p === 'ambiguous' || s === 'ambiguous') return 'ambiguous';
    return 'matched';
  }

  /**
   * True if the row has all 3 sections in the green / matched state.
   * Used by the auto-hide filter (round 5) so that a row stays visible
   * until EVERY section is resolved — not just the row's overall status,
   * which used to be permissive.
   */
  rowIsFullyResolved(r: ResolvedDoctoraliaRow): boolean {
    return this.sectionStatus(r, 'client') === 'matched'
        && this.sectionStatus(r, 'professional') === 'matched'
        && this.sectionStatus(r, 'service') === 'matched';
  }
}
