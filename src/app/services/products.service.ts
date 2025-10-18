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
    const companyId = this.auth.userProfile?.company_id || this.supabase.currentCompanyId || null;

    let query: any = client
      .from('products')
      .select('*')
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
    const companyId = this.auth.userProfile?.company_id || this.supabase.currentCompanyId || null;
    if (!this.isValidUuid(companyId)) throw new Error('No company_id available');

    const payload: any = {
      name: product.name?.trim() || 'Producto',
      description: product.description ?? null,
      category: product.category ?? null,
      brand: product.brand ?? null,
      model: product.model ?? null,
      price: typeof product.price === 'number' ? product.price : Number(product.price || 0),
      stock_quantity: Number(product.stock_quantity || 0),
      company_id: companyId
    };

    const { data, error } = await client
      .from('products')
      .insert(payload)
      .select('*')
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

    const { data, error } = await client
      .from('products')
      .update(payload)
      .eq('id', productId)
      .select('*')
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

  private normalizeProduct = (row: any): Product => ({
    id: row.id,
    name: row.name,
    category: row.category ?? null,
    brand: row.brand ?? null,
    model: row.model ?? null,
    description: row.description ?? null,
    price: typeof row.price === 'number' ? row.price : Number(row.price || 0),
    stock_quantity: Number(row.stock_quantity || 0),
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    deleted_at: row.deleted_at ?? null,
    company_id: row.company_id
  });
}
