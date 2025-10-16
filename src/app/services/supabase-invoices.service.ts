import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, map, catchError, throwError, firstValueFrom } from 'rxjs';
import { 
  Invoice, 
  InvoiceItem, 
  InvoicePayment, 
  InvoiceSeries,
  InvoiceTemplate,
  CreateInvoiceDTO,
  CreateInvoiceItemDTO,
  UpdateInvoiceDTO,
  CreateInvoicePaymentDTO,
  InvoiceFilters,
  InvoiceStats,
  InvoiceStatus
} from '../models/invoice.model';
import { AuthService } from './auth.service';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class SupabaseInvoicesService {
  private authService = inject(AuthService);
  private supabase: SupabaseClient;
  private clientSvc = inject(SupabaseClientService);

  constructor() {
    // Use the shared singleton client to avoid multiple auth storages/locks
    this.supabase = this.clientSvc.instance;
  }

  // =====================================================
  // INVOICE SERIES
  // =====================================================

  /**
   * Obtener todas las series de facturación de la empresa
   */
  getInvoiceSeries(): Observable<InvoiceSeries[]> {
    return from(
      this.supabase
        .from('invoice_series')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('series_code', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceSeries[];
      }),
      catchError(error => {
        console.error('Error al obtener series de facturación:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtener serie por defecto
   */
  getDefaultSeries(): Observable<InvoiceSeries | null> {
    return from(
      this.supabase
        .from('invoice_series')
        .select('*')
        .eq('is_default', true)
        .eq('is_active', true)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceSeries;
      }),
      catchError(error => {
        console.error('Error al obtener serie por defecto:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Crear nueva serie
   */
  createInvoiceSeries(series: Partial<InvoiceSeries>): Observable<InvoiceSeries> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      return throwError(() => new Error('Usuario sin empresa asignada'));
    }

    return from(
      this.supabase
        .from('invoice_series')
        .insert({
          ...series,
          company_id: companyId
        })
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceSeries;
      }),
      catchError(error => {
        console.error('Error al crear serie:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================
  // INVOICES (CRUD)
  // =====================================================

  /**
   * Obtener todas las facturas con filtros
   */
  getInvoices(filters?: InvoiceFilters): Observable<Invoice[]> {
    let query = this.supabase
      .from('invoices')
      .select(`
        *,
        client:clients(*),
        series:invoice_series(*),
        items:invoice_items(*),
        payments:invoice_payments(*)
      `)
      .is('deleted_at', null)
      .order('invoice_date', { ascending: false });

    // Aplicar filtros
    if (filters) {
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters.client_id) {
        query = query.eq('client_id', filters.client_id);
      }
      if (filters.date_from) {
        query = query.gte('invoice_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('invoice_date', filters.date_to);
      }
      if (filters.invoice_number) {
        query = query.ilike('full_invoice_number', `%${filters.invoice_number}%`);
      }
      if (filters.min_amount) {
        query = query.gte('total', filters.min_amount);
      }
      if (filters.max_amount) {
        query = query.lte('total', filters.max_amount);
      }
    }

    return from(query).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Invoice[];
      }),
      catchError(error => {
        console.error('Error al obtener facturas:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtener una factura por ID
   */
  getInvoice(id: string): Observable<Invoice> {
    return from(
      this.supabase
        .from('invoices')
        .select(`
          *,
          client:clients(*),
          series:invoice_series(*),
          items:invoice_items(*),
          payments:invoice_payments(*)
        `)
        .eq('id', id)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Invoice;
      }),
      catchError(error => {
        console.error('Error al obtener factura:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Crear nueva factura
   */
  createInvoice(dto: CreateInvoiceDTO): Observable<Invoice> {
    return new Observable(observer => {
      (async () => {
        try {
          // Obtener datos del usuario actual
          const userProfile = await firstValueFrom(this.authService.userProfile$);
          const companyId = this.authService.companyId();
          const userId = userProfile?.id;
          
          if (!companyId || !userId) {
            throw new Error('Usuario sin empresa o ID');
          }
          // 1. Obtener serie (por defecto si no se especifica)
          let seriesId = dto.series_id;
          if (!seriesId) {
            const { data: defaultSeries, error: seriesError } = await this.supabase
              .from('invoice_series')
              .select('*')
              .eq('company_id', companyId)
              .eq('is_default', true)
              .single();

            if (seriesError) throw seriesError;
            seriesId = defaultSeries.id;
          }

          // 2. Obtener siguiente número de factura
          const { data: numberData, error: numberError } = await this.supabase
            .rpc('get_next_invoice_number', { p_series_id: seriesId });

          if (numberError) throw numberError;
          const invoiceNumber = numberData;

          // 3. Obtener información de la serie
          const { data: series, error: seriesInfoError } = await this.supabase
            .from('invoice_series')
            .select('*')
            .eq('id', seriesId)
            .single();

          if (seriesInfoError) throw seriesInfoError;

          // 4. Calcular fecha de vencimiento si no se proporciona
          const invoiceDate = dto.invoice_date || new Date().toISOString().split('T')[0];
          const dueDate = dto.due_date || this.calculateDueDate(invoiceDate, 30);

          // 5. Crear factura
          const { data: invoice, error: invoiceError } = await this.supabase
            .from('invoices')
            .insert({
              company_id: companyId,
              client_id: dto.client_id,
              series_id: seriesId,
              invoice_number: invoiceNumber,
              invoice_series: `${series.year}-${series.series_code}`,
              invoice_type: dto.invoice_type || 'normal',
              invoice_date: invoiceDate,
              due_date: dueDate,
              payment_method: dto.payment_method,
              notes: dto.notes,
              internal_notes: dto.internal_notes,
              status: 'draft',
              currency: 'EUR',
              created_by: userId
            })
            .select()
            .single();

          if (invoiceError) throw invoiceError;

          // 6. Crear líneas de factura
          if (dto.items && dto.items.length > 0) {
            const items = dto.items.map((item, index) => ({
              invoice_id: invoice.id,
              line_order: index,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount_percent: item.discount_percent || 0,
              tax_rate: item.tax_rate || 21,
              product_id: item.product_id,
              service_id: item.service_id,
              // Los cálculos se harán en el trigger
              subtotal: 0,
              tax_amount: 0,
              total: 0
            }));

            const { error: itemsError } = await this.supabase
              .from('invoice_items')
              .insert(items);

            if (itemsError) throw itemsError;
          }

          // 7. Obtener factura completa
          const { data: fullInvoice, error: fullError } = await this.supabase
            .from('invoices')
            .select(`
              *,
              client:clients(*),
              series:invoice_series(*),
              items:invoice_items(*),
              payments:invoice_payments(*)
            `)
            .eq('id', invoice.id)
            .single();

          if (fullError) throw fullError;

          observer.next(fullInvoice as Invoice);
          observer.complete();
        } catch (error) {
          console.error('Error al crear factura:', error);
          observer.error(error);
        }
      })();
    });
  }

  /**
   * Actualizar factura
   */
  updateInvoice(id: string, dto: UpdateInvoiceDTO): Observable<Invoice> {
    return from(
      this.supabase
        .from('invoices')
        .update(dto)
        .eq('id', id)
        .select(`
          *,
          client:clients(*),
          series:invoice_series(*),
          items:invoice_items(*),
          payments:invoice_payments(*)
        `)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Invoice;
      }),
      catchError(error => {
        console.error('Error al actualizar factura:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Eliminar factura (soft delete)
   */
  deleteInvoice(id: string): Observable<void> {
    return from(
      this.supabase
        .from('invoices')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return undefined;
      }),
      catchError(error => {
        console.error('Error al eliminar factura:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================
  // INVOICE ITEMS
  // =====================================================

  /**
   * Añadir línea a factura
   */
  addInvoiceItem(invoiceId: string, item: CreateInvoiceItemDTO): Observable<InvoiceItem> {
    return from(
      this.supabase
        .from('invoice_items')
        .insert({
          invoice_id: invoiceId,
          ...item,
          discount_percent: item.discount_percent || 0,
          tax_rate: item.tax_rate || 21,
          // Los cálculos se harán en el trigger
          subtotal: 0,
          tax_amount: 0,
          total: 0
        })
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceItem;
      }),
      catchError(error => {
        console.error('Error al añadir línea:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Actualizar línea de factura
   */
  updateInvoiceItem(id: string, item: Partial<InvoiceItem>): Observable<InvoiceItem> {
    return from(
      this.supabase
        .from('invoice_items')
        .update(item)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceItem;
      }),
      catchError(error => {
        console.error('Error al actualizar línea:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Eliminar línea de factura
   */
  deleteInvoiceItem(id: string): Observable<void> {
    return from(
      this.supabase
        .from('invoice_items')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return undefined;
      }),
      catchError(error => {
        console.error('Error al eliminar línea:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================
  // PAYMENTS
  // =====================================================

  /**
   * Registrar pago
   */
  createPayment(dto: CreateInvoicePaymentDTO): Observable<InvoicePayment> {
    return new Observable(observer => {
      (async () => {
        try {
          const userProfile = await firstValueFrom(this.authService.userProfile$);
          const userId = userProfile?.id;

          const { data, error } = await this.supabase
            .from('invoice_payments')
            .insert({
              ...dto,
              created_by: userId
            })
            .select()
            .single();

          if (error) throw error;

          observer.next(data as InvoicePayment);
          observer.complete();
        } catch (error) {
          console.error('Error al registrar pago:', error);
          observer.error(error);
        }
      })();
    });
  }

  /**
   * Eliminar pago
   */
  deletePayment(id: string): Observable<void> {
    return from(
      this.supabase
        .from('invoice_payments')
        .delete()
        .eq('id', id)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return undefined;
      }),
      catchError(error => {
        console.error('Error al eliminar pago:', error);
        return throwError(() => error);
      })
    );
  }

  // =====================================================
  // STATS & ANALYTICS
  // =====================================================

  /**
   * Obtener estadísticas de facturación
   */
  getInvoiceStats(): Observable<InvoiceStats> {
    return new Observable(observer => {
      (async () => {
        try {
          // Obtener todas las facturas activas
          const { data: invoices, error } = await this.supabase
            .from('invoices')
            .select('*')
            .is('deleted_at', null);

          if (error) throw error;

          // Calcular estadísticas
          const stats: InvoiceStats = {
            total_invoices: invoices.length,
            total_amount: 0,
            paid_amount: 0,
            pending_amount: 0,
            overdue_amount: 0,
            count_by_status: {
              draft: 0,
              sent: 0,
              paid: 0,
              partial: 0,
              overdue: 0,
              cancelled: 0
            },
            monthly_revenue: []
          };

          invoices.forEach(inv => {
            stats.total_amount += inv.total;
            stats.paid_amount += inv.paid_amount;
            stats.count_by_status[inv.status as InvoiceStatus]++;

            if (inv.status === InvoiceStatus.OVERDUE) {
              stats.overdue_amount += inv.total - inv.paid_amount;
            } else if (inv.status !== InvoiceStatus.PAID && inv.status !== InvoiceStatus.CANCELLED) {
              stats.pending_amount += inv.total - inv.paid_amount;
            }
          });

          observer.next(stats);
          observer.complete();
        } catch (error) {
          console.error('Error al obtener estadísticas:', error);
          observer.error(error);
        }
      })();
    });
  }

  // =====================================================
  // HELPERS
  // =====================================================

  /**
   * Calcular fecha de vencimiento
   */
  private calculateDueDate(invoiceDate: string, daysUntilDue: number = 30): string {
    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + daysUntilDue);
    return date.toISOString().split('T')[0];
  }

  /**
   * Cambiar estado de factura
   */
  changeInvoiceStatus(id: string, status: InvoiceStatus): Observable<Invoice> {
    return this.updateInvoice(id, { status });
  }

  /**
   * Marcar como enviada
   */
  markAsSent(id: string): Observable<Invoice> {
    return this.changeInvoiceStatus(id, InvoiceStatus.SENT);
  }

  /**
   * Cancelar factura
   */
  cancelInvoice(id: string): Observable<Invoice> {
    return this.changeInvoiceStatus(id, InvoiceStatus.CANCELLED);
  }
}
