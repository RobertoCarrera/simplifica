/**
 * Budget payment service
 * ----------------------
 * Wraps the Edge Functions that power the "Pagar ahora" flow on
 * auto-generated presupuestos (recurring_budgets):
 *   - create-budget-payment-link   → mint a Stripe/PayPal/cash link
 *   - public-budget-payment-info   → fetch public payment page data
 *   - budget-receipt-pdf           → generate / download the receipt PDF
 *   - list_budget_payment_history  → payment history RPC
 *   - mark_budget_paid_atomic      → admin-side "mark as paid" (cash)
 *
 * All methods are isolated here so client-portal.service.ts stays focused
 * on the general portal surface, and so this code can be unit-tested
 * independently.
 */

import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import {
  RecurringBudget,
  RecurringBudgetPayment,
  RecurringBudgetPaymentProvider,
  RecurringBudgetPaymentStatus,
} from '../models/recurring-budget.model';

export interface BudgetPaymentLinkResult {
  success: boolean;
  provider: NonNullable<RecurringBudgetPaymentProvider>;
  payment_url: string | null;
  shareable_link?: string;
  token?: string;
  expires_at?: string;
  message?: string;
}

export interface PublicBudgetPaymentInfo {
  budget: {
    id: string;
    period: string;
    recurrence_type: string;
    total: number;
    subtotal: number;
    tax_amount: number;
    tax_rate: number;
    currency: string;
    issue_date: string;
    due_date: string;
    status: string;
    payment_status: string;
    is_paid: boolean;
    is_expired: boolean;
  };
  company: { name: string; logo_url?: string };
  client: { name: string; email?: string; tax_id?: string };
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    tax_amount: number;
    line_total: number;
    sort_order: number;
  }>;
  payment_options: Array<{
    provider: 'stripe' | 'paypal' | 'cash' | 'bank_transfer';
    label: string;
    icon: string;
    iconClass: string;
    buttonClass: string;
    available: boolean;
    reason?: string;
  }>;
  receipt_url: string | null;
  expires_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class BudgetPaymentService {
  private sb = inject(SupabaseClientService);
  private auth = inject(AuthService);

  private get supabase() { return this.sb.instance; }

  private get fnBase(): string {
    return (environment as any).edgeFunctionsBaseUrl
      || (environment as any).supabaseFunctionsUrl
      || `${(environment as any).supabase?.url}/functions/v1`;
  }

  /**
   * Requires a valid access token, refreshing the session if needed.
   * Mirrors the pattern in client-portal.service.ts.
   */
  private async requireAccessToken(): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.access_token) return session.access_token;
      try { await this.supabase.auth.refreshSession(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 150 * attempt));
    }
    throw new Error('No hay una sesión válida. Inicia sesión de nuevo.');
  }

  // ── 1. Generate a payment link (authenticated) ──────────────────────────

  /**
   * Calls create-budget-payment-link. The Pagar ahora button uses this to
   * get a Stripe checkout URL, a PayPal approval URL, or a cash/bank
   * transfer confirmation page.
   */
  async createPaymentLink(
    budgetId: string,
    provider: NonNullable<RecurringBudgetPaymentProvider>,
    expiresInDays = 30,
  ): Promise<BudgetPaymentLinkResult> {
    const token = await this.requireAccessToken();
    const { data, error } = await this.supabase.functions.invoke(
      'create-budget-payment-link',
      {
        body: {
          budget_id: budgetId,
          provider,
          expires_in_days: expiresInDays,
        },
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (error) {
      console.error('[BudgetPaymentService] createPaymentLink error:', error);
      throw new Error((error as any)?.message || 'No se pudo generar el link de pago');
    }
    if (!data?.success) {
      throw new Error(data?.error || 'No se pudo generar el link de pago');
    }
    return data as BudgetPaymentLinkResult;
  }

  // ── 2. Public payment page (no auth) ────────────────────────────────────

  /**
   * Fetches the public payment page payload (budget + lines + payment
   * options). NO auth — the only gate is the opaque payment_link_token.
   * Used by the standalone payment page at /pagar-presupuesto/:token.
   */
  async getPublicPaymentInfo(token: string): Promise<PublicBudgetPaymentInfo> {
    const res = await fetch(
      `${this.fnBase}/public-budget-payment-info?token=${encodeURIComponent(token)}`,
      { method: 'GET' },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((json as any)?.error || `Error ${res.status}`);
    }
    return json as PublicBudgetPaymentInfo;
  }

  // ── 3. Authenticated: load a single budget with lines + payments ──────

  /**
   * Loads a single budget the caller (company member) is allowed to see,
   * joining the line items. Payment history is NOT joined here — call
   * loadPaymentHistory() for that.
   */
  async getBudget(budgetId: string): Promise<RecurringBudget | null> {
    const { data, error } = await this.supabase
      .from('recurring_budgets')
      .select('*, lines:recurring_budget_lines(*)')
      .eq('id', budgetId)
      .maybeSingle();

    if (error) {
      console.error('[BudgetPaymentService] getBudget error:', error);
      throw error;
    }
    return (data as RecurringBudget) || null;
  }

  /**
   * Lists all budgets for a given client (used by the portal). The caller
   * is identified from the session; we filter by client_id of the current
   * user_profile to avoid leaking other clients' budgets.
   */
  async listClientBudgets(limit = 200): Promise<RecurringBudget[]> {
    const me = await firstValueFrom(this.auth.userProfile$);
    if (!me?.client_id) return [];
    const { data, error } = await this.supabase
      .from('recurring_budgets')
      .select('*')
      .eq('client_id', me.client_id)
      .neq('status', 'cancelled')
      .order('issue_date', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[BudgetPaymentService] listClientBudgets error:', error);
      return [];
    }
    return (data || []) as RecurringBudget[];
  }

  // ── 4. Payment history (RPC) ──────────────────────────────────────────

  /**
   * Returns the full payment history for a budget, newest first.
   * Wraps the SECURITY DEFINER RPC list_budget_payment_history so the
   * portal can call it even though there is no INSERT policy on
   * recurring_budget_payments for authenticated users.
   */
  async loadPaymentHistory(budgetId: string): Promise<RecurringBudgetPayment[]> {
    const { data, error } = await this.supabase
      .rpc('list_budget_payment_history', { p_budget_id: budgetId });

    if (error) {
      console.error('[BudgetPaymentService] loadPaymentHistory error:', error);
      throw error;
    }
    return (data || []) as RecurringBudgetPayment[];
  }

  // ── 5. Receipt PDF ────────────────────────────────────────────────────

  /**
   * Returns the absolute URL of the receipt PDF. Calls the budget-receipt-pdf
   * edge function which (a) generates the PDF if it doesn't exist, (b)
   * uploads it to the payment-receipts bucket, (c) persists the storage
   * path on the budget row. After this call, the row's receipt_pdf_path
   * is set and the budget gets receipt_generated_at timestamp.
   */
  async generateReceipt(budgetId: string): Promise<{ path: string; bytes: number }> {
    const token = await this.requireAccessToken();
    const res = await fetch(
      `${this.fnBase}/budget-receipt-pdf?budget_id=${encodeURIComponent(budgetId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((json as any)?.error || `Error ${res.status}`);
    }
    return { path: (json as any).path, bytes: (json as any).bytes };
  }

  /**
   * Returns a temporary signed download URL for the receipt PDF. The
   * budget must already have receipt_pdf_path persisted (i.e. someone
   * called generateReceipt at least once).
   */
  async getReceiptDownloadUrl(budgetId: string): Promise<{ url: string; expiresIn: number }> {
    const token = await this.requireAccessToken();

    // First, check whether the receipt exists. If not, generate it.
    const { data: row } = await this.supabase
      .from('recurring_budgets')
      .select('receipt_pdf_path')
      .eq('id', budgetId)
      .maybeSingle();

    if (!row?.receipt_pdf_path) {
      await this.generateReceipt(budgetId);
    }

    // Get a signed URL from storage
    const { data: row2 } = await this.supabase
      .from('recurring_budgets')
      .select('receipt_pdf_path')
      .eq('id', budgetId)
      .maybeSingle();

    if (!row2?.receipt_pdf_path) {
      throw new Error('No se pudo generar el recibo');
    }

    const { data: signed, error: signErr } = await this.supabase.storage
      .from('payment-receipts')
      .createSignedUrl(row2.receipt_pdf_path, 60 * 60 * 24 * 7); // 7 days

    if (signErr || !signed) {
      throw new Error(signErr?.message || 'No se pudo generar el link de descarga');
    }
    return { url: signed.signedUrl, expiresIn: 60 * 60 * 24 * 7 };
  }

  /**
   * Returns the receipt as a Blob (for inline preview in an <iframe>).
   * Streams the PDF directly from the edge function.
   */
  async downloadReceiptBlob(budgetId: string): Promise<Blob> {
    const token = await this.requireAccessToken();
    const res = await fetch(
      `${this.fnBase}/budget-receipt-pdf?budget_id=${encodeURIComponent(budgetId)}&download=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Error ${res.status}`);
    }
    return res.blob();
  }

  // ── 6. Admin-only: mark a budget as paid (cash / transfer) ──────────

  /**
   * Used by the admin panel when a cash / bank_transfer payment is
   * received outside the system. Idempotent: re-calling within the
   * same month is a no-op.
   */
  async confirmCashPayment(
    budgetId: string,
    notes?: string,
    provider: 'cash' | 'bank_transfer' = 'cash',
  ): Promise<{ payment_id: string; amount: number; currency: string }> {
    const token = await this.requireAccessToken();
    const { data, error } = await this.supabase.functions.invoke(
      'confirm-budget-cash-payment',
      {
        body: { budget_id: budgetId, notes, provider },
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (error) {
      console.error('[BudgetPaymentService] confirmCashPayment error:', error);
      throw new Error((error as any)?.message || 'No se pudo confirmar el pago');
    }
    if (!data?.success) {
      throw new Error(data?.error || 'No se pudo confirmar el pago');
    }
    return {
      payment_id: data.payment_id,
      amount: data.amount,
      currency: data.currency,
    };
  }

  // ── 7. Helpers ────────────────────────────────────────────────────────

  /**
   * Returns a stable "Pagar ahora" URL for sharing via email / WhatsApp.
   * The URL points to the public payment page; recipients can choose
   * between the configured payment options.
   */
  buildPublicPaymentUrl(token: string, baseUrl = window.location.origin): string {
    return `${baseUrl}/pagar-presupuesto/${encodeURIComponent(token)}`;
  }

  /**
   * Maps a generic string from the DB to a typed enum value, falling back
   * to UNPAID if the value is unknown.
   */
  coercePaymentStatus(s: string | null | undefined): RecurringBudgetPaymentStatus {
    switch (s) {
      case 'paid':     return RecurringBudgetPaymentStatus.PAID;
      case 'pending':  return RecurringBudgetPaymentStatus.PENDING;
      case 'refunded': return RecurringBudgetPaymentStatus.REFUNDED;
      case 'failed':   return RecurringBudgetPaymentStatus.FAILED;
      case 'unpaid':
      default:         return RecurringBudgetPaymentStatus.UNPAID;
    }
  }
}
