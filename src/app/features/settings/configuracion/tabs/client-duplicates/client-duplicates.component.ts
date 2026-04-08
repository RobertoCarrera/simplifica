import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DuplicateMergeService,
  DuplicatePair,
  ClientMergeData,
  MergeResult
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
  pairs = signal<DuplicatePair[]>([]);
  error = signal<string | null>(null);
  mergeResult = signal<MergeResult | null>(null);

  // Pair being merged (null = list view)
  activePair = signal<DuplicatePair | null>(null);
  mergeFields = signal<MergeField[]>([]);

  readonly matchLabels: Record<DuplicatePair['match_reason'], string> = {
    email_and_name: 'Email y nombre',
    email: 'Email',
    name: 'Nombre y apellido'
  };

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
}
