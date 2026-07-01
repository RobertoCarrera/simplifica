import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Inch } from '../models/inch';
import { SupabaseClientService } from './supabase-client.service';

/**
 * Screen-size (inches) catalog lookup.
 *
 * No dedicated `inches` / `screen_sizes` table exists on the current
 * Supabase schema. This service returns empty observables so consumers
 * degrade gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class InchesService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[InchesService] SupabaseClientService is unavailable');
    }
  }

  getInches(): Observable<Inch[]> {
    console.warn('[InchesService] No dedicated Supabase table for screen-size catalog; returning empty list.');
    return of([]);
  }

  createInch(inch: Inch): Observable<Inch> {
    console.warn('[InchesService] createInch ignored — no Supabase table for screen-size catalog.');
    return of({ ...inch });
  }

  updateInch(inchId: string, updateData: any): Observable<any> {
    console.warn('[InchesService] updateInch ignored — no Supabase table for screen-size catalog.');
    return of({ id: inchId, ...(updateData || {}) });
  }

  deleteInch(inchId: string): Observable<void> {
    console.warn('[InchesService] deleteInch ignored — no Supabase table for screen-size catalog.');
    return of(void 0);
  }
}
