import { Injectable } from '@angular/core';
import { TicketsStage } from '../models/tickets-stage';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class TicketStagesService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List ticket stages (filtered by `deleted_at IS NULL`).
   * The `ticket_stages` table is the canonical store; legacy `_id` maps
   * to `id`, `nombre` maps to `name`, `posicion` maps to `position`.
   */
  getStages(): Observable<TicketsStage[]> {
    const query = this.sbClient.instance
      .from('ticket_stages')
      .select('*')
      .is('deleted_at', null)
      .order('position', { ascending: true });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TicketStagesService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToStage(row));
      }),
      catchError((err) => {
        console.error('[TicketStagesService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Insert a new ticket stage row.
   */
  createStage(ticketStage: TicketsStage): Observable<TicketsStage> {
    const payload = this.stageToRow(ticketStage);
    const query = this.sbClient.instance
      .from('ticket_stages')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TicketStagesService] createStage supabase error:', error);
          throw error;
        }
        return this.rowToStage(data);
      }),
      catchError((err) => {
        console.error('[TicketStagesService] createStage supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Patch a ticket stage row by id.
   */
  updateStage(stageId: string, updateData: any): Observable<any> {
    const payload = this.stageUpdateToRow(updateData || {});
    const query = this.sbClient.instance
      .from('ticket_stages')
      .update(payload)
      .eq('id', stageId)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TicketStagesService] updateStage supabase error:', error);
          throw error;
        }
        return data;
      }),
      catchError((err) => {
        console.error('[TicketStagesService] updateStage supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Hard-delete a ticket stage row.
   */
  deleteStage(stageId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('ticket_stages')
      .delete()
      .eq('id', stageId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[TicketStagesService] deleteStage supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[TicketStagesService] deleteStage supabase threw:', err);
        throw err;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private rowToStage(row: any): TicketsStage {
    return {
      _id: row.id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      nombre: row.name,
      posicion: row.position,
    } as TicketsStage;
  }

  private stageToRow(stage: Partial<TicketsStage>): any {
    const row: any = {};
    if (stage.nombre) row.name = stage.nombre;
    if (stage.posicion !== undefined) row.position = stage.posicion;
    return row;
  }

  private stageUpdateToRow(update: Record<string, any>): any {
    const allowed: Record<string, string> = {
      nombre: 'name',
      posicion: 'position',
      color: 'color',
    };
    const out: any = {};
    for (const [k, target] of Object.entries(allowed)) {
      if (k in update) out[target] = update[k];
    }
    return out;
  }
}
