import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { GraphicCard } from '../models/graphic-card';
import { SupabaseClientService } from './supabase-client.service';

/**
 * Graphic-card catalog lookup.
 *
 * No dedicated `graphic_cards` table exists on the current Supabase
 * schema. This service returns empty observables so consumers
 * (dropdown lists in the product form) degrade gracefully — the user
 * sees an empty list rather than a crash.
 */
@Injectable({
  providedIn: 'root'
})
export class GraphicCardsService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[GraphicCardsService] SupabaseClientService is unavailable');
    }
  }

  getGraphicCards(): Observable<GraphicCard[]> {
    console.warn('[GraphicCardsService] No dedicated Supabase table for graphic card catalog; returning empty list.');
    return of([]);
  }

  createGraphicCard(graphicCard: GraphicCard): Observable<GraphicCard> {
    console.warn('[GraphicCardsService] createGraphicCard ignored — no Supabase table for graphic card catalog.');
    return of({ ...graphicCard });
  }

  deleteGraphicCard(graphicCardId: string): Observable<void> {
    console.warn('[GraphicCardsService] deleteGraphicCard ignored — no Supabase table for graphic card catalog.');
    return of(void 0);
  }
}
