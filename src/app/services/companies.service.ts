import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Company } from '../models/company';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class CompaniesService {

  constructor(private sbClient: SupabaseClientService) {}

  /**
   * List active companies (filtered by `deleted_at IS NULL`).
   * The `companies` table is the canonical store; legacy fields that don't
   * exist in the new schema (`cif`, `telefono`, `email`, `fecha_alta`,
   * `favicon`, `direccion_id`) are returned as `undefined` so consumers
   * can keep the existing `Company` interface.
   */
  getCompanies(): Observable<Company[]> {
    const query = this.sbClient.instance
      .from('companies')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CompaniesService] supabase error:', error);
          return [];
        }
        return (data || []).map((row) => this.rowToCompany(row));
      }),
      catchError((err) => {
        console.error('[CompaniesService] supabase threw:', err);
        return of([]);
      }),
    );
  }

  /**
   * Insert a new company. Strips fields that don't exist on the new schema
   * before posting to Supabase.
   */
  createCompany(company: Company): Observable<Company> {
    const payload = this.companyToRow(company);
    const query = this.sbClient.instance
      .from('companies')
      .insert(payload)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CompaniesService] createCompany supabase error:', error);
          throw error;
        }
        return this.rowToCompany(data);
      }),
      catchError((err) => {
        console.error('[CompaniesService] createCompany supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Patch a company row by id with the supplied update payload. Fields that
   * don't exist on the new schema are silently dropped.
   */
  updateCompany(companyId: string, updateData: any): Observable<any> {
    const payload = this.companyUpdateToRow(updateData || {});
    const query = this.sbClient.instance
      .from('companies')
      .update(payload)
      .eq('id', companyId)
      .select('*')
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('[CompaniesService] updateCompany supabase error:', error);
          throw error;
        }
        return data;
      }),
      catchError((err) => {
        console.error('[CompaniesService] updateCompany supabase threw:', err);
        throw err;
      }),
    );
  }

  /**
   * Soft-delete a company (set `deleted_at = now()`).
   */
  deleteCompany(companyId: string): Observable<void> {
    const query = this.sbClient.instance
      .from('companies')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', companyId);

    return from(query).pipe(
      map(({ error }) => {
        if (error) {
          console.error('[CompaniesService] deleteCompany supabase error:', error);
          throw error;
        }
        return void 0;
      }),
      catchError((err) => {
        console.error('[CompaniesService] deleteCompany supabase threw:', err);
        throw err;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private rowToCompany(row: any): Company {
    return {
      _id: row.id,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      nombre: row.name,
      direccion_id: undefined as any,
      cif: row.nif || '',
      telefono: '',
      email: '',
      fecha_alta: row.created_at ? new Date(row.created_at) : new Date(),
      favicon: null,
      usuario_id: row.id,
    } as Company;
  }

  private companyToRow(company: Partial<Company>): any {
    const row: any = {};
    if (company.nombre) row.name = company.nombre;
    if (company.cif) row.nif = company.cif;
    return row;
  }

  private companyUpdateToRow(update: Record<string, any>): any {
    const allowed: Record<string, string> = {
      nombre: 'name',
      cif: 'nif',
      website: 'website',
      logo_url: 'logo_url',
    };
    const out: any = {};
    for (const [k, target] of Object.entries(allowed)) {
      if (k in update) out[target] = update[k];
    }
    return out;
  }
}
