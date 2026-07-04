import { Injectable, inject, signal, computed } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SimpleSupabaseService } from './simple-supabase.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

export interface ParsedCSVRow {
  [key: string]: string;
}

export interface SupplierProductDraft {
  external_id: string;
  name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  model: string | null;
  supplier_price: number;
  stock_quantity: number;
  raw_data: Record<string, string>;
}

export interface FieldMapping {
  [key: string]: string | undefined;
}

@Injectable({ providedIn: 'root' })
export class SupplierImportService {
  private supabase = inject(SimpleSupabaseService);
  private auth = inject(AuthService);
  private toastService = inject(ToastService);

  supplierName = '';
  fileName = '';
  rawText = '';
  headers = signal<string[]>([]);
  parsedRows = signal<ParsedCSVRow[]>([]);

  mapping: FieldMapping = {};
  marginPercent = 0;
  rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round';

  selectedIds = signal<Set<number>>(new Set());
  isImporting = signal(false);

  searchTerm = signal('');
  filteredProducts = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.parsedRows();
    return this.parsedRows().filter((p) =>
      p['name']?.toLowerCase().includes(term) ||
      p['description']?.toLowerCase().includes(term) ||
      p['brand']?.toLowerCase().includes(term) ||
      p['category']?.toLowerCase().includes(term) ||
      p['model']?.toLowerCase().includes(term));
  });

  allSelected = computed(() => {
    const total = this.parsedRows().length;
    return total > 0 && this.selectedIds().size === total;
  });

  // ─── All DB operations go through catalog-crud Edge Function ───────────
  // This bypasses the broken PostgREST schema cache
  private projectUrl = '';
  private accessToken = '';

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const client = this.supabase.getClient();
    const { data: session } = await client.auth.getSession();
    this.accessToken = session.session?.access_token || '';
    this.projectUrl = (this.supabase as any).supabaseUrl || (client as any).supabaseUrl || '';
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async callCrud(action: string, options: {
    method?: string;
    body?: any;
    queryParams?: Record<string, string>;
  } = {}): Promise<any> {
    const headers = await this.getAuthHeaders();
    let url = `${this.projectUrl}/functions/v1/catalog-crud/${action}`;
    if (options.queryParams) {
      const qs = new URLSearchParams(options.queryParams).toString();
      if (qs) url += `?${qs}`;
    }
    const fetchOptions: RequestInit = {
      method: options.method || 'POST',
      headers,
    };
    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, fetchOptions);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  // ─── CSV Parsing ──────────────────────────────────────────────────────────

  parseCSV(text: string, delimiter = ','): { headers: string[]; rows: ParsedCSVRow[] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = this.splitCSVLine(lines[0], delimiter);
    const rows: ParsedCSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.splitCSVLine(lines[i], delimiter);
      const row: ParsedCSVRow = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || '').trim();
      });
      rows.push(row);
    }

    return { headers, rows };
  }

  private splitCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map((s) => s.trim().replace(/^"|"$/g, ''));
  }

  // ─── Map CSV rows to supplier product drafts ────────────────────────────

  mapRowsToDrafts(rows: ParsedCSVRow[], mapping: FieldMapping): SupplierProductDraft[] {
    return rows.map((row) => {
      const draft: SupplierProductDraft = {
        external_id: (mapping['sku'] && row[mapping['sku']] || '').trim(),
        name: (mapping['name'] && row[mapping['name']] || '').trim(),
        description: (mapping['description'] && row[mapping['description']] || '').trim() || null,
        brand: (mapping['brand'] && row[mapping['brand']] || '').trim() || null,
        category: (mapping['category'] && row[mapping['category']] || '').trim() || null,
        model: (mapping['model'] && row[mapping['model']] || '').trim() || null,
        supplier_price: mapping['price'] ? this.parseNumber(row[mapping['price']]) : 0,
        stock_quantity: mapping['stock'] ? this.parseNumber(row[mapping['stock']]) : 0,
        raw_data: { ...row },
      };
      return draft;
    }).filter((d) => d.name.length > 0);
  }

  private parseNumber(value: string): number {
    if (!value) return 0;
    const cleaned = value.replace(/[^\d,.-]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (cleaned.includes(',') && !cleaned.includes('.')) {
      return parseFloat(cleaned.replace(',', '.')) || 0;
    }
    return parseFloat(cleaned) || 0;
  }

  // ─── Apply pricing margin ────────────────────────────────────────────────

  applyMargin(price: number, marginPercent: number, rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round'): number {
    const withMargin = price * (1 + marginPercent / 100);
    switch (rounding) {
      case 'ceil': return Math.ceil(withMargin * 100) / 100;
      case 'floor': return Math.floor(withMargin * 100) / 100;
      case 'none': return withMargin;
      default: return Math.round(withMargin * 100) / 100;
    }
  }

  // ─── REST API Integration (via catalog-crud EF, NOT PostgREST) ──────────

  async createApiSupplier(
    name: string,
    baseUrl: string,
    syncConfig: Record<string, any>,
    fieldMappings: { source_path: string; target_field: string; transform?: string | null; is_required?: boolean }[],
  ): Promise<string> {
    const result = await this.callCrud('create', {
      method: 'POST',
      body: {
        name,
        adapter_type: 'rest_api',
        base_url: baseUrl,
        sync_config: syncConfig,
      },
    });
    if (result.error) throw new Error(result.error);
    const supplierId = result.data?.id;
    if (!supplierId) throw new Error('No supplier ID returned');

    if (fieldMappings.length > 0) {
      await this.callCrud('save_mapping', {
        method: 'POST',
        queryParams: { supplier_id: supplierId },
        body: { mappings: fieldMappings },
      });
    }
    return supplierId;
  }

  async updateApiSupplier(
    supplierId: string,
    baseUrl: string,
    syncConfig: Record<string, any>,
    fieldMappings: { source_path: string; target_field: string; transform?: string | null; is_required?: boolean }[],
  ): Promise<void> {
    const result = await this.callCrud('update', {
      method: 'POST',
      queryParams: { id: supplierId },
      body: {
        base_url: baseUrl,
        sync_config: syncConfig,
      },
    });
    if (result.error) throw new Error(result.error);

    if (fieldMappings.length > 0) {
      const r = await this.callCrud('save_mapping', {
        method: 'POST',
        queryParams: { supplier_id: supplierId },
        body: { mappings: fieldMappings },
      });
      if (r.error) throw new Error(r.error);
    }
  }

  async testApiConnection(baseUrl: string, syncConfig: Record<string, any>): Promise<{ ok: boolean; sampleData: any; error?: string }> {
    try {
      const result = await this.callCrud('test_connection', {
        method: 'POST',
        body: { base_url: baseUrl, sync_config: syncConfig },
      });
      if (!result.ok) {
        return { ok: false, sampleData: null, error: result.error || 'Connection failed' };
      }
      return { ok: true, sampleData: result.data };
    } catch (error: any) {
      return { ok: false, sampleData: null, error: error.message || 'Connection failed' };
    }
  }

  async syncFromApi(supplierId: string): Promise<{ fetched: number; cached: number; pages: number }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${this.projectUrl}/functions/v1/supplier-sync-v4`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ supplier_id: supplierId }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Sync failed: ${errorBody}`);
    }
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return { fetched: result.fetched, cached: result.cached, pages: result.pages };
  }

  async createSupplierAndCache(name: string, drafts: SupplierProductDraft[]): Promise<string> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No company_id available');

    const createResult = await this.callCrud('create', {
      method: 'POST',
      body: {
        company_id: companyId,
        name,
        adapter_type: 'csv_upload',
        is_active: true,
      },
    });
    if (createResult.error || !createResult.data) {
      throw new Error(createResult.error || 'Failed to create supplier');
    }
    const supplierId = createResult.data.id;

    const client = this.supabase.getClient();
    const batchSize = 100;
    for (let i = 0; i < drafts.length; i += batchSize) {
      const batch = drafts.slice(i, i + batchSize);
      const cacheRows = batch.map((d) => ({
        supplier_id: supplierId,
        company_id: companyId,
        external_id: d.external_id || `row-${i + batch.indexOf(d)}`,
        name: d.name,
        description: d.description,
        brand: d.brand,
        category: d.category,
        model: d.model,
        supplier_price: d.supplier_price,
        stock_quantity: d.stock_quantity,
        raw_data: d.raw_data,
      }));

      const { error: cacheError } = await client
        .from('supplier_products_cache')
        .insert(cacheRows);

      if (cacheError) throw cacheError;
    }

    return supplierId;
  }

  // ─── Import cache products to actual products table ──────────────────

  async importToProducts(
    cacheIds: string[],
    marginPercent: number,
    rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round',
  ): Promise<{ imported: number; errors: number }> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No company_id available');

    const client = this.supabase.getClient();

    const { data: cacheRows, error: fetchError } = await client
      .from('supplier_products_cache')
      .select('*')
      .in('id', cacheIds)
      .eq('company_id', companyId);

    if (fetchError || !cacheRows) throw fetchError || new Error('Failed to fetch cache rows');

    let imported = 0;
    let errors = 0;

    for (const row of cacheRows) {
      const finalPrice = this.applyMargin(row.supplier_price || 0, marginPercent, rounding);

      const { data: existing } = await client
        .from('products')
        .select('id')
        .eq('company_id', companyId)
        .or(`model.eq.${row.model || ''}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await client
          .from('products')
          .update({
            name: row.name,
            description: row.description,
            price: finalPrice,
            stock_quantity: row.stock_quantity,
            model: row.model,
          })
          .eq('id', existing.id);

        if (updateError) { errors++; continue; }

        await client
          .from('supplier_products_cache')
          .update({ imported_at: new Date().toISOString(), imported_product_id: existing.id })
          .eq('id', row.id);

        imported++;
      } else {
        const { data: newProduct, error: insertError } = await client
          .from('products')
          .insert({
            company_id: companyId,
            name: row.name,
            description: row.description,
            price: finalPrice,
            stock_quantity: row.stock_quantity,
            model: row.model,
          })
          .select('id')
          .single();

        if (insertError || !newProduct) { errors++; continue; }

        await client
          .from('supplier_products_cache')
          .update({ imported_at: new Date().toISOString(), imported_product_id: newProduct.id })
          .eq('id', row.id);

        imported++;
      }
    }

    return { imported, errors };
  }

  getSuppliers(): Observable<any[]> {
    const companyId = this.auth.companyId();
    if (!companyId) return from([[]]);
    return from(
      (async () => {
        const result = await this.callCrud('list');
        return result.data || [];
      })()
    );
  }

  getCacheProducts(supplierId: string): Observable<any[]> {
    return from(
      (async () => {
        const result = await this.callCrud('list_cache', {
          method: 'GET',
          queryParams: { supplier_id: supplierId },
        });
        return result.data || [];
      })()
    );
  }

  getFieldMappings(supplierId: string): Observable<any[]> {
    return from(
      (async () => {
        const result = await this.callCrud('get_mapping', {
          method: 'GET',
          queryParams: { supplier_id: supplierId },
        });
        return result.data || [];
      })()
    );
  }

  getSnippets(): Observable<any[]> {
    return from(
      (async () => {
        const result = await this.callCrud('get_snippets', { method: 'GET' });
        return result.data || [];
      })()
    );
  }

  async deleteSupplier(supplierId: string): Promise<void> {
    const result = await this.callCrud('delete', {
      method: 'POST',
      queryParams: { id: supplierId },
    });
    if (result.error) throw new Error(result.error);
  }

  async updateAutoSync(supplierId: string, enabled: boolean, frequency: 'hourly' | 'daily' | 'weekly'): Promise<void> {
    const result = await this.callCrud('update', {
      method: 'POST',
      queryParams: { id: supplierId },
      body: {
        auto_sync_enabled: enabled,
        auto_sync_frequency: frequency,
      },
    });
    if (result.error) throw new Error(result.error);
  }

  // ─── JSON path resolver + auto-detect ────────────────────────────────

  extractJsonPaths(sample: any, maxDepth = 4): string[] {
    const paths = new Set<string>();
    const visit = (obj: any, prefix: string, depth: number) => {
      if (depth > maxDepth || obj == null) return;
      if (Array.isArray(obj)) {
        if (obj.length > 0) visit(obj[0], prefix, depth + 1);
        return;
      }
      if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          const path = prefix ? `${prefix}.${key}` : key;
          paths.add(path);
          visit(obj[key], path, depth + 1);
        }
      }
    };
    visit(sample, '', 0);
    return Array.from(paths).sort();
  }

  suggestMappings(jsonPaths: string[]): { [targetField: string]: string | null } {
    const lower = jsonPaths.map((p) => ({ path: p, lower: p.toLowerCase() }));

    const find = (...candidates: string[]): string | null => {
      for (const c of candidates) {
        const exact = lower.find((p) => p.lower === c);
        if (exact) return exact.path;
      }
      for (const c of candidates) {
        const partial = lower.find((p) => p.lower.endsWith(c) || p.lower.endsWith('.' + c));
        if (partial) return partial.path;
      }
      for (const c of candidates) {
        const contains = lower.find((p) => p.lower.includes(c));
        if (contains) return contains.path;
      }
      return null;
    };

    return {
      name: find('name', 'title', 'productname', 'product_name', 'nombre', 'titulo'),
      external_id: find('sku', 'reference', 'referencia', 'codigo', 'code', 'id'),
      description: find('description', 'descripcion', 'detalle', 'detail'),
      brand: find('brand', 'marca', 'fabricante', 'manufacturer'),
      category: find('category', 'categoria', 'tipo', 'type', 'group'),
      model: find('model', 'modelo'),
      price: find('price', 'cost', 'precio', 'coste', 'pvp', 'retail', 'amount'),
      stock: find('stock', 'quantity', 'qty', 'available', 'inventory', 'cantidad'),
    };
  }

  resolvePath(obj: any, path: string): any {
    if (!path) return obj;
    let current = obj;
    for (const part of path.split('.')) {
      if (current == null) return undefined;
      const match = part.match(/^(\w+)(?:\[(\d+)\])?$/);
      if (match) {
        current = current[match[1]];
        if (match[2] && Array.isArray(current)) {
          current = current[parseInt(match[2], 10)];
        }
      } else {
        current = current[part];
      }
    }
    return current;
  }
}