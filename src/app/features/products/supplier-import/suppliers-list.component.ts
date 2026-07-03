import { Component, ChangeDetectionStrategy, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupplierImportService } from '../../../services/supplier-import.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';

@Component({
  selector: 'app-suppliers-list',
  standalone: true,
  imports: [CommonModule, ConfirmModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div class="mx-auto max-w-5xl">
        <!-- Header -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-slate-50">Proveedores Conectados</h1>
              <p class="text-gray-600 dark:text-slate-400 mt-1">Gestiona tus APIs y catálogos CSV</p>
            </div>
            <div class="flex gap-2">
              <button type="button" (click)="goToImport()"
                class="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2">
                <i class="fas fa-file-import"></i> Importar CSV
              </button>
              <button type="button" (click)="goToApi()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <i class="fas fa-plus"></i> Conectar API
              </button>
            </div>
          </div>
        </div>

        <!-- Loading -->
        @if (isLoading()) {
          <div class="flex justify-center items-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        }

        <!-- Empty state -->
        @if (!isLoading() && suppliers().length === 0) {
          <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-12 text-center border border-gray-200 dark:border-slate-700">
            <div class="w-20 h-20 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-truck text-3xl text-gray-400"></i>
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-slate-50 mb-2">No tienes proveedores configurados</h3>
            <p class="text-gray-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
              Conecta una API REST o sube un CSV para empezar a importar productos automáticamente.
            </p>
            <div class="flex justify-center gap-3">
              <button type="button" (click)="goToImport()"
                class="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg font-medium">
                <i class="fas fa-file-import mr-2"></i> Subir CSV
              </button>
              <button type="button" (click)="goToApi()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                <i class="fas fa-plug mr-2"></i> Conectar API
              </button>
            </div>
          </div>
        }

        <!-- List -->
        @if (!isLoading() && suppliers().length > 0) {
          <div class="space-y-3">
            @for (supplier of suppliers(); track supplier.id) {
              <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 border border-gray-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      [class]="supplier.adapter_type === 'rest_api' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'">
                      <i [class]="supplier.adapter_type === 'rest_api' ? 'fas fa-plug text-blue-600 dark:text-blue-400' : 'fas fa-file-csv text-green-600 dark:text-green-400'"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="font-semibold text-gray-900 dark:text-slate-50 truncate">{{ supplier.name }}</h3>
                      <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        <span class="uppercase">{{ supplier.adapter_type }}</span>
                        @if (supplier.base_url) {
                          <span class="truncate font-mono">{{ supplier.base_url }}</span>
                        }
                      </div>
                      <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                        <span>
                          <i class="far fa-clock mr-1"></i>
                          Actualizado: {{ formatDate(supplier.updated_at) }}
                        </span>
                        <span class="flex items-center gap-1">
                          <i class="fas fa-box mr-1"></i>
                          {{ cacheCountBySupplier()[supplier.id] || 0 }} en cache
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0 ml-3">
                    @if (syncingId() === supplier.id) {
                      <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm px-3">
                        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        Sincronizando...
                      </div>
                    } @else if (supplier.adapter_type === 'rest_api') {
                      <button type="button" (click)="syncSupplier(supplier)" [disabled]="!!syncingId()"
                        class="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1">
                        <i class="fas fa-sync-alt"></i> Sincronizar
                      </button>
                    }
                    <button type="button" (click)="viewCache(supplier)"
                      class="px-3 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded text-sm font-medium transition-colors flex items-center gap-1">
                      <i class="fas fa-eye"></i> Ver cache
                    </button>
                    <button type="button" (click)="confirmDelete(supplier)"
                      class="px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 rounded text-sm font-medium transition-colors flex items-center gap-1">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <app-confirm-modal></app-confirm-modal>
  `,
  styles: [`:host { display: block; }`],
})
export class SuppliersListComponent {
  private importService = inject(SupplierImportService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  @ViewChild(ConfirmModalComponent) confirmModal!: ConfirmModalComponent;

  suppliers = signal<any[]>([]);
  cacheCountBySupplier = signal<Record<string, number>>({});
  isLoading = signal(true);
  syncingId = signal<string | null>(null);

  constructor() {
    this.loadSuppliers();
  }

  async loadSuppliers(): Promise<void> {
    this.isLoading.set(true);
    try {
      const suppliers = await this.importService.getSuppliers().toPromise();
      this.suppliers.set(suppliers || []);

      const counts: Record<string, number> = {};
      for (const s of (suppliers || [])) {
        const cache = await this.importService.getCacheProducts(s.id).toPromise();
        counts[s.id] = (cache || []).length;
      }
      this.cacheCountBySupplier.set(counts);
    } catch (error: any) {
      this.toastService.error('Error', 'No se pudieron cargar los proveedores');
    } finally {
      this.isLoading.set(false);
    }
  }

  async syncSupplier(supplier: any): Promise<void> {
    if (this.syncingId()) return;
    this.syncingId.set(supplier.id);
    try {
      const result = await this.importService.syncFromApi(supplier.id);
      this.toastService.success(
        'Sincronización completa',
        `${result.fetched} productos obtenidos, ${result.cached} cacheados`,
      );
      const cache = await this.importService.getCacheProducts(supplier.id).toPromise();
      this.cacheCountBySupplier.update((counts) => ({
        ...counts,
        [supplier.id]: (cache || []).length,
      }));
    } catch (error: any) {
      this.toastService.error('Error', error?.message || 'No se pudo sincronizar');
    } finally {
      this.syncingId.set(null);
    }
  }

  async confirmDelete(supplier: any): Promise<void> {
    const confirmed = await this.confirmModal.open({
      title: '¿Eliminar proveedor?',
      message: `Se eliminará "${supplier.name}" y todos sus productos en cache. Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      icon: 'fa-trash',
      iconColor: 'red',
    });
    if (!confirmed) return;

    try {
      const client = (this.importService as any).supabase.getClient();
      await client.from('supplier_products_cache').delete().eq('supplier_id', supplier.id);
      await client.from('supplier_field_mappings').delete().eq('supplier_id', supplier.id);
      const { error } = await client.from('suppliers').delete().eq('id', supplier.id);
      if (error) throw error;

      this.toastService.success('Eliminado', `Proveedor "${supplier.name}" eliminado`);
      this.suppliers.update((list) => list.filter((s) => s.id !== supplier.id));
    } catch (error: any) {
      this.toastService.error('Error', error?.message || 'No se pudo eliminar');
    }
  }

  viewCache(supplier: any): void {
    this.router.navigate(['/productos/cache'], { queryParams: { supplier: supplier.id } });
  }

  goToImport(): void {
    this.router.navigate(['/productos/importar']);
  }

  goToApi(): void {
    this.router.navigate(['/productos/conectar-api']);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return '—';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}