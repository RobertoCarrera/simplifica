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
}