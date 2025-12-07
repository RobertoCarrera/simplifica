import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';

export interface PaymentIntegration {
  id: string;
  company_id: string;
  provider: 'paypal' | 'stripe';
  is_active: boolean;
  is_sandbox: boolean;
  credentials_masked?: {
    clientId?: string;
    publishableKey?: string;
  };
  webhook_secret_encrypted?: string;
  webhook_url?: string;
  last_verified_at?: string;
  verification_status?: 'pending' | 'verified' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface SaveIntegrationPayload {
  credentials?: Record<string, string>;
  webhook_secret?: string;
  is_sandbox?: boolean;
  is_active?: boolean;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  details?: Record<string, any>;
}

@Injectable({ providedIn: 'root' })
export class PaymentIntegrationsService {
  private supabaseClient = inject(SupabaseClientService);
  private get fnBase() { return (environment.edgeFunctionsBaseUrl || '').replace(/\/+$/, ''); }

  /**
   * Get all payment integrations for a company (credentials are masked)
   */
  async getIntegrations(companyId: string): Promise<PaymentIntegration[]> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${this.fnBase}/payment-integrations?company_id=${companyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'apikey': environment.supabase.anonKey,
      }
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Error al obtener integraciones');
    return json?.integrations || [];
  }

  /**
   * Save or update a payment integration
   */
  async saveIntegration(
    companyId: string, 
    provider: 'paypal' | 'stripe', 
    payload: SaveIntegrationPayload
  ): Promise<PaymentIntegration> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${this.fnBase}/payment-integrations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'Content-Type': 'application/json',
        'apikey': environment.supabase.anonKey,
      },
      body: JSON.stringify({
        company_id: companyId,
        provider,
        ...payload
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Error al guardar integración');
    return json?.integration;
  }

  /**
   * Delete a payment integration
   */
  async deleteIntegration(companyId: string, provider: 'paypal' | 'stripe'): Promise<void> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${this.fnBase}/payment-integrations`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'Content-Type': 'application/json',
        'apikey': environment.supabase.anonKey,
      },
      body: JSON.stringify({
        company_id: companyId,
        provider
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Error al eliminar integración');
  }

  /**
   * Test connection to payment provider
   */
  async testConnection(companyId: string, provider: 'paypal' | 'stripe'): Promise<TestConnectionResult> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    console.log('[payment-integrations] Testing connection:', { companyId, provider, fnBase: this.fnBase });

    try {
      const res = await fetch(`${this.fnBase}/payment-integrations-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token ?? ''}`,
          'Content-Type': 'application/json',
          'apikey': environment.supabase.anonKey,
        },
        body: JSON.stringify({
          company_id: companyId,
          provider
        })
      });

      console.log('[payment-integrations] Response status:', res.status);
      
      const json = await res.json();
      console.log('[payment-integrations] Response body:', json);
      
      if (!res.ok) {
        return { 
          success: false, 
          error: json?.error || `Error HTTP ${res.status}`,
          details: json?.details
        };
      }
      return json;
    } catch (fetchError: any) {
      console.error('[payment-integrations] Fetch error:', fetchError);
      return { 
        success: false, 
        error: fetchError?.message || 'Error de red al conectar con el servidor' 
      };
    }
  }

  /**
   * Generate a payment link for an invoice
   */
  async generatePaymentLink(
    invoiceId: string, 
    provider: 'paypal' | 'stripe',
    expiresInDays: number = 7
  ): Promise<{ payment_url: string; shareable_link: string; token: string; expires_at: string; provider: string }> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${this.fnBase}/create-payment-link`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'Content-Type': 'application/json',
        'apikey': environment.supabase.anonKey,
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
        provider,
        expires_in_days: expiresInDays
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Error al generar enlace de pago');
    return json;
  }

  /**
   * Get payment status for an invoice
   */
  async getPaymentStatus(invoiceId: string): Promise<{
    status: 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled';
    method?: string;
    date?: string;
    reference?: string;
    transactions: any[];
  }> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${this.fnBase}/payment-status?invoice_id=${invoiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'apikey': environment.supabase.anonKey,
      }
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Error al obtener estado de pago');
    return json;
  }

  /**
   * Record a manual payment
   */
  async recordManualPayment(
    invoiceId: string,
    amount: number,
    method: 'transfer' | 'cash' | 'other',
    reference?: string
  ): Promise<void> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${this.fnBase}/payment-manual`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'Content-Type': 'application/json',
        'apikey': environment.supabase.anonKey,
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
        amount,
        method,
        reference
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'Error al registrar pago');
  }
}
