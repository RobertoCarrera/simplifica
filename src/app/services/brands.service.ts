import { Injectable } from '@angular/core';
import { Brand } from '../models/brand';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class BrandsService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List product brands scoped to the supplied negocio_id (legacy `negocio_id`
   * maps to `product_brands.company_id` on the new schema).
   * If `negocioId` is not a valid UUID we return an empty list rather than
   * running a broken query.
   */
  getBrands(negocioId: string): Observable<Brand[]> {
    if (!this.isUuid(negocioId)) {
      return of([]);
    }
    const query = this.sbClient.instance
      .from('product_brands')
      .select('*')
      .eq('company_id', negocioId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[BrandsService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToBrand(row, negocioId));
      }),
      catchError((err) => {
        console.error('[BrandsService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Create a new brand row. Returns the inserted record mapped back to the
   * legacy `Brand` interface so consumers don't have to learn the new shape.
   */
  createBrand(brand: Brand): Observable<Brand> {
    const payload = this.brandToRow(brand);
    const query = this.sbClient.instance
      .from('product_brands')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[BrandsService] createBrand supabase error:', error);
          throw error;
        }
        return this.rowToBrand(data, brand?.negocio_id);
      }),
      catchError((err) => {
        console.error('[BrandsService] createBrand supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Soft-delete the brand row identified by `brandId` (legacy `marca_id`
   * was the document id from the old API; we use the same value as the
   * primary key in `product_brands`).
   */
  deleteBrand(brandId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('product_brands')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', brandId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[BrandsService] deleteBrand supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[BrandsService] deleteBrand supabase threw:', err);
        throw err;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private isUuid(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private rowToBrand(row: any, negocioId?: string): Brand {
    return {
      _id: row.id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      nombre: row.name,
      negocio_id: row.company_id ?? negocioId ?? '',
      marca_id: row.id,
    } as Brand;
  }

  private brandToRow(brand: Partial<Brand>): any {
    const row: any = {};
    if (brand.nombre) row.name = brand.nombre;
    if (brand.negocio_id && this.isUuid(brand.negocio_id)) {
      row.company_id = brand.negocio_id;
    }
    return row;
  }
}
