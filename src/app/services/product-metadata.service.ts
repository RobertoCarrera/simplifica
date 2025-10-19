import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SimpleSupabaseService } from './simple-supabase.service';

export interface ProductBrand {
  id: string;
  name: string;
  company_id?: string;
  description?: string;
  logo_url?: string;
  website?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  company_id?: string;
  description?: string;
  parent_id?: string;
  icon?: string;
  color?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductMetadataService {
  private supabase = inject(SimpleSupabaseService);

  // =====================================================
  // BRANDS
  // =====================================================

  /**
   * Get all brands accessible to the current user (global + company-specific)
   */
  getBrands(companyId?: string): Observable<ProductBrand[]> {
    return from(
      this.supabase.getClient()
        .from('product_brands')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    ).pipe(
      catchError(error => {
        console.error('Error loading brands:', error);
        return of([]);
      })
    );
  }

  /**
   * Search brands by name
   */
  searchBrands(searchTerm: string, companyId?: string): Observable<ProductBrand[]> {
    return from(
      this.supabase.getClient()
        .from('product_brands')
        .select('*')
        .is('deleted_at', null)
        .ilike('name', `%${searchTerm}%`)
        .order('name', { ascending: true })
        .limit(20)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    ).pipe(
      catchError(error => {
        console.error('Error searching brands:', error);
        return of([]);
      })
    );
  }

  /**
   * Create a new brand (or get existing if name already exists)
   */
  async createBrand(name: string, companyId: string, description?: string): Promise<ProductBrand> {
    try {
      // Try to use the helper function first
      const { data: brandId, error: rpcError } = await this.supabase.getClient()
        .rpc('get_or_create_brand', { 
          p_brand_name: name.trim(), 
          p_company_id: companyId 
        });

      if (!rpcError && brandId) {
        // Fetch the full brand object
        const { data: brand, error: fetchError } = await this.supabase.getClient()
          .from('product_brands')
          .select('*')
          .eq('id', brandId)
          .single();

        if (!fetchError && brand) {
          return brand;
        }
      }

      // Fallback: direct insert
      const { data, error } = await this.supabase.getClient()
        .from('product_brands')
        .insert({
          name: name.trim(),
          company_id: companyId,
          description: description?.trim() || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      // If unique constraint violation, fetch existing
      if (error.code === '23505') {
        const { data, error: fetchError } = await this.supabase.getClient()
          .from('product_brands')
          .select('*')
          .eq('name', name.trim())
          .or(`company_id.eq.${companyId},company_id.is.null`)
          .is('deleted_at', null)
          .single();

        if (!fetchError && data) {
          return data;
        }
      }
      throw error;
    }
  }

  // =====================================================
  // CATEGORIES
  // =====================================================

  /**
   * Get all categories accessible to the current user (global + company-specific)
   */
  getCategories(companyId?: string): Observable<ProductCategory[]> {
    return from(
      this.supabase.getClient()
        .from('product_categories')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    ).pipe(
      catchError(error => {
        console.error('Error loading categories:', error);
        return of([]);
      })
    );
  }

  /**
   * Search categories by name
   */
  searchCategories(searchTerm: string, companyId?: string): Observable<ProductCategory[]> {
    return from(
      this.supabase.getClient()
        .from('product_categories')
        .select('*')
        .is('deleted_at', null)
        .ilike('name', `%${searchTerm}%`)
        .order('name', { ascending: true })
        .limit(20)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    ).pipe(
      catchError(error => {
        console.error('Error searching categories:', error);
        return of([]);
      })
    );
  }

  /**
   * Create a new category (or get existing if name already exists)
   */
  async createCategory(name: string, companyId: string, description?: string, icon?: string, color?: string): Promise<ProductCategory> {
    try {
      // Try to use the helper function first
      const { data: categoryId, error: rpcError } = await this.supabase.getClient()
        .rpc('get_or_create_category', { 
          p_category_name: name.trim(), 
          p_company_id: companyId 
        });

      if (!rpcError && categoryId) {
        // Fetch the full category object
        const { data: category, error: fetchError } = await this.supabase.getClient()
          .from('product_categories')
          .select('*')
          .eq('id', categoryId)
          .single();

        if (!fetchError && category) {
          return category;
        }
      }

      // Fallback: direct insert
      const { data, error } = await this.supabase.getClient()
        .from('product_categories')
        .insert({
          name: name.trim(),
          company_id: companyId,
          description: description?.trim() || null,
          icon: icon || null,
          color: color || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      // If unique constraint violation, fetch existing
      if (error.code === '23505') {
        const { data, error: fetchError } = await this.supabase.getClient()
          .from('product_categories')
          .select('*')
          .eq('name', name.trim())
          .or(`company_id.eq.${companyId},company_id.is.null`)
          .is('deleted_at', null)
          .single();

        if (!fetchError && data) {
          return data;
        }
      }
      throw error;
    }
  }

  /**
   * Get category hierarchy (parent-child relationships)
   */
  getCategoryTree(companyId?: string): Observable<ProductCategory[]> {
    return from(
      this.supabase.getClient()
        .from('product_categories')
        .select('*')
        .is('deleted_at', null)
        .is('parent_id', null) // Root categories only
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    ).pipe(
      catchError(error => {
        console.error('Error loading category tree:', error);
        return of([]);
      })
    );
  }
}
