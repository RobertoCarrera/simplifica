import { Component, Input, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DuplicateMergeService,
  DuplicatePair,
  ClientMergeData,
  MergeResult,
  BulkMergeResult,
  BulkClusterPlan
} from '../../../../../services/duplicate-merge.service';
import { ToastService } from '../../../../../services/toast.service';

type FieldKey = keyof ClientMergeData;

interface MergeField {
  key: FieldKey;
  label: string;
  choice: 'a' | 'b' | 'custom';
  customValue: string;
}

@Component({
  selector: 'app-client-duplicates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-duplicates.component.html',
  styleUrls: ['./client-duplicates.component.scss']
})
export class ClientDuplicatesComponent implements OnInit {
  @Input() companyId: string | null | undefined = null;

  loading = signal(false);
  merging = signal(false);
  bulkMerging = signal(false);
  pairs = signal<DuplicatePair[]>([]);
  error = signal<string | null>(null);
  mergeResult = signal<MergeResult | null>(null);
  bulkResult = signal<BulkMergeResult | null>(null);

  // Pair being merged (null = list view)
  activePair = signal<DuplicatePair | null>(null);
  mergeFields = signal<MergeField[]>([]);

  // Search filter
  searchQuery = signal('');

  // ── Bulk action state ───────────────────────────────────────────
  // Pairs currently checked by the user (keyed by 'id_a|id_b').
  selectedKeys = signal<Set<string>>(new Set<string>());

  // Dialog de confirmación (anti click accidental)
  bulkDialogOpen = signal(false);
  bulkConfirmText = signal('');
  readonly BULK_CONFIRM_REQUIRED = 'FUSIONAR';

  // Plan preview (dry-run result). When non-null, shown to the user
  // before the final "FUSIONAR" button is enabled.
  previewPlan = signal<BulkMergeResult | null>(null);
  previewing = signal(false);

  // Cluster keys the user wants to ACTUALLY merge. Initialized to ALL
  // cluster keys when the preview comes back. The user can deselect
  // individual ones; the rest stay selected.
  selectedClusterKeys = signal<Set<string>>(new Set<string>());

  // Computed: filtered pairs by search query
  filteredPairs = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.pairs();
    return this.pairs().filter(pair =>
      pair.name_a?.toLowerCase().includes(q) ||
      pair.surname_a?.toLowerCase().includes(q) ||
      pair.email_a?.toLowerCase().includes(q) ||
      pair.phone_a?.toLowerCase().includes(q) ||
      pair.name_b?.toLowerCase().includes(q) ||
      pair.surname_b?.toLowerCase().includes(q) ||
      pair.email_b?.toLowerCase().includes(q) ||
      pair.phone_b?.toLowerCase().includes(q)
    );
  });

  /**
   * Client-side mirror of the server's safety filter. The server is the
   * source of truth — anything this returns "false" for will simply
   * be skipped server-side and shown in the post-merge report.
   *
   * Rules (must match detect_duplicate_clients in the SQL):
   *   - email_and_name: same email (non-placeholder) + same name+surname
   *   - email: same email (non-placeholder), any name
   *   - phone: same normalized phone + same name+surname
   *   - name: exact normalized equality on name AND surname
   *   - name_fuzzy: token-set Jaccard ≥ 0.6 + first-name anchor
   *
   * After migration 20260616000003, name and name_fuzzy are also
   * bulk-mergeable because the user reviews every cluster in the
   * preview before executing.
   */
  isSafePair(p: DuplicatePair): boolean {
    if (p.match_reason === 'email_and_name' || p.match_reason === 'email') {
      // email match is safe as long as the email isn't the placeholder
      const a = (p.email_a ?? '').toLowerCase().trim();
      const b = (p.email_b ?? '').toLowerCase().trim();
      if (a && a === b && a !== 'corre@tudominio.es') return true;
    }
    if (p.match_reason === 'phone') {
      // The detector only emits 'phone' matches when the name+surname
      // already agree; we don't need to re-verify that on the client.
      return true;
    }
    if (p.match_reason === 'name' || p.match_reason === 'name_fuzzy') {
      // Safe to bulk-merge: the user reviews the cluster in the preview
      // before executing. The frontend's safeDetectedCount + the bulk
      // action bar still surface these for explicit confirmation.
      return true;
    }
    return false;
  }

  // The match_reasons the server treats as safe. After the duplicate
  // detector upgrade (migration 20260616000003), 'name' and 'name_fuzzy'
  // are also safe to bulk-merge because:
  //   - 'name' requires exact normalized equality on name AND surname.
  //   - 'name_fuzzy' requires token-set Jaccard ≥ 0.6 + first-name anchor.
  // The user reviews every cluster in the preview before executing, so
  // the risk of false positives is low and the UX gain is significant
  // (previously these were surfaced but not bulk-mergeable).
  readonly safeMatchReasons: ReadonlyArray<DuplicatePair['match_reason']> = [
    'email_and_name', 'email', 'phone', 'name', 'name_fuzzy'
  ];

  // Display labels for every match_reason the server can emit.
  readonly matchLabels: Record<DuplicatePair['match_reason'], string> = {
    email_and_name: 'Email y nombre',
    email: 'Email',
    phone: 'Teléfono',
    name: 'Nombre y apellido',
    name_fuzzy: 'Nombre similar'
  };

  // How many of the CURRENTLY DETECTED pairs (filtered by search) the
  // server will consider safe. This is the headline number we show in
  // the bulk-action bar.
  safeDetectedCount = computed<number>(() => {
    return this.filteredPairs().filter(p => this.isSafePair(p)).length;
  });

  readonly fieldDefs: { key: FieldKey; label: string }[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'surname', label: 'Apellido' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'business_name', label: 'Razón social' },
    { key: 'trade_name', label: 'Nombre comercial' },
    { key: 'notes', label: 'Notas' }
  ];

  constructor(
    private duplicateSvc: DuplicateMergeService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.companyId) return;
    this.loading.set(true);
    this.error.set(null);
    this.selectedKeys.set(new Set());
    this.bulkResult.set(null);
    this.duplicateSvc.detectDuplicates(this.companyId).subscribe({
      next: pairs => {
        this.pairs.set(pairs);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err?.message ?? 'Error al detectar duplicados');
        this.loading.set(false);
      }
    });
  }

  pairKey(pair: DuplicatePair): string {
    return `${pair.id_a}|${pair.id_b}`;
  }

  isSelected(p: DuplicatePair): boolean {
    return this.selectedKeys().has(this.pairKey(p));
  }

  toggleSelect(p: DuplicatePair): void {
    const key = this.pairKey(p);
    this.selectedKeys.update(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  selectAllSafe(): void {
    const next = new Set<string>();
    for (const p of this.filteredPairs()) {
      if (this.isSafePair(p)) next.add(this.pairKey(p));
    }
    this.selectedKeys.set(next);
  }

  clearSelection(): void {
    this.selectedKeys.set(new Set());
  }

  /**
   * Step 1: ask the server what it would do (dry-run) and show the plan.
   * No row is touched.
   */
  runPreview(): void {
    if (!this.companyId) return;
    this.previewing.set(true);
    this.previewPlan.set(null);
    this.duplicateSvc.previewBulkMerge(this.companyId).subscribe({
      next: res => {
        this.previewPlan.set(res);
        this.previewing.set(false);
        // Initialize selection to ALL cluster keys. The user can deselect
        // any of them from the preview before pressing "Ejecutar".
        this.selectedClusterKeys.set(
          new Set((res.plan ?? []).map(c => c.cluster_key))
        );
        if (res.total_clusters === 0) {
          this.toast.info('Nada que fusionar', 'El servidor no detectó clústeres seguros.');
        } else {
          this.toast.success(
            'Plan generado',
            `${res.total_clusters} clúster(es) · ${res.total_to_discard} clientes a inactivar.`
          );
        }
      },
      error: err => {
        this.previewing.set(false);
        this.toast.error('Error en la vista previa', err?.message ?? 'Intentá de nuevo.');
      }
    });
  }

  dismissPreview(): void {
    this.previewPlan.set(null);
    this.selectedClusterKeys.set(new Set());
  }

  /** Toggle a single cluster's selection. */
  toggleClusterSelection(clusterKey: string): void {
    this.selectedClusterKeys.update(prev => {
      const next = new Set(prev);
      if (next.has(clusterKey)) next.delete(clusterKey);
      else next.add(clusterKey);
      return next;
    });
  }

  isClusterSelected(clusterKey: string): boolean {
    return this.selectedClusterKeys().has(clusterKey);
  }

  /** Mark all clusters in the current preview as selected. */
  selectAllClusters(): void {
    const pp = this.previewPlan();
    if (!pp) return;
    this.selectedClusterKeys.set(
      new Set((pp.plan ?? []).map(c => c.cluster_key))
    );
  }

  /** Deselect all clusters. */
  deselectAllClusters(): void {
    this.selectedClusterKeys.set(new Set());
  }

  openMerge(pair: DuplicatePair): void {
    this.activePair.set(pair);
    this.mergeResult.set(null);
    this.mergeFields.set(
      this.fieldDefs.map(f => ({
        key: f.key,
        label: f.label,
        // Default: pick the non-null value, preferring A
        choice: this.valueFor(pair, f.key, 'a') != null ? 'a' : 'b',
        customValue: String(this.valueFor(pair, f.key, 'a') ?? this.valueFor(pair, f.key, 'b') ?? '')
      }))
    );
  }

  cancelMerge(): void {
    this.activePair.set(null);
    this.mergeResult.set(null);
  }

  valueFor(pair: DuplicatePair, key: FieldKey, side: 'a' | 'b'): string | null {
    const map: Record<FieldKey, { a: keyof DuplicatePair; b: keyof DuplicatePair }> = {
      name:          { a: 'name_a',    b: 'name_b' },
      surname:       { a: 'surname_a', b: 'surname_b' },
      email:         { a: 'email_a',   b: 'email_b' },
      phone:         { a: 'phone_a',   b: 'phone_b' },
      business_name: { a: 'name_a',    b: 'name_b' },  // no separate col in pair
      trade_name:    { a: 'name_a',    b: 'name_b' },  // no separate col in pair
      notes:         { a: 'name_a',    b: 'name_b' }   // no separate col in pair
    };
    const col = map[key][side];
    const val = pair[col];
    return typeof val === 'string' ? val : null;
  }

  resolvedValue(field: MergeField, pair: DuplicatePair): string {
    if (field.choice === 'custom') return field.customValue;
    const raw = this.valueFor(pair, field.key, field.choice);
    return raw ?? '';
  }

  confirmMerge(keepSide: 'a' | 'b'): void {
    const pair = this.activePair();
    if (!pair) return;

    const keepId   = keepSide === 'a' ? pair.id_a : pair.id_b;
    const discardId = keepSide === 'a' ? pair.id_b : pair.id_a;

    const mergedData: Partial<ClientMergeData> = {};
    for (const field of this.mergeFields()) {
      const pair_ = this.activePair()!;
      const val = field.choice === 'custom'
        ? field.customValue
        : (this.valueFor(pair_, field.key, field.choice) ?? '');
      (mergedData as Record<string, string>)[field.key] = val;
    }

    this.merging.set(true);
    this.duplicateSvc.mergeClients(keepId, discardId, mergedData).subscribe({
      next: result => {
        this.mergeResult.set(result);
        this.merging.set(false);
        // Remove merged pair from list
        this.pairs.update(list => list.filter(p => !(p.id_a === pair.id_a && p.id_b === pair.id_b)));
        this.toast.success('Fusión completada', 'Los clientes se fusionaron correctamente.');
      },
      error: err => {
        this.merging.set(false);
        this.toast.error('Error al fusionar', err?.message ?? 'Intentá de nuevo.');
      }
    });
  }

  // ── Bulk merge flow ─────────────────────────────────────────────

  /**
   * Step 2: open the confirmation dialog. Requires a fresh preview to be
   * present (so the user can see the plan before typing FUSIONAR).
   */
  openBulkDialog(): void {
    if (!this.previewPlan() || this.previewPlan()!.total_clusters === 0) return;
    this.bulkConfirmText.set('');
    this.bulkDialogOpen.set(true);
  }

  closeBulkDialog(): void {
    this.bulkDialogOpen.set(false);
    this.bulkConfirmText.set('');
  }

  bulkConfirmEnabled = computed<boolean>(() => {
    return this.bulkConfirmText().trim() === this.BULK_CONFIRM_REQUIRED
      && !!this.previewPlan()
      && this.previewPlan()!.total_clusters > 0
      && this.selectedClusterKeys().size > 0
      && !this.bulkMerging();
  });

  /**
   * Step 3: actually run the merge. Uses the most recent preview as a
   * sanity check; if the plan is stale (no preview), refuses to run.
   *
   * Only the clusters the user kept CHECKED in the preview are passed
   * to the server. Deselected clusters are skipped (counted in
   * `skipped_clusters` on the response).
   */
  runBulkMerge(): void {
    if (!this.bulkConfirmEnabled()) return;
    if (!this.companyId) return;

    const selected = Array.from(this.selectedClusterKeys());

    this.bulkMerging.set(true);
    this.bulkDialogOpen.set(false);

    this.duplicateSvc.bulkMergeSafeDuplicates(this.companyId, selected).subscribe({
      next: res => {
        this.bulkResult.set(res);
        this.bulkMerging.set(false);
        this.previewPlan.set(null);   // plan is now stale

        if (res.merged > 0) {
          // Remove from local list every pair whose both ids were merged.
          const removedIds = new Set<string>();
          for (const p of res.plan) {
            if (p.skip_reason === 'deselected') continue;
            removedIds.add(p.keep_id);
            for (const d of p.discard_ids) removedIds.add(d);
          }
          this.pairs.update(list =>
            list.filter(p => !(removedIds.has(p.id_a) && removedIds.has(p.id_b)))
          );
          const totalInPlan = res.plan.length;
          const deselected  = res.plan.filter(p => p.skip_reason === 'deselected').length;
          const processed   = totalInPlan - deselected;
          this.toast.success(
            'Fusión masiva completada',
            deselected > 0
              ? `${res.merged} cliente(s) reasignado(s) en ${processed} clúster(es). ${deselected} clúster(es) saltado(s) por deselección.`
              : `${res.merged} cliente(s) reasignado(s) en ${processed} clúster(es).`
          );
        } else {
          this.toast.info('Nada que fusionar', 'No había clústeres seleccionados para fusionar.');
        }

        if (res.errors?.length) {
          this.toast.error(
            'Errores durante la fusión',
            `${res.errors.length} operación(es) fallaron. Revisá el resumen.`
          );
        }
        this.selectedKeys.set(new Set());
        this.selectedClusterKeys.set(new Set());
        this.bulkConfirmText.set('');
      },
      error: err => {
        this.bulkMerging.set(false);
        this.toast.error('Error en la fusión masiva', err?.message ?? 'Intentá de nuevo.');
      }
    });
  }

  dismissBulkResult(): void {
    this.bulkResult.set(null);
  }
}
