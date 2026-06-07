import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ChipItem } from '../../../shared/ui/chip-autocomplete/chip-autocomplete.component';

export interface RecipientSuggestion {
  email: string;
  name: string;
  source: 'recent' | 'team' | 'customer' | 'contact';
  score: number;
}

/**
 * Servicio que llama a la RPC suggest_recipients_rpc en Supabase para
 * ofrecer autocompletado inteligente en el campo "Para" del webmail.
 *
 * Prioridad de sugerencias (definida en la RPC):
 *   1. recent   — destinatarios recientes (del folder "sent"), más frecuentes primero
 *   2. team     — miembros del equipo (misma company)
 *   3. customer — clientes con bookings en la company
 *   4. contact  — contactos de la libreta (mail_contacts)
 */
@Injectable({
  providedIn: 'root'
})
export class RecipientAutocompleteService {
  private supabase = inject(SupabaseClientService).instance;

  /**
   * Busca destinatarios sugeridos llamando a la RPC.
   *
   * @param term  Texto parcial que el usuario está escribiendo
   * @param limit Máximo de sugerencias (default 10)
   */
  suggestRecipients(term: string, limit: number = 10): Observable<ChipItem[]> {
    if (!term || term.length < 1) {
      return of([]);
    }

    const query = term.trim();

    return from(
      this.supabase.rpc('suggest_recipients_rpc', {
        p_query: query,
        p_limit: limit
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.warn('[RecipientAutocompleteService] RPC error:', error.message);
          return [];
        }
        if (!data || !Array.isArray(data)) {
          return [];
        }
        // Client-side dedup: keep first occurrence (highest score per email from SQL)
        const seen = new Set<string>();
        return (data as RecipientSuggestion[])
          .filter(s => {
            const key = s.email.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(s => this.toChipItem(s));
      }),
      catchError(err => {
        console.warn('[RecipientAutocompleteService] Unexpected error:', err);
        return of([]);
      })
    );
  }

  /**
   * Convierte una sugerencia de la RPC a ChipItem para el chip-autocomplete.
   * Muestra el source como tipo visual para que el usuario sepa de dónde viene cada sugerencia.
   */
  private toChipItem(s: RecipientSuggestion): ChipItem {
    const sourceLabelMap: Record<string, string> = {
      recent: 'Reciente',
      team: 'Equipo',
      customer: 'Cliente',
      contact: 'Contacto'
    };

    return {
      label: s.name || s.email,
      value: s.email,
      subLabel: `${s.email} · ${sourceLabelMap[s.source] || s.source}`,
      type: s.source as ChipItem['type']
    };
  }
}
