import { Injectable } from '@angular/core';
import { Service } from '../models/service';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class ServicesService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List active services (filtered by `deleted_at IS NULL` and `is_active`).
   * The `services` table is the canonical store; the model fields that
   * don't exist on the new schema (`fecha_vencimiento`, `unidades`,
   * `servicio_id[]`, `producto_id[]`, `ticket_id`, `servicio`,
   * `producto`, `finalizado`) are returned as `undefined` so the
   * `Service` interface contract stays intact for consumers.
   */
  getServices(): Observable<Service[]> {
    const query = this.sbClient.instance
      .from('services')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name', { ascending: true });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[ServicesService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToService(row));
      }),
      catchError((err) => {
        console.error('[ServicesService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Insert a new service row. We only carry over the fields that exist
   * on the new schema; everything else is silently dropped.
   */
  createService(service: Service): Observable<Service> {
    const payload = this.serviceToRow(service);
    const query = this.sbClient.instance
      .from('services')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[ServicesService] createService supabase error:', error);
          throw error;
        }
        return this.rowToService(data);
      }),
      catchError((err) => {
        console.error('[ServicesService] createService supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Hard-delete a service row. The legacy POST `/servicios/:id` DELETE
   * pattern is preserved but translated to a Supabase DELETE.
   */
  deleteService(serviceId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('services')
      .delete()
      .eq('id', serviceId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[ServicesService] deleteService supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[ServicesService] deleteService supabase threw:', err);
        throw err;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private rowToService(row: any): Service {
    return {
      _id: row.id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      fecha_vencimiento: undefined as any,
      unidades: undefined as any,
      servicio_id: undefined as any,
      producto_id: undefined as any,
      ticket_id: '',
      servicio: undefined as any,
      producto: null,
      finalizado: row.is_active === false ? false : true,
    } as Service;
  }

  private serviceToRow(service: Partial<Service>): any {
    const row: any = {};
    if ((service as any).name) row.name = (service as any).name;
    if ((service as any).description) row.description = (service as any).description;
    if ((service as any).base_price !== undefined) row.base_price = (service as any).base_price;
    return row;
  }
}
