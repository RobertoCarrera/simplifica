import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupplierImportService, ParsedCSVRow, FieldMapping, SupplierProductDraft } from '../../../services/supplier-import.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-supplier-import',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div class="mx-auto max-w-5xl">
        <!-- Header -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between mb-2">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-slate-50">Importar Productos</h1>
              <p class="text-gray-600 dark:text-slate-400 mt-1">Sube un CSV de tu proveedor y impórtalo a tu catálogo</p>
            </div>
            <button type="button" (click)="goBack()" class="text-gray-500 hover:text-gray-700 dark:hover:text-slate-300">
              <i class="fas fa-arrow-left mr-1"></i> Volver
            </button>
          </div>
        </div>

        <!-- Step 1: Upload -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">1</span>
            Subir archivo CSV
          </h2>
          <div class="flex flex-col gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Nombre del proveedor</label>
              <input type="text" [(ngModel)]="supplierName" placeholder="Ej: TechData, AliExpress, Distribuidor X"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div class="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
              (click)="fileInput.click()" (dragover)="$event.preventDefault()" (drop)="onFileDrop($event)">
              <input #fileInput type="file" accept=".csv,text/csv" class="hidden" (change)="onFileSelected($event)" />
              @if (parsedRows().length === 0) {
                <div class="text-gray-500 dark:text-gray-400">
                  <i class="fas fa-cloud-upload-alt text-4xl mb-3 block"></i>
                  <p class="text-sm">Arrastra tu CSV aquí o haz click para seleccionar</p>
                  <p class="text-xs mt-1 text-gray-400">Formatos soportados: CSV (coma o punto y coma)</p>
                </div>
              } @else {
                <div class="text-green-600 dark:text-green-400">
                  <i class="fas fa-check-circle text-3xl mb-2 block"></i>
                  <p class="text-sm font-medium">{{ fileName }}</p>
                  <p class="text-xs mt-1">{{ parsedRows().length }} filas detectadas, {{ headers().length }} columnas</p>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Step 2: Field Mapping -->
        @if (parsedRows().length > 0) {
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">2</span>
              Mapear columnas
            </h2>
            <p class="text-sm text-gray-500 dark:text-slate-400 mb-4">Selecciona qué columna del CSV corresponde a cada campo del CRM</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              @for (field of mappableFields; track field.key) {
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{{ field.label }}</label>
                  <select [(ngModel)]="mapping[field.key]" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm">
                    <option [ngValue]="undefined">— No importar —</option>
                    @for (h of headers(); track h) {
                      <option [value]="h">{{ h }}</option>
                    }
                  </select>
                </div>
              }
            </div>

            <!-- Pricing margin -->
            <div class="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-50 mb-3">Reglas de precio</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm text-gray-600 dark:text-slate-400 mb-1">Margen (%)</label>
                  <input type="number" [(ngModel)]="marginPercent" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm" placeholder="0" />
                  <p class="text-xs text-gray-400 mt-1">Precio final = coste × (1 + margen/100)</p>
                </div>
                <div>
                  <label class="block text-sm text-gray-600 dark:text-slate-400 mb-1">Redondeo</label>
                  <select [(ngModel)]="rounding" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm">
                    <option value="round">Redondear (2 decimales)</option>
                    <option value="ceil">Redondear arriba</option>
                    <option value="floor">Redondear abajo</option>
                    <option value="none">Sin redondeo</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: Preview -->
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">3</span>
              Vista previa <span class="text-sm font-normal text-gray-500">({{ mappedDrafts().length }} productos)</span>
            </h2>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead>
                  <tr class="text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    <th class="pb-2 pr-3"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll($event)" class="rounded" /></th>
                    <th class="pb-2 pr-3">Nombre</th>
                    <th class="pb-2 pr-3">Marca</th>
                    <th class="pb-2 pr-3">Categoría</th>
                    <th class="pb-2 pr-3">Modelo</th>
                    <th class="pb-2 pr-3 text-right">Coste</th>
                    <th class="pb-2 pr-3 text-right">Precio final</th>
                    <th class="pb-2 pr-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                  @for (draft of mappedDrafts(); track $index) {
                    <tr class="text-sm text-gray-900 dark:text-slate-100">
                      <td class="py-2 pr-3"><input type="checkbox" [checked]="selectedIds().has($index)" (change)="toggleRow($index)" class="rounded" /></td>
                      <td class="py-2 pr-3 truncate max-w-xs">{{ draft.name }}</td>
                      <td class="py-2 pr-3">{{ draft.brand || '-' }}</td>
                      <td class="py-2 pr-3">{{ draft.category || '-' }}</td>
                      <td class="py-2 pr-3">{{ draft.model || '-' }}</td>
                      <td class="py-2 pr-3 text-right">{{ draft.supplier_price | number:'1.2-2' }} €</td>
                      <td class="py-2 pr-3 text-right font-medium text-blue-600 dark:text-blue-400">{{ computeFinalPrice(draft.supplier_price) | number:'1.2-2' }} €</td>
                      <td class="py-2 pr-3 text-right">{{ draft.stock_quantity }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Step 4: Import -->
          <div class="flex justify-end gap-3">
            <button type="button" (click)="goBack()" class="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg transition-colors">
              Cancelar
            </button>
            <button type="button" (click)="doImport()" [disabled]="isImporting() || selectedIds().size === 0 || !supplierName.trim()"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              @if (isImporting()) {
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Importando...
              } @else {
                <i class="fas fa-download"></i>
                Importar {{ selectedIds().size }} productos
              }
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .hidden { display: none; }
  `],
})
export class SupplierImportComponent {
  private importService = inject(SupplierImportService);
  private toastService = inject(ToastService);

  // Step 1: Upload
  supplierName = '';
  fileName = '';
  rawText = '';
  headers = signal<string[]>([]);
  parsedRows = signal<ParsedCSVRow[]>([]);

  // Step 2: Mapping
  mapping: FieldMapping = {};
  marginPercent = 0;
  rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round';

  mappableFields = [
    { key: 'name' as keyof FieldMapping, label: 'Nombre *' },
    { key: 'sku' as keyof FieldMapping, label: 'SKU / Referencia' },
    { key: 'description' as keyof FieldMapping, label: 'Descripción' },
    { key: 'brand' as keyof FieldMapping, label: 'Marca' },
    { key: 'category' as keyof FieldMapping, label: 'Categoría' },
    { key: 'model' as keyof FieldMapping, label: 'Modelo' },
    { key: 'price' as keyof FieldMapping, label: 'Precio / Coste' },
    { key: 'stock' as keyof FieldMapping, label: 'Stock' },
  ];

  // Step 3: Preview + selection
  selectedIds = signal<Set<number>>(new Set());
  isImporting = signal(false);

  mappedDrafts = computed<SupplierProductDraft[]>(() => {
    if (this.parsedRows().length === 0) return [];
    return this.importService.mapRowsToDrafts(this.parsedRows(), this.mapping);
  });

  allSelected = computed(() => {
    const total = this.mappedDrafts().length;
    return total > 0 && this.selectedIds().size === total;
  });

  // ─── File handling ──────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) this.readCSV(input.files[0]);
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.readCSV(file);
  }

  private readCSV(file: File): void {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.toastService.error('Error', 'El archivo debe ser CSV');
      return;
    }
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      this.rawText = text;
      // Auto-detect delimiter
      const delimiter = text.includes(';') && !text.includes(',') ? ';' : ',';
      const { headers, rows } = this.importService.parseCSV(text, delimiter);
      this.headers.set(headers);
      this.parsedRows.set(rows);
      // Auto-map common field names
      this.autoMap(headers);
      // Select all by default
      this.selectedIds.set(new Set(rows.map((_, i) => i)));
    };
    reader.readAsText(file, 'UTF-8');
  }

  private autoMap(headers: string[]): void {
    const lower = headers.map((h) => h.toLowerCase().trim());
    const find = (...candidates: string[]): string | undefined =>
      headers[lower.findIndex((h) => candidates.some((c) => h.includes(c)))];

    this.mapping.name = find('name', 'nombre', 'product', 'producto', 'descripcion');
    this.mapping.sku = find('sku', 'reference', 'referencia', 'codigo', 'code', 'id');
    this.mapping.description = find('description', 'descripcion', 'detalle', 'detail');
    this.mapping.brand = find('brand', 'marca', 'fabricante', 'manufacturer');
    this.mapping.category = find('category', 'categoria', 'tipo', 'type');
    this.mapping.model = find('model', 'modelo');
    this.mapping.price = find('price', 'precio', 'cost', 'coste', 'pvp', 'retail');
    this.mapping.stock = find('stock', 'quantity', 'cantidad', 'qty', 'available');
  }

  // ─── Selection ───────────────────────────────────────────────────────

  toggleRow(index: number): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedIds.set(new Set(this.mappedDrafts().map((_, i) => i)));
    } else {
      this.selectedIds.set(new Set());
    }
  }

  // ─── Pricing ─────────────────────────────────────────────────────────

  computeFinalPrice(cost: number): number {
    return this.importService.applyMargin(cost, this.marginPercent, this.rounding);
  }

  // ─── Import ──────────────────────────────────────────────────────────

  async doImport(): Promise<void> {
    if (!this.supplierName.trim()) {
      this.toastService.error('Error', 'Pon un nombre al proveedor');
      return;
    }
    if (this.selectedIds().size === 0) {
      this.toastService.error('Error', 'Selecciona al menos un producto');
      return;
    }

    this.isImporting.set(true);
    try {
      const drafts = this.mappedDrafts();
      const selected = drafts.filter((_, i) => this.selectedIds().has(i));

      // 1. Create supplier + cache products
      const supplierId = await this.importService.createSupplierAndCache(this.supplierName.trim(), selected);

      // 2. Import to products table with pricing
      // Fetch the cache IDs we just created
      const cacheProducts = await this.importService.getCacheProducts(supplierId).toPromise();
      const cacheIds = (cacheProducts || []).map((p: any) => p.id);

      const result = await this.importService.importToProducts(cacheIds, this.marginPercent, this.rounding);

      this.toastService.success(
        'Importación completa',
        `${result.imported} productos importados${result.errors > 0 ? `, ${result.errors} errores` : ''}`,
      );

      // Reset and go back
      this.goBack();
    } catch (error: any) {
      console.error('Import error:', error);
      this.toastService.error('Error', error?.message || 'No se pudo completar la importación');
    } finally {
      this.isImporting.set(false);
    }
  }

  goBack(): void {
    history.back();
  }
}