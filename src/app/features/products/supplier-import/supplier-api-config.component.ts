import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupplierImportService } from '../../../services/supplier-import.service';
import { ToastService } from '../../../services/toast.service';

interface ApiFieldMapping {
  source_path: string;
  target_field: string;
  transform: string | null;
  is_required: boolean;
}

@Component({
  selector: 'app-supplier-api-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div class="mx-auto max-w-4xl">
        <!-- Header -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-slate-50">Conectar API de Proveedor</h1>
              <p class="text-gray-600 dark:text-slate-400 mt-1">Configura una API REST para sincronizar productos automáticamente</p>
            </div>
            <button type="button" (click)="goBack()" class="text-gray-500 hover:text-gray-700 dark:hover:text-slate-300">
              <i class="fas fa-arrow-left mr-1"></i> Volver
            </button>
          </div>
        </div>

        <!-- Step 1: API Connection -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">1</span>
            Conexión
          </h2>
          <div class="grid grid-cols-1 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nombre del proveedor *</label>
              <input type="text" [(ngModel)]="supplierName" placeholder="Ej: TechData, AliExpress, Distribuidor X"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">URL de la API *</label>
              <input type="url" [(ngModel)]="baseUrl" placeholder="https://api.proveedor.com/v1/products"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
            </div>

            <!-- Auth type -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Autenticación</label>
                <select [(ngModel)]="authType" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm">
                  <option value="none">Sin autenticación</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="api_key_header">API Key (Header)</option>
                  <option value="api_key_query">API Key (Query param)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Token / API Key</label>
                <input type="password" [(ngModel)]="authToken" placeholder="Tu token o clave"
                  [disabled]="authType === 'none'"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm disabled:opacity-50" />
              </div>
            </div>

            @if (authType === 'api_key_header') {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nombre del Header</label>
                <input type="text" [(ngModel)]="authHeaderName" placeholder="X-API-Key"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
              </div>
            }
            @if (authType === 'api_key_query') {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nombre del parámetro</label>
                <input type="text" [(ngModel)]="authQueryParam" placeholder="api_key"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
              </div>
            }

            <!-- Response path -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Ruta al array de productos (JSON path)</label>
              <input type="text" [(ngModel)]="responsePath" placeholder="data.products  |  results  |  items  |  (vacío si la raíz es el array)"
                class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
              <p class="text-xs text-gray-400 mt-1">Dónde está el array de productos en la respuesta JSON. Ej: si la API devuelve <code>{{ '{ data: { products: [...] } }' }}</code>, usa "data.products"</p>
            </div>

            <!-- Pagination -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Paginación</label>
                <select [(ngModel)]="pagination" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm">
                  <option value="none">Sin paginación</option>
                  <option value="page">Por página (page=N)</option>
                  <option value="offset">Offset (offset=N)</option>
                  <option value="cursor">Cursor</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Tamaño de página</label>
                <input type="number" [(ngModel)]="pageSize" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm" [disabled]="pagination === 'none'" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Máx. páginas</label>
                <input type="number" [(ngModel)]="maxPages" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm" [disabled]="pagination === 'none'" />
              </div>
            </div>

            @if (pagination === 'page') {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Param name (página)</label>
                  <input type="text" [(ngModel)]="pageParam" placeholder="page" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Param name (tamaño)</label>
                  <input type="text" [(ngModel)]="pageSizeParam" placeholder="pageSize" class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
                </div>
              </div>
            }
            @if (pagination === 'cursor') {
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Ruta al cursor (JSON path)</label>
                <input type="text" [(ngModel)]="cursorPath" placeholder="meta.next_cursor"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
              </div>
            }

            <!-- Test connection -->
            <div class="flex items-center gap-3 pt-2">
              <button type="button" (click)="testConnection()"
                [disabled]="isTesting() || !baseUrl.trim()"
                class="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                @if (isTesting()) {
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                  Probando...
                } @else {
                  <i class="fas fa-plug"></i> Probar conexión
                }
              </button>
              @if (testResult()) {
                @if (testResult()?.ok) {
                  <span class="text-green-600 dark:text-green-400 text-sm flex items-center gap-1">
                    <i class="fas fa-check-circle"></i> Conexión exitosa
                  </span>
                } @else {
                  <span class="text-red-600 dark:text-red-400 text-sm flex items-center gap-1">
                    <i class="fas fa-times-circle"></i> {{ testResult()?.error }}
                  </span>
                }
              }
            </div>

            <!-- Auto-detect suggestion -->
            @if (testResult()?.ok && testResult()?.sampleData?.length > 0) {
              <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-sm font-medium text-blue-900 dark:text-blue-200">
                    <i class="fas fa-magic mr-1"></i>
                    Detectamos {{ testResult()?.sampleData?.length }} productos de muestra
                  </p>
                  <button type="button" (click)="autoDetectMappings()"
                    [disabled]="isAutoDetecting()"
                    class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                    @if (isAutoDetecting()) {
                      <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                      Detectando...
                    } @else {
                      <i class="fas fa-wand-magic-sparkles"></i>
                      Auto-detectar campos
                    }
                  </button>
                </div>
                <details class="text-xs">
                  <summary class="cursor-pointer text-blue-700 dark:text-blue-300 hover:underline">
                    Ver estructura JSON del primer producto ({{ detectedPaths().length }} paths)
                  </summary>
                  <pre class="mt-2 p-2 bg-white dark:bg-slate-900 rounded text-xs overflow-x-auto font-mono text-gray-700 dark:text-slate-300">{{ jsonPreview() }}</pre>
                </details>
              </div>
            }
          </div>
        </div>

        <!-- Step 2: Field Mapping -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">2</span>
            Mapear campos
          </h2>
          <p class="text-sm text-gray-500 dark:text-slate-400 mb-4">Para cada campo del CRM, indica qué ruta JSON del proveedor contiene ese dato</p>
          <div class="space-y-3">
            @for (field of apiMappings; track field.target_field; let i = $index) {
              <div class="grid grid-cols-12 gap-2 items-center">
                <div class="col-span-3 text-sm font-medium text-gray-700 dark:text-slate-300">
                  {{ fieldLabels[field.target_field] || field.target_field }}
                  @if (field.is_required) { <span class="text-red-500">*</span> }
                </div>
                <input type="text" [(ngModel)]="field.source_path" placeholder="Ej: productName o pricing.retail"
                  class="col-span-5 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm font-mono" />
                <select [(ngModel)]="field.transform" class="col-span-3 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm">
                  <option [ngValue]="null">Sin transformar</option>
                  <option value="number">→ Número</option>
                  <option value="trim">→ Trim</option>
                  <option value="null_if_empty">→ Vacío = null</option>
                </select>
                <button type="button" (click)="removeMapping(i)" class="col-span-1 text-red-500 hover:text-red-700 text-sm">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            }
          </div>
          <button type="button" (click)="addMapping()" class="mt-3 text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm flex items-center gap-1">
            <i class="fas fa-plus"></i> Añadir campo
          </button>
        </div>

        <!-- Step 3: Pricing -->
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mb-6 border border-gray-200 dark:border-slate-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-slate-50 mb-4">
            <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">3</span>
            Reglas de precio
          </h2>
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

        <!-- Actions -->
        <div class="flex justify-end gap-3">
          <button type="button" (click)="goBack()" class="px-4 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg transition-colors">
            Cancelar
          </button>
          <button type="button" (click)="saveAndSync()"
            [disabled]="isSyncing() || !supplierName.trim() || !baseUrl.trim()"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
            @if (isSyncing()) {
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Sincronizando...
            } @else {
              <i class="fas fa-sync-alt"></i>
              Guardar y sincronizar
            }
          </button>
        </div>

        @if (syncResult()) {
          <div class="mt-4 p-4 rounded-lg border" [class]="syncResult()?.success ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'">
            @if (syncResult()?.success) {
              <p class="text-green-700 dark:text-green-300 text-sm">
                <i class="fas fa-check-circle mr-1"></i>
                {{ syncResult()?.fetched }} productos obtenidos, {{ syncResult()?.cached }} cacheados en {{ syncResult()?.pages }} páginas.
              </p>
              <p class="text-green-600 dark:text-green-400 text-xs mt-1">Revisa los productos abajo e impórtalos a tu catálogo.</p>
            } @else {
              <p class="text-red-700 dark:text-red-300 text-sm">
                <i class="fas fa-times-circle mr-1"></i>
                {{ syncResult()?.error }}
              </p>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`],
})
export class SupplierApiConfigComponent {
  private importService = inject(SupplierImportService);
  private toastService = inject(ToastService);

  // Step 1: Connection
  supplierName = '';
  baseUrl = '';
  authType: 'none' | 'bearer' | 'api_key_header' | 'api_key_query' = 'none';
  authToken = '';
  authHeaderName = 'X-API-Key';
  authQueryParam = 'api_key';
  responsePath = '';
  pagination: 'none' | 'page' | 'offset' | 'cursor' = 'none';
  pageSize = 100;
  maxPages = 50;
  pageParam = 'page';
  pageSizeParam = 'pageSize';
  cursorPath = 'meta.next_cursor';

  // Step 2: Field mapping
  apiMappings: ApiFieldMapping[] = [
    { source_path: 'name', target_field: 'name', transform: null, is_required: true },
    { source_path: 'sku', target_field: 'external_id', transform: null, is_required: false },
    { source_path: 'description', target_field: 'description', transform: null, is_required: false },
    { source_path: 'brand', target_field: 'brand', transform: null, is_required: false },
    { source_path: 'category', target_field: 'category', transform: null, is_required: false },
    { source_path: 'model', target_field: 'model', transform: null, is_required: false },
    { source_path: 'price', target_field: 'price', transform: 'number', is_required: false },
    { source_path: 'stock', target_field: 'stock', transform: 'number', is_required: false },
  ];

  fieldLabels: Record<string, string> = {
    name: 'Nombre *', external_id: 'SKU / Ref.', description: 'Descripción',
    brand: 'Marca', category: 'Categoría', model: 'Modelo',
    price: 'Precio / Coste', stock: 'Stock',
  };

  // Step 3: Pricing
  marginPercent = 0;
  rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round';

  // State
  isTesting = signal(false);
  isAutoDetecting = signal(false);
  isSyncing = signal(false);
  testResult = signal<{ ok: boolean; sampleData: any; error?: string } | null>(null);
  detectedPaths = signal<string[]>([]);
  syncResult = signal<{ success: boolean; fetched?: number; cached?: number; pages?: number; error?: string } | null>(null);
  createdSupplierId: string | null = null;

  jsonPreview = computed(() => {
    const sample = this.testResult()?.sampleData?.[0];
    if (!sample) return '';
    return JSON.stringify(sample, null, 2);
  });

  // ─── Field mapping CRUD ──────────────────────────────────────────────

  addMapping(): void {
    this.apiMappings.push({ source_path: '', target_field: '', transform: null, is_required: false });
  }

  removeMapping(index: number): void {
    this.apiMappings.splice(index, 1);
  }

  // ─── Build sync config from form ─────────────────────────────────────

  private buildSyncConfig(): Record<string, any> {
    return {
      response_path: this.responsePath,
      pagination: this.pagination,
      page_param: this.pageParam,
      page_size_param: this.pageSizeParam,
      page_size: this.pageSize,
      max_pages: this.maxPages,
      cursor_path: this.cursorPath,
      auth_type: this.authType,
      auth_token: this.authToken,
      auth_header_name: this.authHeaderName,
      auth_query_param: this.authQueryParam,
    };
  }

  // ─── Test connection ─────────────────────────────────────────────────

  async testConnection(): Promise<void> {
    this.isTesting.set(true);
    this.testResult.set(null);
    try {
      const result = await this.importService.testApiConnection(this.baseUrl, this.buildSyncConfig());
      this.testResult.set(result);
      if (result.ok) {
        this.toastService.success('Conexión OK', 'La API respondió correctamente');
      } else {
        this.toastService.error('Error', result.error || 'No se pudo conectar');
      }
    } catch (error: any) {
      this.testResult.set({ ok: false, sampleData: null, error: error.message });
    } finally {
      this.isTesting.set(false);
    }
  }

  /**
   * Analyze the sample data from testConnection and auto-populate the
   * field mappings using heuristic matching of JSON path names.
   */
  autoDetectMappings(): void {
    const sample = this.testResult()?.sampleData?.[0];
    if (!sample) {
      this.toastService.error('Error', 'Primero prueba la conexión para obtener datos de muestra');
      return;
    }

    this.isAutoDetecting.set(true);
    try {
      const paths = this.importService.extractJsonPaths(sample);
      this.detectedPaths.set(paths);

      const suggestions = this.importService.suggestMappings(paths);

      // Replace existing mappings with suggested ones
      this.apiMappings = Object.entries(suggestions)
        .filter(([_, sourcePath]) => sourcePath != null)
        .map(([targetField, sourcePath]) => {
          // Determine transform based on field type
          let transform: string | null = null;
          if (targetField === 'price' || targetField === 'stock') {
            transform = 'number';
          }
          return {
            source_path: sourcePath!,
            target_field: targetField,
            transform,
            is_required: targetField === 'name',
          };
        });

      const detected = this.apiMappings.length;
      this.toastService.success(
        'Campos detectados',
        `Se mapearon ${detected} campos automáticamente. Revisa y ajusta si hace falta.`,
      );
    } finally {
      this.isAutoDetecting.set(false);
    }
  }

  // ─── Save + sync ─────────────────────────────────────────────────────

  async saveAndSync(): Promise<void> {
    if (!this.supplierName.trim() || !this.baseUrl.trim()) {
      this.toastService.error('Error', 'Nombre y URL son obligatorios');
      return;
    }

    this.isSyncing.set(true);
    this.syncResult.set(null);
    try {
      // 1. Create supplier with API config
      this.createdSupplierId = await this.importService.createApiSupplier(
        this.supplierName.trim(),
        this.baseUrl,
        this.buildSyncConfig(),
        this.apiMappings.filter((m) => m.source_path.trim() && m.target_field.trim()),
      );

      this.toastService.info('Guardado', 'Proveedor configurado. Sincronizando...');

      // 2. Trigger sync
      const result = await this.importService.syncFromApi(this.createdSupplierId);
      this.syncResult.set({ success: true, ...result });
      this.toastService.success(
        'Sincronización completa',
        `${result.fetched} productos obtenidos, ${result.cached} cacheados`,
      );
    } catch (error: any) {
      this.syncResult.set({ success: false, error: error.message });
      this.toastService.error('Error', error.message || 'No se pudo sincronizar');
    } finally {
      this.isSyncing.set(false);
    }
  }

  goBack(): void {
    history.back();
  }
}