import { Injectable } from '@angular/core';
import { Ticket } from '../models/ticket';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class TicketsService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List tickets (filtered by `deleted_at IS NULL`).
   * The `tickets` table is the canonical store; legacy `_id` maps to `id`,
   * `cliente_id` maps to `client_id`, `estado_id` (array) collapses to
   * `stage_id` (single). The other model fields that don't exist on
   * the new schema (`contador`, `comentarios[]`, `cliente`, `estado`,
   * `servicios[]`) are returned as safe defaults so the `Ticket`
   * interface contract stays intact for consumers.
   */
  getTickets(): Observable<Ticket[]> {
    const query = this.sbClient.instance
      .from('tickets')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TicketsService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToTicket(row));
      }),
      catchError((err) => {
        console.error('[TicketsService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Insert a new ticket row. Only fields that exist on the new schema
   * are forwarded; everything else is silently dropped.
   */
  createTicket(ticket: Ticket): Observable<Ticket> {
    const payload = this.ticketToRow(ticket);
    const query = this.sbClient.instance
      .from('tickets')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[TicketsService] createTicket supabase error:', error);
          throw error;
        }
        return this.rowToTicket(data);
      }),
      catchError((err) => {
        console.error('[TicketsService] createTicket supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Hard-delete a ticket row.
   */
  deleteTicket(ticketId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('tickets')
      .delete()
      .eq('id', ticketId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[TicketsService] deleteTicket supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[TicketsService] deleteTicket supabase threw:', err);
        throw err;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private rowToTicket(row: any): Ticket {
    return {
      _id: row.id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      cliente_id: row.client_id || '',
      estado_id: row.stage_id ? [row.stage_id] : [],
      contador: row.ticket_number ?? 0,
      comentarios: [],
      fecha_vencimiento: row.due_date ? new Date(row.due_date) : undefined,
      cliente: undefined as any,
      estado: undefined as any,
      servicios: [],
    } as Ticket;
  }

  private ticketToRow(ticket: Partial<Ticket>): any {
    const row: any = {};
    if (ticket.cliente_id) row.client_id = ticket.cliente_id;
    if (Array.isArray(ticket.estado_id) && ticket.estado_id.length) {
      row.stage_id = ticket.estado_id[0];
    }
    if ((ticket as any).title) row.title = (ticket as any).title;
    if ((ticket as any).description) row.description = (ticket as any).description;
    if ((ticket as any).priority) row.priority = (ticket as any).priority;
    if (ticket.fecha_vencimiento) row.due_date = (ticket.fecha_vencimiento as Date).toISOString();
    return row;
  }
}
