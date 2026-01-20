import { Injectable, inject } from '@angular/core';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SimpleSupabaseService } from './simple-supabase.service';
import { AuthService } from './auth.service';

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
  private authService = inject(AuthService);

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


  // =====================================================
  // MODELS
  // =====================================================

  /**
   * Get models for a specific brand
   */
  getModels(brandId: string): Observable<any[]> {
    return from(
      this.supabase.getClient()
        .from('product_models')
        .select('*')
        .eq('brand_id', brandId)
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        })
    ).pipe(
      catchError(error => {
        console.error('Error loading models:', error);
        return of([]);
      })
    );
  }

  /**
   * Create a new model (or get existing if name/brand combo already exists)
   */
  async createModel(name: string, brandId: string, companyId: string): Promise<any> {
    try {
      // Simple check first
      const { data: existing } = await this.supabase.getClient()
        .from('product_models')
        .select('*')
        .eq('company_id', companyId)
        .eq('brand_id', brandId)
        .ilike('name', name.trim())
        .maybeSingle();

      if (existing) return existing;

      const { data, error } = await this.supabase.getClient()
        .from('product_models')
        .insert({
          name: name.trim(),
          brand_id: brandId,
          company_id: companyId
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error createModel:', error);
      throw error;
    }
  }

  /**
   * List all products in the catalog (for initial display)
   */
  async listCatalogProducts(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.getClient()
        .from('product_catalog')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error listing catalog products:', error);
      return [];
    }
  }

  // =====================================================
  // AI SEARCH (Vector Embeddings)
  // =====================================================

  /**
   * Generate an embedding for a text query using the Edge Function
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const { data, error } = await this.supabase.getClient().functions.invoke('generate-embedding', {
        body: { input: text }
      });
      if (error) throw error;
      return data.embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }

  /**
   * Search the global catalog using Vector Search (RPC) with text fallback
   */
  async searchCatalog(query: string): Promise<any[]> {
    if (!query.trim()) return [];

    try {
      // 1. Generate Embedding
      const embedding = await this.generateEmbedding(query);

      // 2. Vector Search via RPC
      if (embedding && embedding.length > 0) {
        const { data: vectorResults, error } = await this.supabase.getClient()
          .rpc('match_product_catalog', {
            query_embedding: embedding,
            match_threshold: 0.5,
            match_count: 10
          });

        if (!error && vectorResults && vectorResults.length > 0) {
          return vectorResults;
        }

        if (error) {
          console.warn('Vector search RPC failed, falling back to text search:', error);
        }
      } else {
        console.warn('Embedding generation returned empty/null, skipping vector search.');
      }

      // 3. Fallback: Text Search
      console.warn('Vector search yielded no results or failed, falling back to text search.');
      const { data: textResults, error: textError } = await this.supabase.getClient()
        .from('product_catalog')
        .select('*')
        .or(`name.ilike.%${query}%, brand.ilike.%${query}%, model.ilike.%${query}%`)
        .limit(10);

      if (textError) throw textError;
      return textResults || [];

    } catch (error) {
      console.error('Error searching catalog:', error);
      return [];
    }
  }

  /**
   * Create a new item in the Catalog (for seeding or admin)
   * Auto-generates embedding. Optionally assigns to a company.
   */
  async createCatalogProduct(product: {
    name: string,
    brand?: string,
    model?: string,
    description?: string,
    ean?: string,
    image_url?: string
  }, companyId?: string | null): Promise<any> {
    try {
      const textToEmbed = `${product.brand || ''} ${product.model || ''} ${product.name} ${product.description || ''}`.trim();
      let embedding: number[] | null = await this.generateEmbedding(textToEmbed);

      if (!embedding || embedding.length === 0) {
        console.warn('Embedding generation failed or returned empty. Saving product without embedding.');
        embedding = null;
      }

      const payload: any = {
        ...product,
        embedding: embedding
      };

      if (companyId) {
        payload.company_id = companyId;
      }

      console.log('Inserting catalog product with payload:', JSON.stringify(payload, null, 2));

      const { data, error } = await this.supabase.getClient()
        .from('product_catalog')
        .insert(payload);

      if (error) {
        console.error('Supabase insert error:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('Insert successful, result:', data);
      return data;
    } catch (error) {
      console.error('Error creating catalog product (caught):', error);
      throw error;
    }
  }

  /**
   * SEEDING: Populate the catalog with initial data for testing AI Search
   */
  async seedCatalog(): Promise<void> {
    const seedData = [
      { name: 'iPhone 15 Pro Max', brand: 'Apple', model: 'A2849', category: 'Smartphones', description: 'Titanium design, A17 Pro chip, 48MP Main camera, USB-C.', ean: '195949042211' },
      { name: 'Samsung Galaxy S24 Ultra', brand: 'Samsung', model: 'SM-S928B', category: 'Smartphones', description: 'AI features, 200MP camera, Titanium frame, S Pen included.', ean: '8806095305141' },
      { name: 'Sony WH-1000XM5', brand: 'Sony', model: 'WH-1000XM5', category: 'Headphones', description: 'Wireless Noise Cancelling Headphones, 30-hour battery.', ean: '4548736132580' },
      { name: 'MacBook Pro 14"', brand: 'Apple', model: 'M3 Pro', category: 'Laptops', description: 'M3 Pro chip, 14-inch Liquid Retina XDR display, 18GB RAM.', ean: '194253000000' },
      { name: 'Dell XPS 13', brand: 'Dell', model: '9315', category: 'Laptops', description: 'Ultra-thin laptop, 13.4-inch FHD+, Intel Core i7 12th Gen.', ean: '884116000000' },
      { name: 'iPad Air 5', brand: 'Apple', model: 'M1', category: 'Tablets', description: 'M1 chip, 10.9-inch Liquid Retina display, 5G capable.', ean: '194252000000' },
      { name: 'Nintendo Switch OLED', brand: 'Nintendo', model: 'HEG-001', category: 'Consoles', description: '7-inch OLED screen, 64GB internal storage.', ean: '045496883386' },
      { name: 'Logitech MX Master 3S', brand: 'Logitech', model: '910-006557', category: 'Accessories', description: 'Performance Wireless Mouse, 8K DPI tracking.', ean: '097855173787' },
      { name: 'Google Pixel 8 Pro', brand: 'Google', model: 'GC3VE', category: 'Smartphones', description: 'Google Tensor G3, Advanced AI, Pro camera system.', ean: '810029930000' },
      { name: 'AirPods Pro (2nd Gen)', brand: 'Apple', model: 'MTJV3', category: 'Headphones', description: 'USB-C charging case, Active Noise Cancellation.', ean: '195949000000' }
    ];

    console.log('Starting Catalog Seeding...');

    // Get current user's company_id
    const profile = await firstValueFrom(this.authService.userProfile$).catch(() => null);
    const companyId = profile?.company_id;

    if (!companyId) {
      console.warn('No company_id found. Seeding might fail due to RLS.');
    } else {
      console.log(`Seeding catalog for company: ${companyId}`);
    }

    let count = 0;
    for (const item of seedData) {
      try {
        const check = await this.searchCatalog(item.name);
        const exists = check.some(p => p.name === item.name || (p.ean && p.ean === item.ean));

        if (!exists) {
          await this.createCatalogProduct(item, companyId);
          console.log(`Created: ${item.name}`);
          count++;
        } else {
          console.log(`Skipped (Exists): ${item.name}`);
        }
      } catch (e) {
        console.error(`Failed to seed ${item.name}`, e);
      }
    }
    console.log(`Seeding complete. Added ${count} new items.`);
  }
}
