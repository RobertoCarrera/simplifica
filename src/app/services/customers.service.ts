import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Customer } from '../models/customer';
import { HttpClient, HttpParams} from '@angular/common/http';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class CustomersService {

  private apiUrl = "https://a2022.twidget.io/clientes";

  constructor(
    private http: HttpClient,
    private sbClient: SupabaseClientService,
  ) {}

  getCustomers(userId?: string): Observable<Customer[]>{
    let params = new HttpParams();
    if (userId) params = params.set('usuario_id', userId);

    return this.http.get<Customer[]>(this.apiUrl, {params});
  }

  /**
   * Read the client row directly from Supabase — source of truth.
   *
   * The legacy twidget backend (https://a2022.twidget.io/clientes/{id}) is
   * out of scope for changes and does not expose the new RGPD consent
   * columns added to the `clients` table (terms_of_service_consent,
   * privacy_policy_consent, marketing_consent, etc.). Rather than chain
   * tweet.io → BFF enrichment, we skip tweet.io entirely and read the
   * full row from Supabase. The Supabase RLS policies on `clients`
   * already allow the authenticated CRM user to read these rows, so the
   * shared anon/publishable key client is sufficient — no service-role
   * key is required for this read.
   *
   * Falls back to `null` on any error (RLS denial, row not found, network)
   * so the component's existing error path is triggered and the user
   * sees "Cliente no encontrado" instead of a broken card.
   */
  getCustomer(customerId: string): Observable<Customer> {
    const query = this.sbClient.instance
      .from('clients')
      // Keep the relations cheap: only what the profile card reads.
      // The component also reads `clients_tags` and `direccion`, so we
      // join those exactly like SupabaseCustomersService.getCustomer does.
      .select('*, clients_tags(global_tags(*)), direccion:addresses(*, localidad:localities(*))')
      .eq('id', customerId)
      .maybeSingle();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[customersService] supabase getCustomer failed:', error);
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
        console.error('[customersService] supabase getCustomer threw:', err);
        return of(null);
      }),
    );
  }

  /**
   * Minimal DB-row → Customer mapping. The shared Supabase client returns
   * snake_case columns and the joined relations the component template
   * already understands, so we mostly just rename / compute the few
   * fields the legacy `toCustomerFromClient` transformer handled in
   * `SupabaseCustomersService`. We intentionally do NOT call that
   * transformer (it lives in a different service and pulls in fields
   * the legacy card never used, e.g. GDPR access counters).
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
      // `direccion` comes pre-joined (see the `.select(...)` above). Map
      // the DB column `direccion` on the address row to the model's
      // `nombre` field so the address block in the template renders.
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

  createCustomer(customer: Customer): Observable<Customer> {
    return this.http.post<Customer>(this.apiUrl, customer);
  }

  updateCustomer(customerId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${customerId}`, updateData);
  }

  deleteCustomer(customerId: string | number): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${customerId}`);
  }

  searchCustomers(query: string): Observable<Customer[]> {
    const params = new HttpParams().set('q', query);
    return this.http.get<Customer[]>(`${this.apiUrl}/search`, { params });
  }
}