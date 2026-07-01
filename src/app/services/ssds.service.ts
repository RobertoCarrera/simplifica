import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Ssd } from '../models/ssd';
import { SupabaseClientService } from './supabase-client.service';

/**
 * SSD catalog lookup.
 *
 * No dedicated `ssds` table exists on the current Supabase schema.
 * This service returns empty observables so consumers degrade
 * gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class SsdsService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[SsdsService] SupabaseClientService is unavailable');
    }
  }

  getSSDs(): Observable<Ssd[]> {
    console.warn('[SsdsService] No dedicated Supabase table for SSD catalog; returning empty list.');
    return of([]);
  }

  createSsd(ssd: Ssd): Observable<Ssd> {
    console.warn('[SsdsService] createSsd ignored — no Supabase table for SSD catalog.');
    return of({ ...ssd });
  }

  updateSsd(ssdId: string, updateData: any): Observable<any> {
    console.warn('[SsdsService] updateSsd ignored — no Supabase table for SSD catalog.');
    return of({ id: ssdId, ...(updateData || {}) });
  }

  deleteSsd(ssdId: string): Observable<void> {
    console.warn('[SsdsService] deleteSsd ignored — no Supabase table for SSD catalog.');
    return of(void 0);
  }
}
