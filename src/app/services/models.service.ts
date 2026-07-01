import { Injectable } from '@angular/core';
import { Model } from '../models/model';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class ModelsService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List product models for a given business/company.
   * `negocioId` (legacy `negocio_id`) maps to `product_models.company_id`;
   * `marcaId` (legacy `marca_id`) maps to `product_models.brand_id`. If the
   * supplied ids are not valid UUIDs we skip the corresponding filter
   * instead of issuing a broken query.
   */
  getModels(negocioId: string, marcaId?: string): Observable<Model[]> {
    if (!this.isUuid(negocioId)) {
      return of([]);
    }
    const baseQuery = this.sbClient.instance
      .from('product_models')
      .select('*')
      .eq('company_id', negocioId)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    const filtered = this.isUuid(marcaId) ? baseQuery.eq('brand_id', marcaId) : baseQuery;

    return from(filtered).pipe(
      map((result: { data: any; error: any }) => {
        const { data, error } = result;
        if (error) {
          console.error('[ModelsService] supabase error:', error);
          return [];
        }
        return (data || []).map((row: any) => this.rowToModel(row, negocioId, marcaId));
      }),
      catchError((err) => {
        console.error('[ModelsService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Insert a new product model row.
   */
  createModel(model: Model): Observable<Model> {
    const payload = this.modelToRow(model);
    const query = this.sbClient.instance
      .from('product_models')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[ModelsService] createModel supabase error:', error);
          throw error;
        }
        return this.rowToModel(data, model?.negocio_id, model?.marca_id);
      }),
      catchError((err) => {
        console.error('[ModelsService] createModel supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Soft-delete a product model.
   */
  deleteModel(modelId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('product_models')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', modelId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[ModelsService] deleteModel supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[ModelsService] deleteModel supabase threw:', err);
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

  private rowToModel(row: any, negocioId?: string, marcaId?: string): Model {
    return {
      _id: row.id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      nombre: row.name,
      marca_id: row.brand_id ?? marcaId ?? '',
      negocio_id: row.company_id ?? negocioId ?? '',
    } as Model;
  }

  private modelToRow(model: Partial<Model>): any {
    const row: any = {};
    if (model.nombre) row.name = model.nombre;
    if (model.negocio_id && this.isUuid(model.negocio_id)) {
      row.company_id = model.negocio_id;
    }
    if (model.marca_id && this.isUuid(model.marca_id)) {
      row.brand_id = model.marca_id;
    }
    return row;
  }
}
