import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Hhd } from '../models/hhd';
import { SupabaseClientService } from './supabase-client.service';

/**
 * HDD catalog lookup.
 *
 * No dedicated table for HDD size options exists on the current
 * Supabase schema. This service returns empty observables so
 * consumers degrade gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class HhdsService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[HhdsService] SupabaseClientService is unavailable');
    }
  }

  getHHDs(): Observable<Hhd[]> {
    console.warn('[HhdsService] No dedicated Supabase table for HDD catalog; returning empty list.');
    return of([]);
  }

  createHhd(hhd: Hhd): Observable<Hhd> {
    console.warn('[HhdsService] createHhd ignored — no Supabase table for HDD catalog.');
    return of({ ...hhd });
  }

  updateHhd(hhdId: string, updateData: any): Observable<any> {
    console.warn('[HhdsService] updateHhd ignored — no Supabase table for HDD catalog.');
    return of({ id: hhdId, ...(updateData || {}) });
  }

  deleteHhd(hhdId: string): Observable<void> {
    console.warn('[HhdsService] deleteHhd ignored — no Supabase table for HDD catalog.');
    return of(void 0);
  }
}
