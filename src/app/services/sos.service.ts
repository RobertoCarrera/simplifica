import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { So } from '../models/so';
import { SupabaseClientService } from './supabase-client.service';

/**
 * Operating-system (SO) catalog lookup.
 *
 * No dedicated `sos` table exists on the current Supabase schema
 * (operating system info is now captured as a free-text
 * `operating_system` column on `devices`). This service returns empty
 * observables so consumers degrade gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class SosService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[SosService] SupabaseClientService is unavailable');
    }
  }

  getSOs(isApple: string): Observable<So[]> {
    console.warn('[SosService] No dedicated Supabase table for OS catalog; returning empty list.');
    return of([]);
  }

  createSO(so: So): Observable<So> {
    console.warn('[SosService] createSO ignored — no Supabase table for OS catalog.');
    return of({ ...so });
  }

  deleteSO(soId: string): Observable<void> {
    console.warn('[SosService] deleteSO ignored — no Supabase table for OS catalog.');
    return of(void 0);
  }
}
