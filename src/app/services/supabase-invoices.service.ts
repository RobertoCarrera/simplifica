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
import { environment } from '../../environments/environment';

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
  // VERIFACTU (Meta & Events + Dispatcher Actions)
  // =====================================================

  private verifactuConfig: { maxAttempts: number; backoffMinutes: number[] } | null = null;

  /**
   * Obtener metadatos VeriFactu de una factura
   */
  getVerifactuMeta(invoiceId: string): Observable<any | null> {
    // Proxy via Edge Function to avoid 406 on verifactu schema from the browser
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');
          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/verifactu-dispatcher`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'meta', invoice_id: invoiceId })
          });
          const json = await res.json();
          if (!res.ok || !json.ok) throw new Error(json?.error || 'VF meta error');
          observer.next(json.meta || null);
          observer.complete();
        } catch (e) {
          console.warn('VeriFactu meta no disponible:', (e as any)?.message || e);
          observer.next(null);
          observer.complete();
        }
      })();
    });
  }

  /**
   * Obtener últimos eventos VeriFactu de una factura
   */
  getVerifactuEvents(invoiceId: string, limit: number = 5): Observable<any[]> {
    // Proxy via Edge Function to avoid 406 on verifactu schema from the browser
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');
          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/verifactu-dispatcher`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'events', invoice_id: invoiceId, limit })
          });
          const json = await res.json();
          if (!res.ok || !json.ok) throw new Error(json?.error || 'VF events error');
          observer.next(json.events || []);
          observer.complete();
        } catch (e) {
          console.warn('VeriFactu events no disponibles:', (e as any)?.message || e);
          observer.next([]);
          observer.complete();
        }
      })();
    });
  }

  /**
   * Suscribirse a cambios en tiempo real de VeriFactu para una factura
   */
  subscribeToVerifactuChanges(invoiceId: string, callback: () => void): { unsubscribe: () => void } {
    const channel = this.supabase
      .channel(`verifactu-${invoiceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'verifactu', table: 'invoice_meta', filter: `invoice_id=eq.${invoiceId}` },
        () => callback()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'verifactu', table: 'events', filter: `invoice_id=eq.${invoiceId}` },
        () => callback()
      )
      .subscribe();

    return {
      unsubscribe: () => {
        this.supabase.removeChannel(channel);
      }
    };
  }

  /**
   * Ejecuta el dispatcher inmediatamente (procesa eventos pendientes)
   */
  runDispatcherNow(): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');

          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/verifactu-dispatcher`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          const json = await res.json();
          observer.next(json);
          observer.complete();
        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }

  /**
   * Reintento manual seguro: resetear el último evento rechazado a 'pending'
   */
  retryVerifactu(invoiceId: string): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');

          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/verifactu-dispatcher`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'retry', invoice_id: invoiceId })
          });
          const json = await res.json();
          observer.next(json);
          observer.complete();
        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }

  /**
   * Obtener configuración VeriFactu desde el servidor (no sensible)
   */
  getVerifactuConfig(): Observable<{ maxAttempts: number; backoffMinutes: number[] }> {
    if (this.verifactuConfig) {
      return from([this.verifactuConfig]);
    }
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          // Config might be public, but Gateway requires token usually. If public, we might need anon key.
          // Assuming authenticated user for now as this is an admin feature.
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            // Fallback to anon key if no session (though likely logged in)
            headers['Authorization'] = `Bearer ${environment.supabase.anonKey}`;
          }

          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/verifactu-dispatcher`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'config' })
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'VF config error');

          const cfg = { maxAttempts: Number(json.maxAttempts) || 7, backoffMinutes: (json.backoffMinutes as number[]) || [0, 1, 5, 15, 60, 180, 720] };
          this.verifactuConfig = cfg;
          observer.next(cfg);
          observer.complete();
        } catch (e) {
          // Fallback defaults if fails
          const defaults = { maxAttempts: 7, backoffMinutes: [0, 1, 5, 15, 60, 180, 720] };
          this.verifactuConfig = defaults;
          observer.next(defaults);
          observer.complete();
        }
      })();
    });
  }

  /**
   * Estado de salud del dispatcher (conteos y última actividad)
   */
  getDispatcherHealth(): Observable<{ pending: number; lastEventAt: string | null; lastAcceptedAt: string | null; lastRejectedAt: string | null; }> {
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');

          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/verifactu-dispatcher`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'health' })
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'VF health error');

          observer.next({
            pending: Number(json.pending || 0),
            lastEventAt: json.lastEventAt || null,
            lastAcceptedAt: json.lastAcceptedAt || null,
            lastRejectedAt: json.lastRejectedAt || null
          });
          observer.complete();
        } catch (e) {
          // Return zeros/nulls on error to avoid breaking UI
          observer.next({ pending: 0, lastEventAt: null, lastAcceptedAt: null, lastRejectedAt: null });
          observer.complete();
        }
      })();
    });
  }

  /**
   * Enviar factura por email (Amazon SES) con enlace seguro al PDF
   */
  sendInvoiceEmail(invoiceId: string, to: string, subject?: string, message?: string): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');
          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/invoices-email`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_id: invoiceId, to, subject, message })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'Error al enviar email');
          observer.next(json);
          observer.complete();
        } catch (e) {
          observer.error(e);
        }
      })();
    });
  }

  /**
   * Cancelar factura con AEAT (verifactu anulacion) vía Edge Function
   */
  cancelInvoiceWithAEAT(invoiceId: string, reason?: string): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');

          const res = await fetch(`${environment.edgeFunctionsBaseUrl}/invoices-cancel`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_id: invoiceId, reason: reason || null })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'Error al anular factura');
          observer.next(json);
          observer.complete();
        } catch (e) {
          console.error('Error cancelInvoiceWithAEAT:', e);
          observer.error(e);
        }
      })();
    });
  }

  /**
   * Obtener URL firmada del PDF de una factura (lo genera si no existe)
   */
  getInvoicePdfUrl(invoiceId: string, force: boolean = false): Observable<string> {
    return new Observable(observer => {
      (async () => {
        try {
          const { data: { session } } = await this.supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error('Sesión no válida');
          const url = `${environment.edgeFunctionsBaseUrl}/invoices-pdf?invoice_id=${encodeURIComponent(invoiceId)}${force ? '&force=1' : ''}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const json = await res.json();
          if (!res.ok) throw new Error(json?.error || 'No se pudo obtener PDF');
          const signedUrl = json?.url;
          if (!signedUrl) throw new Error('Respuesta sin URL firmada');
          observer.next(signedUrl);
          observer.complete();
        } catch (e) {
          observer.error(e);
        }
      })();
    });
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
   * Obtener todas las series (activas e inactivas) para administración
   */
  getAllInvoiceSeries(): Observable<InvoiceSeries[]> {
    return from(
      this.supabase
        .from('invoice_series')
        .select('*')
        .order('year', { ascending: false })
        .order('series_code', { ascending: true })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceSeries[];
      }),
      catchError(error => {
        console.error('Error al obtener todas las series de facturación:', error);
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

  /**
   * Actualizar serie existente (por id)
   */
  updateInvoiceSeries(id: string, changes: Partial<InvoiceSeries>): Observable<InvoiceSeries> {
    return from(
      this.supabase
        .from('invoice_series')
        .update(changes)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as InvoiceSeries;
      }),
      catchError(error => {
        console.error('Error al actualizar serie:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Marcar una serie como predeterminada (desmarcando las demás de la empresa)
   */
  setDefaultInvoiceSeries(id: string): Observable<void> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      return throwError(() => new Error('Usuario sin empresa asignada'));
    }

    return from((async () => {
      const client = this.supabase;
      // Desmarcar todas las series de la empresa
      const clear = await client
        .from('invoice_series')
        .update({ is_default: false })
        .eq('company_id', companyId);
      if (clear.error) throw clear.error;

      // Marcar la seleccionada
      const set = await client
        .from('invoice_series')
        .update({ is_default: true, is_active: true })
        .eq('id', id);
      if (set.error) throw set.error;
    })()).pipe(
      map(() => void 0),
      catchError(error => {
        console.error('Error al marcar serie por defecto:', error);
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
        verifactu_status,
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
          verifactu_status,
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
              status: InvoiceStatus.APPROVED,
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
              approved: 0,
              issued: 0,
              sent: 0,
              paid: 0,
              partial: 0,
              overdue: 0,
              cancelled: 0,
              rectified: 0,
              void: 0
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
