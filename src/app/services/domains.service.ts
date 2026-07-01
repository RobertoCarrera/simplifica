import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Domain } from '../models/domain';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class DomainsService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List domains the current user can see. The `domains` table on Supabase
   * is the canonical store; the legacy `_id` field maps to `id` and the
   * legacy `nombre` field maps to `domain`.
   */
  getDomains(): Observable<Domain[]> {
    const query = this.sbClient.instance
      .from('domains')
      .select('*')
      .order('domain', { ascending: true });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[DomainsService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToDomain(row));
      }),
      catchError((err) => {
        console.error('[DomainsService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  createDomain(domain: Domain): Observable<Domain> {
    const payload = this.domainToRow(domain);
    const query = this.sbClient.instance
      .from('domains')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[DomainsService] createDomain supabase error:', error);
          throw error;
        }
        return this.rowToDomain(data);
      }),
      catchError((err) => {
        console.error('[DomainsService] createDomain supabase threw:', err);
        throw err;
      }),
    );
  }

  updateDomain(domainId: string, updateData: any): Observable<any> {
    const payload = this.domainUpdateToRow(updateData || {});
    const query = this.sbClient.instance
      .from('domains')
      .update(payload)
      .eq('id', domainId)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[DomainsService] updateDomain supabase error:', error);
          throw error;
        }
        return data;
      }),
      catchError((err) => {
        console.error('[DomainsService] updateDomain supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Hard-delete a domain row. The legacy POST `/dominios/:id` DELETE
   * pattern is preserved but translated to a Supabase DELETE.
   */
  deleteDomain(domainId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('domains')
      .delete()
      .eq('id', domainId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[DomainsService] deleteDomain supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[DomainsService] deleteDomain supabase threw:', err);
        throw err;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private rowToDomain(row: any): Domain {
    return {
      _id: row.id,
      created_at: row.created_at || new Date().toISOString(),
      nombre: row.domain || '',
    } as Domain;
  }

  private domainToRow(domain: Partial<Domain>): any {
    const row: any = {};
    if (domain.nombre) row.domain = domain.nombre;
    return row;
  }

  private domainUpdateToRow(update: Record<string, any>): any {
    const allowed: Record<string, string> = {
      nombre: 'domain',
      is_verified: 'is_verified',
      verification_record: 'verification_record',
      dkim_record: 'dkim_record',
      spf_record: 'spf_record',
      status: 'status',
      provider: 'provider',
    };
    const out: any = {};
    for (const [k, target] of Object.entries(allowed)) {
      if (k in update) out[target] = update[k];
    }
    return out;
  }
}
