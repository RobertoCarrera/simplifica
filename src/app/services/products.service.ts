import { Injectable, inject } from '@angular/core';
import { Product } from '../models/product';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SimpleSupabaseService } from './simple-supabase.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ProductsService {
  private supabase = inject(SimpleSupabaseService);
  private auth = inject(AuthService);

  // Simple UUID validator
  private isValidUuid(id?: string | null): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  // List products for current user's company (soft-deleted filtered out)
  getProducts(): Observable<Product[]> {
    return from(this.fetchProducts()).pipe(
      map((rows) => rows.map(this.normalizeProduct))
    );
  }

  private async fetchProducts(): Promise<any[]> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId || null;

    let query: any = client
      .from('products')
      .select('*, product_categories(name), product_brands(name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (this.isValidUuid(companyId)) {
      query = query.eq('company_id', companyId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Error fetching products:', error);
      return [];
    }
    return data || [];
  }

  // Create product scoped to current user's company
  createProduct(product: Partial<Product>): Observable<Product> {
    return from(this.insertProduct(product)).pipe(map(this.normalizeProduct));
  }

  private async insertProduct(product: Partial<Product>): Promise<any> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId || null;
    if (!this.isValidUuid(companyId)) throw new Error('No company_id available');

    const payload: any = {
      name: product.name?.trim() || 'Producto',
      description: product.description ?? null,
      category_id: product.category_id ?? null,
      brand_id: product.brand_id ?? null,
      catalog_product_id: (product as any).catalog_product_id ?? null,
      price: typeof product.price === 'number' ? product.price : Number(product.price || 0),
      stock_quantity: Number(product.stock_quantity || 0),
      company_id: companyId
    };

    const { data, error } = await client
      .from('products')
      .insert(payload)
      .select('*, product_categories(name), product_brands(name)')
      .single();

    if (error) throw error;
    return data;
  }

  // Update product by id (only own company via RLS)
  updateProduct(productId: string, updateData: Partial<Product>): Observable<Product> {
    return from(this.patchProduct(productId, updateData)).pipe(map(this.normalizeProduct));
  }

  private async patchProduct(productId: string, updateData: Partial<Product>): Promise<any> {
    const client = this.supabase.getClient();
    const payload: any = { ...updateData };
    if (payload.price !== undefined) payload.price = Number(payload.price || 0);
    if (payload.stock_quantity !== undefined) payload.stock_quantity = Number(payload.stock_quantity || 0);

    // Remove legacy text fields and join fields
    delete payload.category;
    delete payload.brand;
    delete payload.brand_name;
    delete payload.category_name;
    delete payload.product_categories;
    delete payload.product_brands;

    const { data, error } = await client
      .from('products')
      .update(payload)
      .eq('id', productId)
      .select('*, product_categories(name), product_brands(name)')
      .single();

    if (error) throw error;
    return data;
  }

  // Soft delete product
  deleteProduct(productId: string): Observable<void> {
    return from(this.softDelete(productId)).pipe(map(() => void 0));
  }

  private async softDelete(productId: string): Promise<void> {
    const client = this.supabase.getClient();
    const { error } = await client
      .from('products')
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq('id', productId);
    if (error) throw error;
  }

  // --- CATALOG METHODS ---

  // Search Global Catalog
  async searchCatalog(query: string): Promise<any[]> {
    const client = this.supabase.getClient();
    if (!query.trim()) return [];

    // Try AI Semantic Search first
    try {
      const { data: embeddingData, error: embedError } = await client.functions.invoke('generate-embedding', {
        body: { input: query }
      });

      if (!embedError && embeddingData?.embedding) {
        const { data: searchResults, error: searchError } = await client.rpc('match_product_catalog', {
          query_embedding: embeddingData.embedding, // Supabase handles vector string/array conversion
          match_threshold: 0.1, // Adjusted threshold
          match_count: 20
        });

        if (!searchError && searchResults && searchResults.length > 0) {
          return searchResults;
        }
      } else {
        console.warn('Embedding generation failed:', embedError);
      }
    } catch (e) {
      console.warn('AI search error, falling back to basic search:', e);
    }

    // Fallback to basic text search
    const { data, error } = await client
      .from('product_catalog')
      .select('*')
      .or(`name.ilike.%${query}%,brand.ilike.%${query}%,model.ilike.%${query}%`)
      .limit(20);

    if (error) {
      console.error('Error searching catalog:', error);
      return [];
    }
    return data || [];
  }

  // Create a new Catalog Item (Private to company by default)
  // Create a new Catalog Item (Private to company by default)
  async createCatalogItem(item: any): Promise<any> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;

    let embedding = null;
    try {
      const textToEmbed = `${item.brand || ''} ${item.model || ''} ${item.name} ${JSON.stringify(item.specs || '')}`;
      const { data: embeddingData } = await client.functions.invoke('generate-embedding', {
        body: { input: textToEmbed }
      });
      if (embeddingData?.embedding) {
        embedding = embeddingData.embedding;
      }
    } catch (e) {
      console.warn('Embedding generation failed for new catalog item', e);
    }

    const payload = {
      ...item,
      company_id: companyId,
      embedding: embedding
    };

    const { data, error } = await client
      .from('product_catalog')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // --- SUPPLIER METHODS ---

  async getSuppliers(): Promise<any[]> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;
    if (!companyId) return [];

    const { data, error } = await client
      .from('suppliers')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async createSupplier(supplier: any): Promise<any> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;
    if (!companyId) throw new Error('Company ID is required to create a supplier');

    const { data, error } = await client
      .from('suppliers')
      .insert({ ...supplier, company_id: companyId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateSupplier(id: string, supplier: any): Promise<any> {
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('suppliers')
      .update(supplier)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteSupplier(id: string): Promise<void> {
    const client = this.supabase.getClient();
    const { error } = await client
      .from('suppliers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // Link a supplier to a catalog product with price
  async addSupplierProduct(supplierProduct: any): Promise<any> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;

    const { data, error } = await client
      .from('supplier_products')
      .insert({ ...supplierProduct, company_id: companyId })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getSupplierProducts(catalogProductId: string): Promise<any[]> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;
    if (!companyId) return [];

    const { data, error } = await client
      .from('supplier_products')
      .select('*, suppliers(name)')
      .eq('company_id', companyId)
      .eq('catalog_product_id', catalogProductId)
      .order('price', { ascending: true }); // Best price first

    if (error) throw error;
    return data || [];
  }

  async deleteSupplierProduct(id: string): Promise<void> {
    const client = this.supabase.getClient();
    const { error } = await client
      .from('supplier_products')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // --- STOCK TRACEABILITY ---

  /**
   * Updates stock quantity AND records the movement in `stock_movements`.
   * @param productId Internal Product ID
   * @param quantityChange Positive for addition, negative for subtraction
   * @param type Reason for movement
   * @param notes Optional notes
   */
  async updateStock(productId: string, quantityChange: number, type: 'purchase' | 'sale' | 'adjustment' | 'return' | 'initial', notes?: string, referenceId?: string): Promise<void> {
    const client = this.supabase.getClient();

    // FIX: The schema for `stock_movements` defines user_id as FK to `auth.users(id)`.
    // Therefore, we MUST use the Auth ID, NOT the internal users.id.
    const authUser = await this.auth.getUser();
    if (!authUser?.id) throw new Error('No authenticated user found for stock update.');

    const userId = authUser.id; // Use Supabase Auth ID directly
    console.log('✅ Resolved Auth User ID for stock_movements:', userId);

    if (!userId) {
      console.error('❌ Could not resolve internal user ID for stock movement.');
      throw new Error('User not identified for stock tracking.');
    }
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;

    // 1. Get current stock to be safe? Or just increment.
    // Let's use an RPC for atomicity if possible, but for now client-side transaction logic.
    // Since Supabase-js doesn't support complex transactions easily without RPC, we'll do:
    // Insert Movement -> Update Product. 
    // Worst case: Mismatch. Real solution: RPC.

    // For now, simple calls.

    // A. Record Movement
    const { error: moveError } = await client
      .from('stock_movements')
      .insert({
        company_id: companyId,
        product_id: productId,
        quantity_change: quantityChange,
        movement_type: type,
        user_id: userId,
        notes: notes,
        reference_id: referenceId
      });

    if (moveError) throw moveError;

    // B. Update Product Stock (using RPC increment equivalent or direct update)
    // We can use a Postgres function `increment` if we had one, but let's read-modify-write for now or simply trust the diff.
    // Actually, `stock_quantity = stock_quantity + X` is unsuported in JS client directly without RPC.

    // Let's fetch current just to be safe-ish.
    const { data: product } = await client.from('products').select('stock_quantity').eq('id', productId).single();
    const newStock = (product?.stock_quantity || 0) + quantityChange;

    const { error: updateError } = await client
      .from('products')
      .update({ stock_quantity: newStock } as any)
      .eq('id', productId);

    if (updateError) throw updateError;
  }

  async getStockMovements(productId: string): Promise<any[]> {
    const client = this.supabase.getClient();
    const companyId = this.auth.companyId() || this.supabase.currentCompanyId;

    // We might need to join with users table to get the user who performed the action if possible, 
    // but auth.users is protected. 
    // Usually we store user_id. We can try to join with public.users profile if we have one.
    // For now simple fetch.

    const { data, error } = await client
      .from('stock_movements')
      .select('*') // If we had a public profile relation: .select('*, users(name)')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  private normalizeProduct = (row: any): Product => ({
    id: row.id,
    name: row.name,
    category: row.product_categories?.name ?? null,
    brand: row.product_brands?.name ?? null,
    category_id: row.category_id ?? null,
    brand_id: row.brand_id ?? null,
    catalog_product_id: row.catalog_product_id ?? null,
    model: row.model ?? null,
    description: row.description ?? null,
    price: typeof row.price === 'number' ? row.price : Number(row.price || 0),
    stock_quantity: Number(row.stock_quantity || 0),
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    deleted_at: row.deleted_at ?? null,
    company_id: row.company_id,
    min_stock_level: row.min_stock_level ?? 5,
    location: row.location ?? null,
    barcode: row.barcode ?? null
  });
}

