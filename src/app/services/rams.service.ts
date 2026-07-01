import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Ram } from '../models/ram';
import { SupabaseClientService } from './supabase-client.service';

/**
 * RAM size catalog lookup.
 *
 * No dedicated `rams` table exists on the current Supabase schema.
 * This service returns empty observables so consumers degrade
 * gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class RamsService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[RamsService] SupabaseClientService is unavailable');
    }
  }

  getRAMs(): Observable<Ram[]> {
    console.warn('[RamsService] No dedicated Supabase table for RAM catalog; returning empty list.');
    return of([]);
  }

  createRam(ram: Ram): Observable<Ram> {
    console.warn('[RamsService] createRam ignored — no Supabase table for RAM catalog.');
    return of({ ...ram });
  }

  updateRam(ramId: string, updateData: any): Observable<any> {
    console.warn('[RamsService] updateRam ignored — no Supabase table for RAM catalog.');
    return of({ id: ramId, ...(updateData || {}) });
  }

  deleteRam(ramId: string): Observable<void> {
    console.warn('[RamsService] deleteRam ignored — no Supabase table for RAM catalog.');
    return of(void 0);
  }
}
