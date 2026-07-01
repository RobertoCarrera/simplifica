import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Customer } from '../models/customer';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class CustomersService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List active clients for the supplied `userId` (legacy `usuario_id`
   * parameter). On the new schema `userId` maps to `clients.company_id`.
   * If the value is not a valid UUID we return an empty list rather than
   * issuing a broken query.
   */
  getCustomers(userId?: string): Observable<Customer[]> {
    if (!this.isUuid(userId)) {
      return of([]);
    }
    const query = this.sbClient.instance
      .from('clients')
      .select('*')
      .eq('company_id', userId!)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CustomersService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToCustomer(row));
      }),
      catchError((err) => {
        console.error('[CustomersService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Read a single client row directly from Supabase — the source of truth
   * for the customer profile card.
   *
   * Joins `clients_tags` and `direccion` so the component template keeps
   * rendering the same fields it used to receive. Falls back to `null`
   * on any error (RLS denial, row not found, network) so the
   * component's existing "Cliente no encontrado" path is triggered.
   */
  getCustomer(customerId: string): Observable<Customer | null> {
    const query = this.sbClient.instance
      .from('clients')
      // Keep the relations cheap: only what the profile card reads.
      .select('*, clients_tags(global_tags(*)), direccion:addresses(*, localidad:localities(*))')
      .eq('id', customerId)
      .maybeSingle();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CustomersService] supabase getCustomer failed:', error);
          return null;
        }
        if (!data) {
          // Row not found in Supabase — let the component show the
          // "Cliente no encontrado" toast via its existing error path.
          return null;
        }
        return this.rowToCustomer(data);
      }),
      catchError((err) => {
        console.error('[CustomersService] supabase getCustomer threw:', err);
        return of(null);
      }),
    );
  }

  /**
   * Insert a new client row. Only fields that exist on the new schema
   * are forwarded; everything else is silently dropped.
   */
  createCustomer(customer: Customer): Observable<Customer> {
    const payload = this.customerToRow(customer);
    const query = this.sbClient.instance
      .from('clients')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CustomersService] createCustomer supabase error:', error);
          throw error;
        }
        return this.rowToCustomer(data);
      }),
      catchError((err) => {
        console.error('[CustomersService] createCustomer supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Patch a client row by id. Only fields that exist on the new schema
   * are forwarded.
   */
  updateCustomer(customerId: string, updateData: any): Observable<any> {
    const payload = this.customerUpdateToRow(updateData || {});
    const query = this.sbClient.instance
      .from('clients')
      .update(payload)
      .eq('id', customerId)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CustomersService] updateCustomer supabase error:', error);
          throw error;
        }
        return data;
      }),
      catchError((err) => {
        console.error('[CustomersService] updateCustomer supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Soft-delete a client row (set `deleted_at = now()`).
   */
  deleteCustomer(customerId: string | number): Observable<void> {
    const query = this.sbClient.instance
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', String(customerId));

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[CustomersService] deleteCustomer supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[CustomersService] deleteCustomer supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Search clients by name, surname, business name or email. The legacy
   * backend exposed `/clientes/search?q=...`; we replicate that with a
   * case-insensitive ILIKE on Supabase. Empty `query` returns `[]`.
   */
  searchCustomers(query: string): Observable<Customer[]> {
    const safe = (query || '').trim();
    if (!safe) {
      return of([]);
    }
    const escaped = safe.replace(/[%_]/g, (m) => '\\' + m);
    const pattern = `%${escaped}%`;
    const q = this.sbClient.instance
      .from('clients')
      .select('*')
      .is('deleted_at', null)
      .or(`name.ilike.${pattern},surname.ilike.${pattern},business_name.ilike.${pattern},email.ilike.${pattern}`)
      .order('created_at', { ascending: false })
      .limit(50);

    return from(q).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CustomersService] searchCustomers supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToCustomer(row));
      }),
      catchError((err) => {
        console.error('[CustomersService] searchCustomers supabase threw:', err);
        return of([]);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  /**
   * DB-row → Customer mapping. The shared Supabase client returns
   * snake_case columns and the joined relations the component template
   * already understands, so we mostly just rename / compute the few
   * fields the legacy `toCustomerFromClient` transformer used to handle.
   */
  private rowToCustomer(row: any): Customer {
    const address = this.extractAddressValue(row.address);
    return {
      ...row,
      // Map DB column `company_id` to the model field `usuario_id` that
      // every downstream component (Documents, Services, TeamAccess, …)
      // binds to.
      usuario_id: row.company_id,
      // Legacy boolean: `activo` is true when the row is not soft-deleted
      // and not explicitly deactivated.
      activo: row.is_active === false ? false : !row.deleted_at,
      // The JSONB address column is shaped `{ value: "..." }` on modern
      // rows and a plain string on legacy rows. Normalise to a string.
      address,
      // `direccion` comes pre-joined (see the `.select(...)` in
      // `getCustomer`). Map the DB column `direccion` on the address row
      // to the model's `nombre` field so the address block in the
      // template renders.
      direccion: row.direccion
        ? {
            ...row.direccion,
            nombre: row.direccion.direccion || row.direccion.nombre || '',
          }
        : null,
      // `tags` lives on the joined relation.
      tags: row.clients_tags?.map((t: any) => t.global_tags) || [],
    } as Customer;
  }

  /**
   * Normalise `clients.address` (JSONB `{ value: "..." }` or legacy string)
   * into the plain string the Customer model expects. Returns undefined
   * when no usable value is present so the template can render the "-"
   * fallback.
   */
  private extractAddressValue(raw: any): string | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (typeof raw === 'string') return raw || undefined;
    if (typeof raw === 'object' && typeof raw.value === 'string') return raw.value || undefined;
    return undefined;
  }

  private customerToRow(customer: Partial<Customer>): any {
    const row: any = {};
    if (customer.name) row.name = customer.name;
    if ((customer as any).surname) row.surname = (customer as any).surname;
    if ((customer as any).email) row.email = (customer as any).email;
    if ((customer as any).phone) row.phone = (customer as any).phone;
    if ((customer as any).business_name) row.business_name = (customer as any).business_name;
    if ((customer as any).cif_nif) row.cif_nif = (customer as any).cif_nif;
    if (customer.usuario_id && this.isUuid(customer.usuario_id)) {
      row.company_id = customer.usuario_id;
    }
    return row;
  }

  private customerUpdateToRow(update: Record<string, any>): any {
    const allowed: Record<string, string> = {
      name: 'name',
      surname: 'surname',
      email: 'email',
      phone: 'phone',
      business_name: 'business_name',
      cif_nif: 'cif_nif',
      trade_name: 'trade_name',
      legal_representative_name: 'legal_representative_name',
      legal_representative_dni: 'legal_representative_dni',
      birth_date: 'birth_date',
      language: 'language',
      status: 'status',
      source: 'source',
      website: 'website',
      industry: 'industry',
      internal_notes: 'internal_notes',
      usuario_id: 'company_id',
    };
    const out: any = {};
    for (const [k, target] of Object.entries(allowed)) {
      if (k in update) {
        if (target === 'company_id' && !this.isUuid(update[k])) continue;
        out[target] = update[k];
      }
    }
    return out;
  }

  private isUuid(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}
