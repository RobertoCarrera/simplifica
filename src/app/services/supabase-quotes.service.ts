import { Injectable, inject } from '@angular/core';
import { Observable, from, map, switchMap, firstValueFrom } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import {
  Quote,
  QuoteItem,
  QuoteTemplate,
  CreateQuoteDTO,
  CreateQuoteItemDTO,
  UpdateQuoteDTO,
  UpdateQuoteItemDTO,
  QuoteFilters,
  QuoteSortOptions,
  QuoteStats,
  QuoteStatus,
  ConvertQuoteToInvoiceResponse
} from '../models/quote.model';

/**
 * SERVICIO DE PRESUPUESTOS
 * 
 * Gestión completa de presupuestos con:
 * - CRUD de presupuestos
 * - Gestión de items
 * - Plantillas
 * - Conversión a facturas
 * - Seguimiento de cliente
 * - Estadísticas
 */

@Injectable({
  providedIn: 'root'
})
export class SupabaseQuotesService {
  private supabaseClient = inject(SupabaseClientService);
  private authService = inject(AuthService);

  // =====================================================
  // PRESUPUESTOS - CRUD
  // =====================================================

  /**
   * Obtener todos los presupuestos con filtros
   */
  getQuotes(
    filters?: QuoteFilters,
    sort?: QuoteSortOptions,
    page: number = 1,
    pageSize: number = 50
  ): Observable<{ data: Quote[]; count: number }> {
    return from(this.executeGetQuotes(filters, sort, page, pageSize));
  }

  private async executeGetQuotes(
    filters?: QuoteFilters,
    sort?: QuoteSortOptions,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: Quote[]; count: number }> {
    const companyId = this.authService.companyId();
    if (!companyId) throw new Error('No company ID available');

    const client = this.supabaseClient.instance;
    let query = client
      .from('quotes')
      .select('*, client:clients(*), items:quote_items(*)', { count: 'exact' })
      .eq('company_id', companyId);

    // Aplicar filtros
    if (filters) {
      if (filters.client_id) {
        query = query.eq('client_id', filters.client_id);
      }
      
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }
      
      if (filters.from_date) {
        query = query.gte('quote_date', filters.from_date);
      }
      
      if (filters.to_date) {
        query = query.lte('quote_date', filters.to_date);
      }
      
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,full_quote_number.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }
      
      if (filters.is_expired !== undefined) {
        if (filters.is_expired) {
          query = query.lt('valid_until', new Date().toISOString().split('T')[0]);
        } else {
          query = query.gte('valid_until', new Date().toISOString().split('T')[0]);
        }
      }
      
      if (filters.has_invoice !== undefined) {
        if (filters.has_invoice) {
          query = query.not('invoice_id', 'is', null);
        } else {
          query = query.is('invoice_id', null);
        }
      }
    }

    // Aplicar ordenamiento
    if (sort) {
      query = query.order(sort.field, { ascending: sort.direction === 'asc' });
    } else {
      query = query.order('quote_date', { ascending: false });
    }

    // Paginación
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
      data: data as Quote[],
      count: count || 0
    };
  }

  /**
   * Obtener un presupuesto por ID
   */
  getQuote(id: string): Observable<Quote> {
    return from(this.executeGetQuote(id));
  }

  private async executeGetQuote(id: string): Promise<Quote> {
    const client = this.supabaseClient.instance;
    const { data, error } = await client
      .from('quotes')
      .select('*, client:clients(*), items:quote_items(*), invoice:invoices(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Quote;
  }

  /**
   * Crear un nuevo presupuesto
   */
  createQuote(dto: CreateQuoteDTO): Observable<Quote> {
    return from(this.executeCreateQuote(dto));
  }

  private async executeCreateQuote(dto: CreateQuoteDTO): Promise<Quote> {
    const companyId = this.authService.companyId();
    if (!companyId) throw new Error('No company ID available');

    const userProfile = await firstValueFrom(this.authService.userProfile$);
    const userId = userProfile?.id;

    const client = this.supabaseClient.instance;

    // Obtener siguiente número de presupuesto
    const year = new Date(dto.quote_date || new Date()).getFullYear();
    const { data: nextNumber, error: numberError } = await client
      .rpc('get_next_quote_number', {
        p_company_id: companyId,
        p_year: year
      });

    if (numberError) throw numberError;

    // Calcular fecha de validez por defecto
    const quoteDate = dto.quote_date || new Date().toISOString().split('T')[0];
    const validUntil = dto.valid_until || (() => {
      const date = new Date(quoteDate);
      date.setDate(date.getDate() + 30);
      return date.toISOString().split('T')[0];
    })();

    // Crear presupuesto
    const { data: quote, error: quoteError } = await client
      .from('quotes')
      .insert({
        company_id: companyId,
        client_id: dto.client_id,
        year,
        sequence_number: nextNumber,
        quote_number: `${year}-Q-${String(nextNumber).padStart(5, '0')}`,
        title: dto.title,
        description: dto.description,
        notes: dto.notes,
        terms_conditions: dto.terms_conditions,
        quote_date: quoteDate,
        valid_until: validUntil,
        currency: dto.currency || 'EUR',
        language: dto.language || 'es',
        discount_percent: dto.discount_percent || 0,
        status: 'draft',
        created_by: userId
      })
      .select()
      .single();

    if (quoteError) throw quoteError;

    // Crear items
    if (dto.items && dto.items.length > 0) {
      const itemsToInsert = dto.items.map((item, index) => ({
        quote_id: quote.id,
        company_id: companyId,
        line_number: index + 1,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate || 21,
        discount_percent: item.discount_percent || 0,
        notes: item.notes
      }));

      const { error: itemsError } = await client
        .from('quote_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;
    }

    // Obtener presupuesto completo con items
    return this.executeGetQuote(quote.id);
  }

  /**
   * Actualizar un presupuesto
   */
  updateQuote(id: string, dto: UpdateQuoteDTO): Observable<Quote> {
    return from(this.executeUpdateQuote(id, dto));
  }

  private async executeUpdateQuote(id: string, dto: UpdateQuoteDTO): Promise<Quote> {
    const client = this.supabaseClient.instance;

    const { data, error } = await client
      .from('quotes')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return this.executeGetQuote(id);
  }

  /**
   * Eliminar un presupuesto (solo borradores)
   */
  deleteQuote(id: string): Observable<void> {
    return from(this.executeDeleteQuote(id));
  }

  private async executeDeleteQuote(id: string): Promise<void> {
    const client = this.supabaseClient.instance;

    // Solo permitir eliminar borradores
    const { data: quote } = await client
      .from('quotes')
      .select('status')
      .eq('id', id)
      .single();

    if (quote?.status !== 'draft') {
      throw new Error('Solo se pueden eliminar presupuestos en estado borrador');
    }

    const { error } = await client
      .from('quotes')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // =====================================================
  // ITEMS - CRUD
  // =====================================================

  /**
   * Añadir un item a un presupuesto
   */
  addQuoteItem(quoteId: string, dto: CreateQuoteItemDTO): Observable<QuoteItem> {
    return from(this.executeAddQuoteItem(quoteId, dto));
  }

  private async executeAddQuoteItem(quoteId: string, dto: CreateQuoteItemDTO): Promise<QuoteItem> {
    const companyId = this.authService.companyId();
    if (!companyId) throw new Error('No company ID available');

    const client = this.supabaseClient.instance;

    // Obtener siguiente número de línea
    const { data: items } = await client
      .from('quote_items')
      .select('line_number')
      .eq('quote_id', quoteId)
      .order('line_number', { ascending: false })
      .limit(1);

    const nextLineNumber = items && items.length > 0 ? items[0].line_number + 1 : 1;

    const { data, error } = await client
      .from('quote_items')
      .insert({
        quote_id: quoteId,
        company_id: companyId,
        line_number: nextLineNumber,
        description: dto.description,
        quantity: dto.quantity,
        unit_price: dto.unit_price,
        tax_rate: dto.tax_rate || 21,
        discount_percent: dto.discount_percent || 0,
        notes: dto.notes
      })
      .select()
      .single();

    if (error) throw error;
    return data as QuoteItem;
  }

  /**
   * Actualizar un item
   */
  updateQuoteItem(itemId: string, dto: UpdateQuoteItemDTO): Observable<QuoteItem> {
    return from(this.executeUpdateQuoteItem(itemId, dto));
  }

  private async executeUpdateQuoteItem(itemId: string, dto: UpdateQuoteItemDTO): Promise<QuoteItem> {
    const client = this.supabaseClient.instance;

    const { data, error } = await client
      .from('quote_items')
      .update(dto)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;
    return data as QuoteItem;
  }

  /**
   * Eliminar un item
   */
  deleteQuoteItem(itemId: string): Observable<void> {
    return from(this.executeDeleteQuoteItem(itemId));
  }

  private async executeDeleteQuoteItem(itemId: string): Promise<void> {
    const client = this.supabaseClient.instance;

    const { error } = await client
      .from('quote_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  }

  // =====================================================
  // ACCIONES DE PRESUPUESTO
  // =====================================================

  /**
   * Enviar presupuesto al cliente (cambiar estado a 'sent')
   */
  sendQuote(id: string): Observable<Quote> {
    return this.updateQuote(id, { status: QuoteStatus.SENT });
  }

  /**
   * Marcar presupuesto como visto por el cliente
   */
  markQuoteAsViewed(id: string, ipAddress?: string, userAgent?: string): Observable<Quote> {
    return from(this.executeMarkQuoteAsViewed(id, ipAddress, userAgent));
  }

  private async executeMarkQuoteAsViewed(id: string, ipAddress?: string, userAgent?: string): Promise<Quote> {
    const client = this.supabaseClient.instance;

    const { error } = await client
      .from('quotes')
      .update({
        status: QuoteStatus.VIEWED,
        client_viewed_at: new Date().toISOString(),
        client_ip_address: ipAddress,
        client_user_agent: userAgent
      })
      .eq('id', id);

    if (error) throw error;

    return this.executeGetQuote(id);
  }

  /**
   * Aceptar presupuesto
   */
  acceptQuote(id: string): Observable<Quote> {
    return from(this.executeAcceptQuote(id));
  }

  private async executeAcceptQuote(id: string): Promise<Quote> {
    const client = this.supabaseClient.instance;

    const { error } = await client
      .from('quotes')
      .update({
        status: QuoteStatus.ACCEPTED,
        accepted_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return this.executeGetQuote(id);
  }

  /**
   * Rechazar presupuesto
   */
  rejectQuote(id: string): Observable<Quote> {
    return from(this.executeRejectQuote(id));
  }

  private async executeRejectQuote(id: string): Promise<Quote> {
    const client = this.supabaseClient.instance;

    const { error } = await client
      .from('quotes')
      .update({
        status: QuoteStatus.REJECTED,
        rejected_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;

    return this.executeGetQuote(id);
  }

  /**
   * Convertir presupuesto a factura
   */
  convertToInvoice(quoteId: string, invoiceSeriesId?: string): Observable<ConvertQuoteToInvoiceResponse> {
    return from(this.executeConvertToInvoice(quoteId, invoiceSeriesId));
  }

  private async executeConvertToInvoice(quoteId: string, invoiceSeriesId?: string): Promise<ConvertQuoteToInvoiceResponse> {
    const client = this.supabaseClient.instance;

    const { data, error } = await client
      .rpc('convert_quote_to_invoice', {
        p_quote_id: quoteId,
        p_invoice_series_id: invoiceSeriesId || null
      });

    if (error) throw error;

    return {
      invoice_id: data,
      success: true,
      message: 'Presupuesto convertido a factura exitosamente'
    };
  }

  /**
   * Marcar presupuestos expirados
   */
  markExpiredQuotes(): Observable<number> {
    return from(this.executeMarkExpiredQuotes());
  }

  private async executeMarkExpiredQuotes(): Promise<number> {
    const client = this.supabaseClient.instance;

    const { data, error } = await client.rpc('mark_expired_quotes');

    if (error) throw error;
    return data || 0;
  }

  // =====================================================
  // PLANTILLAS
  // =====================================================

  /**
   * Obtener plantillas de presupuesto
   */
  getQuoteTemplates(): Observable<QuoteTemplate[]> {
    return from(this.executeGetQuoteTemplates());
  }

  private async executeGetQuoteTemplates(): Promise<QuoteTemplate[]> {
    const companyId = this.authService.companyId();
    if (!companyId) throw new Error('No company ID available');

    const client = this.supabaseClient.instance;
    const { data, error } = await client
      .from('quote_templates')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('usage_count', { ascending: false });

    if (error) throw error;
    return data as QuoteTemplate[];
  }

  /**
   * Crear presupuesto desde plantilla
   */
  createQuoteFromTemplate(templateId: string, clientId: string, customData?: Partial<CreateQuoteDTO>): Observable<Quote> {
    return from(this.executeCreateQuoteFromTemplate(templateId, clientId, customData));
  }

  private async executeCreateQuoteFromTemplate(
    templateId: string,
    clientId: string,
    customData?: Partial<CreateQuoteDTO>
  ): Promise<Quote> {
    const client = this.supabaseClient.instance;

    // Obtener plantilla
    const { data: template, error: templateError } = await client
      .from('quote_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) throw templateError;

    // Crear DTO desde plantilla
    const dto: CreateQuoteDTO = {
      client_id: clientId,
      title: customData?.title || template.title_template || 'Presupuesto',
      description: customData?.description || template.description_template,
      notes: customData?.notes || template.notes_template,
      terms_conditions: customData?.terms_conditions || template.terms_conditions_template,
      items: customData?.items || template.default_items || [],
      ...customData
    };

    // Calcular valid_until desde template
    if (!dto.valid_until && template.default_valid_days) {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + template.default_valid_days);
      dto.valid_until = validUntil.toISOString().split('T')[0];
    }

    // Crear presupuesto
    const quote = await this.executeCreateQuote(dto);

    // Actualizar estadísticas de plantilla
    await client
      .from('quote_templates')
      .update({
        usage_count: template.usage_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', templateId);

    return quote;
  }

  // =====================================================
  // ESTADÍSTICAS
  // =====================================================

  /**
   * Obtener estadísticas de presupuestos
   */
  getQuoteStats(fromDate?: string, toDate?: string): Observable<QuoteStats> {
    return from(this.executeGetQuoteStats(fromDate, toDate));
  }

  private async executeGetQuoteStats(fromDate?: string, toDate?: string): Promise<QuoteStats> {
    const companyId = this.authService.companyId();
    if (!companyId) throw new Error('No company ID available');

    const client = this.supabaseClient.instance;

    let query = client
      .from('quotes')
      .select('status, total_amount, invoice_id')
      .eq('company_id', companyId);

    if (fromDate) {
      query = query.gte('quote_date', fromDate);
    }
    if (toDate) {
      query = query.lte('quote_date', toDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    const quotes = data || [];

    // Calcular estadísticas
    const totalQuotes = quotes.length;
    const totalAmount = quotes.reduce((sum: number, q: any) => sum + Number(q.total_amount), 0);

    // Por estado
    const byStatus = Object.values(QuoteStatus).map(status => {
      const statusQuotes = quotes.filter((q: any) => q.status === status);
      return {
        status,
        count: statusQuotes.length,
        total_amount: statusQuotes.reduce((sum: number, q: any) => sum + Number(q.total_amount), 0)
      };
    });

    // Tasa de aceptación
    const sentQuotes = quotes.filter((q: any) => [QuoteStatus.SENT, QuoteStatus.VIEWED, QuoteStatus.ACCEPTED, QuoteStatus.REJECTED].includes(q.status as QuoteStatus));
    const acceptedQuotes = quotes.filter((q: any) => q.status === QuoteStatus.ACCEPTED);
    const acceptanceRate = sentQuotes.length > 0 ? (acceptedQuotes.length / sentQuotes.length) * 100 : 0;

    // Tasa de conversión a factura
    const invoicedQuotes = quotes.filter((q: any) => q.invoice_id);
    const conversionRate = acceptedQuotes.length > 0 ? (invoicedQuotes.length / acceptedQuotes.length) * 100 : 0;

    // Promedio
    const averageAmount = totalQuotes > 0 ? totalAmount / totalQuotes : 0;

    return {
      total_quotes: totalQuotes,
      total_amount: Math.round(totalAmount * 100) / 100,
      by_status: byStatus,
      acceptance_rate: Math.round(acceptanceRate * 100) / 100,
      average_amount: Math.round(averageAmount * 100) / 100,
      conversion_rate: Math.round(conversionRate * 100) / 100
    };
  }
}
