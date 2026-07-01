import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Work } from '../models/work';
import { SupabaseClientService } from './supabase-client.service';

/**
 * Work (job catalog) lookup.
 *
 * The new schema has `services` for billing/service offerings, but
 * there is no dedicated `works` table — labor items are represented as
 * `services` with a labour-type category. Until a migration maps
 * legacy works to the new `services` table, this service returns empty
 * observables so consumers degrade gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class WorksService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[WorksService] SupabaseClientService is unavailable');
    }
  }

  getWorks(negocioId: string): Observable<Work[]> {
    console.warn('[WorksService] No dedicated Supabase table for "works" catalog; returning empty list.');
    return of([]);
  }

  createWork(work: Work): Observable<Work> {
    console.warn('[WorksService] createWork ignored — no Supabase table for "works" catalog.');
    return of({ ...work });
  }

  updateWork(workId: string, updateData: any): Observable<any> {
    console.warn('[WorksService] updateWork ignored — no Supabase table for "works" catalog.');
    return of({ id: workId, ...(updateData || {}) });
  }

  deleteWork(workId: string): Observable<void> {
    console.warn('[WorksService] deleteWork ignored — no Supabase table for "works" catalog.');
    return of(void 0);
  }
}
