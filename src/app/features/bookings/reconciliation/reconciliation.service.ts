import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';

export type ReconciliationStatus =
  | 'missing_quote'
  | 'missing_invoice'
  | 'quote_draft'
  | 'quote_rejected'
  | 'invoice_draft'
  | 'invoice_pending'
  | 'paid'
  | 'ok';

export interface ReconciliationRow {
  booking_id: string;
  company_id: string;
  client_id: string | null;
  customer_name: string | null;
  start_time: string;
  booking_status: string;
  booking_payment_status: string | null;
  session_confirmed: boolean;
  is_past_or_confirmed: boolean;
  has_quote: boolean;
  quote_status: string | null;
  quote_total: number | null;
  has_invoice: boolean;
  invoice_status: string | null;
  invoice_payment_status: string | null;
  invoice_total: number | null;
  reconciliation_status: ReconciliationStatus;
}

export interface ReconciliationSummary {
  company_id: string;
  total_bookings: number;
  bookings_without_quote: number;
  bookings_with_quote: number;
  quotes_draft: number;
  quotes_accepted: number;
  quotes_rejected: number;
  sessions_without_invoice: number;
  invoices_draft: number;
  invoices_issued: number;
  invoices_paid: number;
  paid_amount_total: number;
}

@Injectable({ providedIn: 'root' })
export class ReconciliationService {
  private supabase = inject(SimpleSupabaseService);

  async getSummary(companyId: string): Promise<ReconciliationSummary> {
    const { data, error } = await this.supabase
      .getClient()
      .from('v_reconciliation_summary')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? {
      company_id: companyId,
      total_bookings: 0,
      bookings_without_quote: 0,
      bookings_with_quote: 0,
      quotes_draft: 0,
      quotes_accepted: 0,
      quotes_rejected: 0,
      sessions_without_invoice: 0,
      invoices_draft: 0,
      invoices_issued: 0,
      invoices_paid: 0,
      paid_amount_total: 0,
    }) as ReconciliationSummary;
  }

  async getRows(companyId: string, status?: ReconciliationStatus): Promise<ReconciliationRow[]> {
    let q = this.supabase
      .getClient()
      .from('v_booking_reconciliation')
      .select('*')
      .eq('company_id', companyId)
      .order('start_time', { ascending: false });
    if (status) q = q.eq('reconciliation_status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ReconciliationRow[];
  }
}
