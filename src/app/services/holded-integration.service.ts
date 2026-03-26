import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface HoldedIntegration {
  id: string;
  company_id: string;
  is_active: boolean;
  verification_status: 'pending' | 'verified' | 'failed';
  connected_at?: string;
  last_verified_at?: string;
  updated_at?: string;
  created_at?: string;
}

export interface HoldedSaveResult {
  success: boolean;
  is_active: boolean;
  verification_status: string;
  api_key_masked: string;
  connected_at: string;
}

@Injectable({ providedIn: 'root' })
export class HoldedIntegrationService {
  private supabase  = inject(SupabaseClientService);
  private auth      = inject(AuthService);

  private _integration = signal<HoldedIntegration | null>(null);
  private _loading     = signal(false);

  /** Read-only signals for consumers */
  readonly integration = this._integration.asReadonly();
  readonly isActive    = computed(() => this._integration()?.is_active === true);
  readonly loading     = this._loading.asReadonly();

  /**
   * Extracts the real error message from a FunctionsHttpError.
   * The Supabase client throws FunctionsHttpError with a generic message;
   * the actual JSON body (with the specific error) is in `error.context`.
   */
  private async extractInvokeError(error: unknown): Promise<Error> {
    if (error != null && typeof error === 'object' && 'context' in error) {
      const ctx = (error as { context: unknown }).context;
      if (ctx instanceof Response) {
        try {
          const body = await ctx.clone().json() as Record<string, unknown>;
          const msg = (body['error'] as string) ?? (body['message'] as string) ?? 'Error desconocido en Edge Function';
          return new Error(msg);
        } catch { /* not JSON */ }
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /** Load current company's Holded integration status (no encrypted key returned). */
  async loadIntegration(): Promise<void> {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.instance
        .from('holded_integrations')
        // IMPORTANT: never select api_key_encrypted from the client
        .select('id, company_id, is_active, verification_status, connected_at, last_verified_at, created_at, updated_at')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        // 404 = table doesn't exist yet (migration not applied) — treat as "not configured"
        if (error.code === '42P01' || error.message?.includes('404') || (error as unknown as Record<string, unknown>)['status'] === 404) {
          this._integration.set(null);
        } else {
          console.error('[HoldedIntegrationService] loadIntegration error:', error);
          this._integration.set(null);
        }
      } else {
        this._integration.set(data);
      }
    } finally {
      this._loading.set(false);
    }
  }

  /** Save (or update) the Holded API key. Calls the save-holded-integration edge function. */
  async saveApiKey(apiKey: string): Promise<HoldedSaveResult> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No hay empresa activa');

    const { data: { session } } = await this.supabase.instance.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no activa. Por favor recarga la página e intenta de nuevo.');
    const { data, error } = await this.supabase.instance.functions.invoke(
      'save-holded-integration',
      {
        body: { company_id: companyId, api_key: apiKey },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (error) throw await this.extractInvokeError(error);
    if (data?.error) throw new Error(data.error);

    // Refresh local state
    await this.loadIntegration();
    return data as HoldedSaveResult;
  }

  /** Remove the Holded integration for this company. */
  async disconnect(): Promise<void> {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    const { data: { session } } = await this.supabase.instance.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no activa. Por favor recarga la página e intenta de nuevo.');
    const { data, error } = await this.supabase.instance.functions.invoke(
      'save-holded-integration',
      {
        body: { company_id: companyId, disconnect: true },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (error) throw await this.extractInvokeError(error);
    if (data?.error) throw new Error(data.error);

    this._integration.set(null);
  }

  /**
   * List Holded documents or contacts via the holded-proxy edge function.
   * resource: e.g. "documents/salesreceipt", "documents/invoice", "contacts"
   */
  async listDocuments(resource: string, params?: Record<string, string>): Promise<unknown[]> {
    const companyId = this.auth.companyId();
    if (!companyId) return [];

    const { data: { session } } = await this.supabase.instance.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no activa. Por favor recarga la página e intenta de nuevo.');
    const { data, error } = await this.supabase.instance.functions.invoke(
      'holded-proxy',
      {
        body: { company_id: companyId, resource, params },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (error) throw await this.extractInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Mutate a Holded resource via POST or PUT through the holded-proxy.
   * resourcePath can include an ID suffix, e.g. "products/abc123"
   */
  async mutateHolded(
    method: 'POST' | 'PUT',
    resourcePath: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No hay empresa activa');

    // Base resource for whitelist check (no trailing /{id})
    const baseResource = resourcePath.split('/').slice(0, 2).join('/');

    const { data: { session } } = await this.supabase.instance.auth.getSession();
    if (!session?.access_token) throw new Error('Sesión no activa. Por favor recarga la página e intenta de nuevo.');
    const { data, error } = await this.supabase.instance.functions.invoke(
      'holded-proxy',
      {
        body: { company_id: companyId, resource: baseResource, resourcePath, method, payload },
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (error) throw await this.extractInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return data as Record<string, unknown>;
  }

  /**
   * Sync CRM services to Holded products.
   * Creates new products for services without holded_product_id,
   * updates existing ones otherwise.
   * Returns counts of synced/errored items.
   */
  async syncServices(
    services: Array<{
      id: string;
      name: string;
      description?: string | null;
      base_price?: number | null;
      tax_rate?: number | null;
      unit_type?: string | null;
      holded_product_id?: string | null;
    }>,
  ): Promise<{ synced: number; errors: string[] }> {
    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No hay empresa activa');

    let synced = 0;
    const errors: string[] = [];

    for (const svc of services) {
      try {
        const holdedPayload = {
          name:     svc.name,
          desc:     svc.description ?? '',
          subtotal: svc.base_price ?? 0,
          tax:      svc.tax_rate ?? 0,
        };

        let holdedProductId = svc.holded_product_id ?? null;

        if (holdedProductId) {
          // Update existing service
          await this.mutateHolded('PUT', `services/${holdedProductId}`, holdedPayload);
        } else {
          // Create new service
          const result = await this.mutateHolded('POST', 'services', holdedPayload);
          holdedProductId = (result['id'] ?? result['_id'] ?? null) as string | null;

          if (holdedProductId) {
            await this.supabase.instance
              .from('services')
              .update({ holded_product_id: holdedProductId })
              .eq('id', svc.id)
              .eq('company_id', companyId);
          }
        }

        synced++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${svc.name}: ${msg}`);
      }
    }

    return { synced, errors };
  }

  /**
   * Creates a Holded contact for the given customer (if not already created).
   * Saves holded_contact_id back to Supabase.
   * Returns the Holded contact ID.
   */
  async createOrGetContact(customer: {
    id: string;
    name: string;
    surname?: string | null;
    business_name?: string | null;
    email?: string | null;
    phone?: string | null;
    holded_contact_id?: string | null;
  }): Promise<string> {
    if (customer.holded_contact_id) return customer.holded_contact_id;

    const companyId = this.auth.companyId();
    if (!companyId) throw new Error('No hay empresa activa');

    const fullName = customer.business_name
      ? customer.business_name
      : [customer.name, customer.surname].filter(Boolean).join(' ');

    const payload: Record<string, unknown> = { name: fullName };
    if (customer.email) payload['email'] = customer.email;
    if (customer.phone) payload['phone'] = customer.phone;

    const result = await this.mutateHolded('POST', 'contacts', payload);
    const holdedContactId = (result['id'] ?? result['_id']) as string;

    if (!holdedContactId) throw new Error('Holded no devolvió un ID de contacto');

    await this.supabase.instance
      .from('clients')
      .update({ holded_contact_id: holdedContactId })
      .eq('id', customer.id)
      .eq('company_id', companyId);

    return holdedContactId;
  }

  /**
   * Send a quote as a Holded estimate (presupuesto).
   * Creates/gets the Holded contact first, then creates the estimate.
   * Returns the Holded estimate ID.
   */
  async sendEstimate(quote: {
    quote_date?: string | null;
    notes?: string | null;
    items: Array<{
      description?: string | null;
      quantity?: number | null;
      unit_price?: number | null;
      tax_rate?: number | null;
      holded_product_id?: string | null;
    }>;
  }, holdedContactId: string): Promise<string> {
    const dateUnix = quote.quote_date
      ? Math.floor(new Date(quote.quote_date).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const holdedItems = quote.items.map((item) => {
      const entry: Record<string, unknown> = {
        name:     item.description ?? '',
        desc:     item.description ?? '',
        units:    item.quantity ?? 1,
        subtotal: item.unit_price ?? 0,
        tax:      item.tax_rate ?? 0,
      };
      if (item.holded_product_id) entry['productId'] = item.holded_product_id;
      return entry;
    });

    const payload: Record<string, unknown> = {
      contactId: holdedContactId,
      date:      dateUnix,
      items:     holdedItems,
    };
    if (quote.notes) payload['notes'] = quote.notes;

    const result = await this.mutateHolded('POST', 'documents/estimate', payload);
    const holdedEstimateId = (result['id'] ?? result['_id']) as string;

    if (!holdedEstimateId) throw new Error('Holded no devolvió un ID de presupuesto');
    return holdedEstimateId;
  }
}
