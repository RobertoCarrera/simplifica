import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, switchMap, map } from 'rxjs/operators';
import { Customer } from '../models/customer';
import { HttpClient, HttpParams} from '@angular/common/http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CustomersService {

  private apiUrl = "https://a2022.twidget.io/clientes";

  // Shared Supabase client used to enrich responses from the legacy
  // twidget backend with fields the backend does not yet expose
  // (e.g. the new RGPD consent columns added recently to the `clients`
  // table). We disable auth/session features because this client is
  // only used for read-only REST queries — keeping session storage
  // off avoids competing with the project's central SupabaseClientService
  // GoTrue instance.
  private supabase: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

  constructor(private http: HttpClient){}

  getCustomers(userId?: string): Observable<Customer[]>{
    let params = new HttpParams();
    if (userId) params = params.set('usuario_id', userId);

    return this.http.get<Customer[]>(this.apiUrl, {params});
  }

  getCustomer(customerId: string): Observable<Customer> {
    return this.http.get<Customer>(`${this.apiUrl}/${customerId}`).pipe(
      switchMap((c) => this.enrichWithConsentFields(customerId, c))
    );
  }

  /**
   * Merges the new RGPD consent fields from Supabase into the response
   * returned by the legacy twidget backend (which does not expose them).
   *
   * The merge is additive: every existing field from the backend is
   * preserved, and only the four consent columns are overwritten when
   * Supabase returns a row. If the Supabase call fails for any reason
   * (network, RLS denial, row not found) we fall back to the backend
   * response unchanged — the card still renders, just without the new
   * columns.
   */
  private enrichWithConsentFields(customerId: string, c: Customer): Observable<Customer> {
    return from(
      this.supabase
        .from('clients')
        .select('id, terms_of_service_consent, terms_of_service_consent_date, privacy_policy_consent, privacy_policy_consent_date')
        .eq('id', customerId)
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.warn('[customersService] supabase consent enrich failed:', error);
        }
        if (!error && data) {
          return {
            ...c,
            terms_of_service_consent: data.terms_of_service_consent ?? c.terms_of_service_consent,
            terms_of_service_consent_date: data.terms_of_service_consent_date ?? c.terms_of_service_consent_date ?? null,
            privacy_policy_consent: data.privacy_policy_consent ?? c.privacy_policy_consent,
            privacy_policy_consent_date: data.privacy_policy_consent_date ?? c.privacy_policy_consent_date ?? null,
          } as Customer;
        }
        return c;
      }),
      catchError((e: unknown) => {
        console.warn('[customersService] supabase consent enrich threw:', e);
        return of(c);
      })
    );
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