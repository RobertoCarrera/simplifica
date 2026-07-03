import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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
  name?: string;
  description?: string;
  brand?: string;
  category?: string;
  model?: string;
  price?: string;
  stock?: string;
  sku?: string;
}

@Injectable({ providedIn: 'root' })
export class SupplierImportService {
  private supabase = inject(SimpleSupabaseService);
  private auth = inject(AuthService);
  private toastService = inject(ToastService);

  // ─── CSV Parsing (no external dependency) ───────────────────────────────

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
        external_id: mapping.sku ? (row[mapping.sku] || '').trim() : '',
        name: mapping.name ? (row[mapping.name] || '').trim() : '',
        description: mapping.description ? (row[mapping.description] || '').trim() || null : null,
        brand: mapping.brand ? (row[mapping.brand] || '').trim() || null : null,
        category: mapping.category ? (row[mapping.category] || '').trim() || null : null,
        model: mapping.model ? (row[mapping.model] || '').trim() || null : null,
        supplier_price: mapping.price ? this.parseNumber(row[mapping.price]) : 0,
        stock_quantity: mapping.stock ? this.parseNumber(row[mapping.stock]) : 0,
        raw_data: { ...row },
      };
      return draft;
    }).filter((d) => d.name.length > 0);
  }

  private parseNumber(value: string): number {
    if (!value) return 0;
    // Handle European format (1.234,56) and US format (1,234.56)
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

  // ─── Create supplier + cache products ────────────────────────────────────

  async createSupplierAndCache(name: string, drafts: SupplierProductDraft[]): Promise<string> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No company_id available');

    const client = this.supabase.getClient();

    // 1. Create supplier
    const { data: supplier, error: supplierError } = await client
      .from('suppliers')
      .insert({
        company_id: companyId,
        name,
        adapter_type: 'csv_upload',
        is_active: true,
      })
      .select('id')
      .single();

    if (supplierError || !supplier) throw supplierError || new Error('Failed to create supplier');

    // 2. Bulk insert cache products (batch of 100)
    const batchSize = 100;
    for (let i = 0; i < drafts.length; i += batchSize) {
      const batch = drafts.slice(i, i + batchSize);
      const cacheRows = batch.map((d) => ({
        supplier_id: supplier.id,
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

    return supplier.id;
  }

  // ─── Import cached products to CRM products table ────────────────────────

  async importToProducts(
    cacheIds: string[],
    marginPercent: number,
    rounding: 'round' | 'ceil' | 'floor' | 'none' = 'round',
  ): Promise<{ imported: number; errors: number }> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No company_id available');

    const client = this.supabase.getClient();

    // Fetch selected cache rows
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

      // Check if product already exists (by external_id / model)
      const { data: existing } = await client
        .from('products')
        .select('id')
        .eq('company_id', companyId)
        .or(`model.eq.${row.model || ''}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing product
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

        // Mark as imported
        await client
          .from('supplier_products_cache')
          .update({ imported_at: new Date().toISOString(), imported_product_id: existing.id })
          .eq('id', row.id);

        imported++;
      } else {
        // Create new product
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

  // ─── Get suppliers for current company ───────────────────────────────────

  getSuppliers(): Observable<any[]> {
    const companyId = this.auth.companyId();
    if (!companyId) return from([[]]);
    return from(
      this.supabase.getClient()
        .from('suppliers')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    );
  }

  // ─── Get cache products for a supplier ───────────────────────────────────

  getCacheProducts(supplierId: string): Observable<any[]> {
    const companyId = this.auth.companyId();
    if (!companyId) return from([[]]);
    return from(
      this.supabase.getClient()
        .from('supplier_products_cache')
        .select('*')
        .eq('supplier_id', supplierId)
        .eq('company_id', companyId)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    );
  }

  // ─── REST API Integration ────────────────────────────────────────────────

  /**
   * Create a supplier with REST API config (not CSV).
   * Saves base_url + sync_config + field_mappings to DB.
   */
  async createApiSupplier(
    name: string,
    baseUrl: string,
    syncConfig: Record<string, any>,
    fieldMappings: { source_path: string; target_field: string; transform?: string | null; is_required?: boolean }[],
  ): Promise<string> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No company_id available');

    const client = this.supabase.getClient();

    // 1. Create supplier with API config
    const { data: supplier, error: supplierError } = await client
      .from('suppliers')
      .insert({
        company_id: companyId,
        name,
        adapter_type: 'rest_api',
        base_url: baseUrl,
        sync_config: syncConfig,
        is_active: true,
      })
      .select('id')
      .single();

    if (supplierError || !supplier) throw supplierError || new Error('Failed to create supplier');

    // 2. Save field mappings
    if (fieldMappings.length > 0) {
      const mappingRows = fieldMappings.map((m) => ({
        supplier_id: supplier.id,
        source_path: m.source_path,
        target_field: m.target_field,
        transform: m.transform || null,
        is_required: m.is_required || false,
      }));

      const { error: mappingError } = await client
        .from('supplier_field_mappings')
        .insert(mappingRows);

      if (mappingError) throw mappingError;
    }

    return supplier.id;
  }

  /**
   * Update an existing supplier's API config + field mappings.
   */
  async updateApiSupplier(
    supplierId: string,
    baseUrl: string,
    syncConfig: Record<string, any>,
    fieldMappings: { source_path: string; target_field: string; transform?: string | null; is_required?: boolean }[],
  ): Promise<void> {
    const client = this.supabase.getClient();

    // Update supplier
    const { error: supplierError } = await client
      .from('suppliers')
      .update({ base_url: baseUrl, sync_config: syncConfig, updated_at: new Date().toISOString() })
      .eq('id', supplierId);

    if (supplierError) throw supplierError;

    // Replace field mappings (delete + insert)
    await client.from('supplier_field_mappings').delete().eq('supplier_id', supplierId);

    if (fieldMappings.length > 0) {
      const mappingRows = fieldMappings.map((m) => ({
        supplier_id: supplierId,
        source_path: m.source_path,
        target_field: m.target_field,
        transform: m.transform || null,
        is_required: m.is_required || false,
      }));

      const { error: mappingError } = await client
        .from('supplier_field_mappings')
        .insert(mappingRows);

      if (mappingError) throw mappingError;
    }
  }

  /**
   * Test API connection — makes a single fetch to verify the URL + auth work.
   * Returns the first page of data so the user can see the structure.
   */
  async testApiConnection(baseUrl: string, syncConfig: Record<string, any>): Promise<{ ok: boolean; sampleData: any; error?: string }> {
    try {
      const cfg = syncConfig as any;
      const authHeaders: Record<string, string> = { ...(cfg.headers || {}), Accept: 'application/json' };
      const authQueryParams: Record<string, string> = {};

      switch (cfg.auth_type) {
        case 'bearer':
          authHeaders['Authorization'] = `Bearer ${cfg.auth_token || ''}`;
          break;
        case 'api_key_header':
          authHeaders[cfg.auth_header_name || 'X-API-Key'] = cfg.auth_token || '';
          break;
        case 'api_key_query':
          authQueryParams[cfg.auth_query_param || 'api_key'] = cfg.auth_token || '';
          break;
      }

      const url = new URL(baseUrl);
      for (const [k, v] of Object.entries(authQueryParams)) {
        url.searchParams.set(k, v);
      }
      // Add first page params for test
      if (cfg.pagination === 'page') {
        url.searchParams.set(cfg.page_param || 'page', '1');
        url.searchParams.set(cfg.page_size_param || 'pageSize', '5');
      } else if (cfg.pagination === 'offset') {
        url.searchParams.set('offset', '0');
        url.searchParams.set('limit', '5');
      }

      const response = await fetch(url.toString(), { method: 'GET', headers: authHeaders });

      if (!response.ok) {
        return { ok: false, sampleData: null, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const json = await response.json();

      // Try to extract products array
      const products = this.resolvePath(json, cfg.response_path || '');
      const sampleArray = Array.isArray(products) ? products.slice(0, 3) : [json];

      return { ok: true, sampleData: sampleArray };
    } catch (error: any) {
      return { ok: false, sampleData: null, error: error.message || 'Connection failed' };
    }
  }

  /**
   * Trigger the supplier-sync Edge Function to fetch all products from the API.
   */
  async syncFromApi(supplierId: string): Promise<{ fetched: number; cached: number; pages: number }> {
    const client = this.supabase.getClient();
    const { data: session } = await client.auth.getSession();
    const accessToken = session.session?.access_token;

    // Get the Supabase project URL from the client instance
    const projectUrl = (this.supabase as any).supabaseUrl || (client as any).supabaseUrl || '';
    if (!projectUrl) throw new Error('Could not determine Supabase project URL');

    const response = await fetch(`${projectUrl}/functions/v1/supplier-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
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

  /**
   * Get field mappings for a supplier.
   */
  getFieldMappings(supplierId: string): Observable<any[]> {
    return from(
      this.supabase.getClient()
        .from('supplier_field_mappings')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('target_field', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    );
  }

  // ─── JSON path resolver (mirrors the Edge Function logic) ────────────────

  private resolvePath(obj: any, path: string): any {
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