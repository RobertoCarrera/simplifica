import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupplierImportService } from '../../../services/supplier-import.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmModalComponent, ConfirmModalOptions } from '../../../shared/ui/confirm-modal/confirm-modal.component';
import { ViewChild } from '@angular/core';

@Component({
  selector: 'app-supplier-cache-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div class="mx-auto max-w-6xl">
        <!-- Header -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between mb-2">
            <div class="min-w-0 flex-1">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-slate-50">Vista Previa del Catálogo</h1>
              @if (supplier()) {
                <p class="text-gray-600 dark:text-slate-400 mt-1">
                  {{ supplier()!.name }}
                  <span class="ml-2 text-xs uppercase font-medium px-2 py-0.5 rounded"
                    [class]="supplier()!.adapter_type === 'rest_api' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'">
                    {{ supplier()!.adapter_type }}
                  </span>
                </p>
              }
            </div>
            <button type="button" (click)="goBack()" class="text-gray-500 hover:text-gray-700 dark:hover:text-slate-300 shrink-0">
              <i class="fas fa-arrow-left mr-1"></i> Volver
            </button>
          </div>

          <!-- Pricing + actions -->
          <div class="flex flex-col md:flex-row md:items-end gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm text-gray-600 dark:text-slate-400 mb-1">Margen (%)</label>
                <input type="number" [(ngModel)]="marginPercent" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm" placeholder="0" />
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
            <div class="flex items-center gap-2">
              <button type="button" (click)="selectAll()" class="px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded text-sm font-medium transition-colors">
                {{ allSelected() ? 'Deseleccionar todo' : 'Seleccionar todo' }}
              </button>
              <button type="button" (click)="doImport()" [disabled]="isImporting() || selectedIds().size === 0"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                @if (isImporting()) {
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Importando...
                } @else {
                  <i class="fas fa-download"></i>
                  Importar {{ selectedIds().size }}
                }
              </button>
            </div>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 mb-4 border border-gray-200 dark:border-slate-700">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <i class="fas fa-search text-gray-400"></i>
            </div>
            <input type="text" [(ngModel)]="searchTerm" placeholder="Filtrar por nombre, marca o categoría..."
              class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm" />
          </div>
          <div class="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-slate-400">
            <span>Total: <strong class="text-gray-900 dark:text-slate-50">{{ cacheProducts().length }}</strong></span>
            <span>Seleccionados: <strong class="text-blue-600 dark:text-blue-400">{{ selectedIds().size }}</strong></span>
            <span>Ya importados: <strong class="text-green-600 dark:text-green-400">{{ importedCount() }}</strong></span>
            @if (conflictCount() > 0) {
              <span class="text-amber-600 dark:text-amber-400">Conflictos: <strong>{{ conflictCount() }}</strong></span>
            }
            <span>Precio total final: <strong class="text-gray-900 dark:text-slate-50">{{ formatPrice(totalFinalPrice()) }}</strong></span>
          </div>
        </div>

        <!-- Products table -->
        @if (isLoading()) {
          <div class="flex justify-center items-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        }

        @if (!isLoading() && filteredProducts().length === 0) {
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-12 text-center border border-gray-200 dark:border-slate-700">
            <i class="fas fa-inbox text-4xl text-gray-300 dark:text-slate-600 mb-4 block"></i>
            <p class="text-gray-600 dark:text-slate-400">
              @if (cacheProducts().length === 0) {
                No hay productos en cache. Vuelve a sincronizar primero.
              } @else {
                Ningún producto coincide con el filtro.
              }
            </p>
          </div>
        }

        @if (!isLoading() && filteredProducts().length > 0) {
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead class="bg-gray-50 dark:bg-slate-900/50">
                  <tr class="text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                    <th class="px-3 py-3 w-10"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll($event)" class="rounded" /></th>
                    <th class="px-3 py-3">Producto</th>
                    <th class="px-3 py-3 hidden md:table-cell">Marca</th>
                    <th class="px-3 py-3 hidden lg:table-cell">Categoría</th>
                    <th class="px-3 py-3 hidden md:table-cell">Modelo</th>
                    <th class="px-3 py-3 text-right">Coste</th>
                    <th class="px-3 py-3 text-right">Precio final</th>
                    <th class="px-3 py-3 text-right">Stock</th>
                    <th class="px-3 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                  @for (product of filteredProducts(); track product.id) {
                    <tr class="text-sm text-gray-900 dark:text-slate-100 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                      [class.opacity-50]="product.imported_at">
                      <td class="px-3 py-3">
                        <input type="checkbox" [checked]="selectedIds().has(product.id)" (change)="toggleRow(product.id)"
                          [disabled]="!!product.imported_at || hasConflict(product.id)"
                          [title]="hasConflict(product.id) ? 'Conflicto: ya existe un producto con este nombre en tu catálogo' : ''"
                          class="rounded" />
                      </td>
                      <td class="px-3 py-3 max-w-xs">
                        <div class="font-medium truncate">{{ product.name || '(sin nombre)' }}</div>
                        @if (product.description) {
                          <div class="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">{{ product.description }}</div>
                        }
                      </td>
                      <td class="px-3 py-3 hidden md:table-cell">{{ product.brand || '-' }}</td>
                      <td class="px-3 py-3 hidden lg:table-cell">{{ product.category || '-' }}</td>
                      <td class="px-3 py-3 hidden md:table-cell font-mono text-xs">{{ product.model || product.external_id || '-' }}</td>
                      <td class="px-3 py-3 text-right">{{ formatPrice(product.supplier_price) }}</td>
                      <td class="px-3 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                        {{ formatPrice(computeFinalPrice(product.supplier_price)) }}
                    </td>
                      <td class="px-3 py-3 text-right">{{ product.stock_quantity || 0 }}</td>
                      <td class="px-3 py-3 text-center">
                        @if (product.imported_at) {
                          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            <i class="fas fa-check-circle"></i> Importado
                          </span>
                        } @else if (hasConflict(product.id)) {
                          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            title="Ya existe un producto con este nombre en tu catálogo. Resuélvelo manualmente.">
                            <i class="fas fa-exclamation-triangle"></i> Conflicto
                          </span>
                        } @else {
                          <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
                            <i class="far fa-clock"></i> Nuevo
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    </div>

    <app-confirm-modal></app-confirm-modal>
  `,
  styles: [`:host { display: block; }`],
})
export class SupplierCachePreviewComponent {
  private importService = inject(SupplierImportService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild(ConfirmModalComponent) confirmModal!: ConfirmModalComponent;

  supplier = signal<any | null>(null);
  cacheProducts = signal<any[]>([]);
  selectedIds = signal<Set<string>>(new Set());
  conflicts = signal<Set<string>>(new Set());
  isLoading = signal(true);
  isImporting = signal(false);

  searchTerm = '';
  marginPercent = 0;
  rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round';

  filteredProducts = computed(() => {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.cacheProducts();
    return this.cacheProducts().filter((p) =>
      p.name?.toLowerCase().includes(term) ||
      p.brand?.toLowerCase().includes(term) ||
      p.category?.toLowerCase().includes(term) ||
      p.model?.toLowerCase().includes(term));
  });

  allSelected = computed(() => {
    const available = this.filteredProducts().filter((p) => !p.imported_at);
    return available.length > 0 && available.every((p) => this.selectedIds().has(p.id));
  });

  importedCount = computed(() => this.cacheProducts().filter((p) => p.imported_at).length);

  conflictCount = computed(() => this.conflicts().size);

  hasConflict(id: string): boolean {
    return this.conflicts().has(id);
  }

  totalFinalPrice = computed(() => {
    return this.filteredProducts()
      .filter((p) => this.selectedIds().has(p.id))
      .reduce((sum, p) => sum + this.computeFinalPrice(p.supplier_price), 0);
  });

  constructor() {
    const supplierId = this.route.snapshot.queryParamMap.get('supplier');
    if (supplierId) {
      this.loadSupplierAndCache(supplierId);
    } else {
      this.isLoading.set(false);
    }
  }

  async loadSupplierAndCache(supplierId: string): Promise<void> {
    this.isLoading.set(true);
    try {
      // Load supplier info
      const suppliers = await this.importService.getSuppliers().toPromise();
      const found = (suppliers || []).find((s: any) => s.id === supplierId);
      this.supplier.set(found || null);

      // Detect conflicts against existing products (by name match)
      let conflictIds = new Set<string>();
      try {
        conflictIds = await this.importService.detectConflicts(supplierId);
      } catch {
        // non-fatal: continue without conflict detection
      }
      this.conflicts.set(conflictIds);

      // Load cache
      const cache = await this.importService.getCacheProducts(supplierId).toPromise();
      this.cacheProducts.set(cache || []);

      // Auto-select all non-imported AND non-conflict rows
      const toSelect = (cache || [])
        .filter((p: any) => !p.imported_at && !conflictIds.has(p.id))
        .map((p: any) => p.id);
      this.selectedIds.set(new Set(toSelect));
    } catch (error: any) {
      this.toastService.error('Error', 'No se pudo cargar el cache');
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleRow(id: string): void {
    if (this.conflicts().has(id)) {
      this.toastService.warning(
        'Conflicto detectado',
        'Ya existe un producto con este nombre en tu catálogo. Resuélvelo antes de importar.',
      );
      return;
    }
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const available = this.filteredProducts().filter((p) => !p.imported_at);
    if (checked) {
      this.selectedIds.update((set) => {
        const next = new Set(set);
        for (const p of available) next.add(p.id);
        return next;
      });
    } else {
      this.selectedIds.update((set) => {
        const next = new Set(set);
        for (const p of available) next.delete(p.id);
        return next;
      });
    }
  }

  selectAll(): void {
    const conflictSet = this.conflicts();
    const available = this.filteredProducts().filter(
      (p) => !p.imported_at && !conflictSet.has(p.id),
    );
    const allSelected = available.length > 0 && available.every((p) => this.selectedIds().has(p.id));
    if (allSelected) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(available.map((p) => p.id)));
    }
  }

  computeFinalPrice(cost: number): number {
    return this.importService.applyMargin(cost, this.marginPercent, this.rounding);
  }

  async doImport(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    const confirmed = await this.confirmModal.open({
      title: `¿Importar ${ids.length} productos?`,
      message: `Se importarán a tu catálogo con el margen del ${this.marginPercent}% aplicado. Los conflictos por nombre se omitirán automáticamente.`,
      confirmText: 'Importar',
      icon: 'fa-download',
      iconColor: 'blue',
    } as ConfirmModalOptions);
    if (!confirmed) return;

    this.isImporting.set(true);
    try {
      const result = await this.importService.importToProducts(
        ids,
        this.marginPercent,
        this.rounding,
        this.conflicts(),
      );

      const parts: string[] = [];
      if (result.imported > 0) parts.push(`${result.imported} importados`);
      if (result.skipped > 0) parts.push(`${result.skipped} omitidos (conflicto)`);
      if (result.errors > 0) parts.push(`${result.errors} con error`);
      const summary = parts.length > 0 ? parts.join(', ') : 'Sin cambios';

      if (result.errors === 0 && result.imported > 0) {
        this.toastService.success('Importación completa', summary);
      } else if (result.imported > 0) {
        this.toastService.warning('Importación parcial', summary);
      } else if (result.skipped > 0) {
        this.toastService.warning(
          'Sin importación',
          `Los ${result.skipped} productos seleccionados tienen conflicto con tu catálogo.`,
        );
      } else {
        this.toastService.error('Sin importación', summary);
      }

      // Reload to update imported_at + conflict map
      const supplierId = this.route.snapshot.queryParamMap.get('supplier');
      if (supplierId) await this.loadSupplierAndCache(supplierId);
    } catch (error: any) {
      this.toastService.error('Error', error?.message || 'No se pudo importar');
    } finally {
      this.isImporting.set(false);
    }
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price ?? 0);
  }

  goBack(): void {
    this.router.navigate(['/productos/proveedores']);
  }
}