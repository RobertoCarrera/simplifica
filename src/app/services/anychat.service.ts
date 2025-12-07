import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { RuntimeConfigService } from './runtime-config.service';
import { AuthService } from './auth.service';

// ===============================
// INTERFACES DE ANYCHAT
// ===============================

export interface AnyChatContact {
  guid: string;
  name: string;
  email: string;
  phone: string | null;
  clean_phone: string | null;
  zip_code: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  company: string | null;
  lang: string;
  timezone: string;
  source: string;
  source_id: string;
  assigned_to: string | null;
  created_at: number;
  updated_at: number;
  image: string | null;
}

export interface AnyChatConversation {
  guid: string;
  contact_guid: string;
  status: 'open' | 'closed' | 'pending';
  assigned_to: string | null;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  unread_count: number;
}

export interface AnyChatMessage {
  guid: string;
  conversation_guid: string;
  contact_guid: string;
  message: string;
  type: 'text' | 'file' | 'image';
  direction: 'in' | 'out';
  created_at: number;
  read_at: number | null;
}

export interface AnyChatPaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  pages: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnyChatService {
  private http = inject(HttpClient);
  private cfg = inject(RuntimeConfigService);
  private authService = inject(AuthService);
  
  // Route through Supabase Edge Function to avoid CORS and keep API key server-side
  private readonly API_URL = (() => {
    const rc = this.cfg.get();
    const edge = (rc.edgeFunctionsBaseUrl || '').replace(/\/+$/, '');
    const supa = (rc.supabase?.url || '').replace(/\/+$/, '');
    const base = edge || (supa ? `${supa}/functions/v1` : '');
    return base ? `${base}/anychat` : '';
  })();
  private readonly API_KEY: string = '';
  private readonly USING_PROXY = !!this.API_URL && this.API_URL.includes('/anychat');

  private get conversationsEnabled(): boolean {
    const rc = this.cfg.get();
    return rc.features?.anychatConversationsEnabled === true;
  }

  /**
   * Obtiene los headers necesarios para las peticiones a AnyChat (async para obtener JWT)
   */
  private async getHeadersAsync(): Promise<HttpHeaders> {
    // Base headers
    let headers = new HttpHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' });

    // When proxying via Supabase Edge Function, use user's JWT token for authentication
    const rc = this.cfg.get();
    if (this.USING_PROXY && rc.supabase?.anonKey) {
      // Get current user's JWT token from session
      const { data: { session } } = await this.authService.client.auth.getSession();
      const token = session?.access_token || rc.supabase.anonKey;
      
      headers = headers
        .set('Authorization', `Bearer ${token}`)
        .set('apikey', rc.supabase.anonKey)
        .set('x-client-info', 'simplifica-anychat');
    }

    // If NOT proxying and we have a direct AnyChat API key (not recommended for browser), include it
    if (!this.USING_PROXY && this.API_KEY) {
      headers = headers.set('x-api-key', this.API_KEY);
    }

    return headers;
  }

  /**
   * Genera los headers necesarios para las peticiones a AnyChat (sync fallback)
   * @deprecated Use getHeadersAsync() instead
   */
  private getHeaders(): HttpHeaders {
    // Base headers
    let headers = new HttpHeaders({ 'Content-Type': 'application/json', 'Accept': 'application/json' });

    // When proxying via Supabase Edge Function, include Authorization so the gateway doesn't 401
    const rc = this.cfg.get();
    if (this.USING_PROXY && rc.supabase?.anonKey) {
      headers = headers
        .set('Authorization', `Bearer ${rc.supabase.anonKey}`)
        .set('apikey', rc.supabase.anonKey)
        .set('x-client-info', 'simplifica-anychat');
    }

    // If NOT proxying and we have a direct AnyChat API key (not recommended for browser), include it
    if (!this.USING_PROXY && this.API_KEY) {
      headers = headers.set('x-api-key', this.API_KEY);
    }

    return headers;
  }

  /**
   * Helper: Try multiple endpoint candidates sequentially until one succeeds
   */
  private requestWithFallback<T>(
    method: 'GET' | 'POST' | 'PUT',
    urls: string[],
    body?: any
  ): Observable<T> {
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => {
        const tryAt = (i: number): Observable<T> => {
          if (i >= urls.length) {
            return throwError(() => new Error('All AnyChat endpoint candidates failed (404/400)'));
          }
          const url = urls[i];
          const req$ = method === 'GET'
            ? this.http.get<T>(url, { headers })
            : method === 'POST'
              ? this.http.post<T>(url, body ?? {}, { headers })
              : this.http.put<T>(url, body ?? {}, { headers });
          return req$.pipe(
            catchError((err) => {
              if (err?.status === 404 || err?.status === 400) {
                // Log diagnostic info and try the next candidate path
                try {
                  console.warn('[AnyChat] Endpoint candidate failed:', {
                    url,
                    status: err?.status,
                    error: err?.error || err?.message
                  });
                } catch {}
                return tryAt(i + 1);
              }
              return this.handleError(err);
            })
          );
        };
        return tryAt(0);
      })
    );
  }

  /**
   * Maneja errores de la API
   */
  private handleError(error: any): Observable<never> {
    console.error('❌ AnyChat API Error:', error);
    
    let errorMessage = 'Error desconocido en AnyChat API';
    
    if (error.error instanceof ErrorEvent) {
      // Error del lado del cliente
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Error del lado del servidor
      errorMessage = `Error ${error.status}: ${error.message}`;
    }
    
    return throwError(() => new Error(errorMessage));
  }

  // ===============================
  // CONTACTOS
  // ===============================

  /**
   * Obtiene la lista de contactos
   */
  getContacts(page: number = 1, limit: number = 20): Observable<AnyChatPaginatedResponse<AnyChatContact>> {
    if (!this.USING_PROXY) {
      return throwError(() => new Error('CORS: configure EDGE_FUNCTIONS_BASE_URL or SUPABASE_URL to route AnyChat via Edge Function'));
    }

    const url = `${this.API_URL}/contact?page=${page}&limit=${limit}`;
    
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => this.http.get<AnyChatPaginatedResponse<AnyChatContact>>(url, { headers })),
      catchError((error) => {
        // Manejo específico de errores CORS/origin
        if (error.status === 0 || error.status === 403) {
          console.error('❌ Error CORS/Origen no permitido para AnyChat');
          return throwError(() => new Error('Error CORS: Verifica la configuración de AnyChat API'));
        }
        return this.handleError(error);
      })
    );
  }

  /**
   * Busca un contacto por email
   */
  searchContactByEmail(email: string): Observable<AnyChatPaginatedResponse<AnyChatContact>> {
    if (!this.USING_PROXY) {
      return throwError(() => new Error('CORS: configure EDGE_FUNCTIONS_BASE_URL or SUPABASE_URL to route AnyChat via Edge Function'));
    }

    const url = `${this.API_URL}/contact/search?email=${encodeURIComponent(email)}`;
    
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => this.http.get<AnyChatPaginatedResponse<AnyChatContact>>(url, { headers })),
      catchError((error) => {
        if (error.status === 0 || error.status === 403) {
          console.error('❌ Error CORS/Origen no permitido para AnyChat');
          return throwError(() => new Error('Error CORS: Verifica la configuración de AnyChat API'));
        }
        return this.handleError(error);
      })
    );
  }

  /**
   * Obtiene información de un contacto específico
   */
  getContact(contactId: string): Observable<AnyChatContact> {
    const url = `${this.API_URL}/contact/${contactId}`;
    
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => this.http.get<AnyChatContact>(url, { headers })),
      catchError(this.handleError)
    );
  }

  /**
   * Crea un nuevo contacto
   */
  createContact(contact: Partial<AnyChatContact>): Observable<AnyChatContact> {
    const url = `${this.API_URL}/contact`;
    
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => this.http.post<AnyChatContact>(url, contact, { headers })),
      catchError(this.handleError)
    );
  }

  /**
   * Actualiza un contacto existente
   */
  updateContact(contactId: string, contact: Partial<AnyChatContact>): Observable<AnyChatContact> {
    const url = `${this.API_URL}/contact/${contactId}`;
    
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => this.http.put<AnyChatContact>(url, contact, { headers })),
      catchError(this.handleError)
    );
  }

  // ===============================
  // CONVERSACIONES (PREPARADO PARA FUTURA IMPLEMENTACIÓN)
  // ===============================

  /**
   * Obtiene las conversaciones (chats)
   */
  getConversations(page: number = 1, limit: number = 20): Observable<AnyChatPaginatedResponse<AnyChatConversation>> {
    if (!this.conversationsEnabled) {
      return throwError(() => new Error('Conversaciones deshabilitadas: endpoints no disponibles aún en AnyChat API'));
    }
    // Try a few resource name variants to avoid 404s across API versions
    const candidates = [
      // Prefer documented chat collection endpoint
      `${this.API_URL}/chat?page=${page}&limit=${limit}`,
      `${this.API_URL}/chats?page=${page}&limit=${limit}`,
      `${this.API_URL}/conversation?page=${page}&limit=${limit}`,
    ];
    return this.requestWithFallback<AnyChatPaginatedResponse<AnyChatConversation>>('GET', candidates)
      .pipe(
        catchError((err) => {
          // Fallback: build a pseudo-conversations list from contacts if conversations API is unavailable
          return this.getContacts(page, limit).pipe(
            map((res) => {
              const mapped: AnyChatPaginatedResponse<AnyChatConversation> = {
                data: (res.data || []).map((c) => ({
                  guid: c.guid,
                  contact_guid: c.guid,
                  status: 'open' as any,
                  assigned_to: null,
                  created_at: c.created_at,
                  updated_at: c.updated_at,
                  last_message_at: c.updated_at,
                  unread_count: 0,
                })),
                page: res.page,
                limit: res.limit,
                pages: res.pages,
                total: res.total,
              };
              return mapped;
            })
          );
        })
      );
  }

  /** Obtiene los mensajes de una conversación */
  getMessages(conversationId: string, page: number = 1, limit: number = 50): Observable<AnyChatPaginatedResponse<AnyChatMessage>> {
    if (!this.conversationsEnabled) {
      return throwError(() => new Error('Mensajes deshabilitados: endpoints no disponibles aún en AnyChat API'));
    }
    // Prefer RESTful form per diagnostics: GET /chat/{chat_guid}/message
    const offset = Math.max(0, (page - 1) * limit);
    const defaultLimit = 20; // try API default if limit rejected
    const candidates = [
      // Primary RESTful path
      `${this.API_URL}/chat/${encodeURIComponent(conversationId)}/message?page=${page}&limit=${limit}`,
      `${this.API_URL}/chat/${encodeURIComponent(conversationId)}/message?limit=${limit}`,
      `${this.API_URL}/chat/${encodeURIComponent(conversationId)}/message?offset=${offset}&limit=${limit}`,
      `${this.API_URL}/chat/${encodeURIComponent(conversationId)}/message`,
      // Alternate resource name variants
      `${this.API_URL}/conversation/${encodeURIComponent(conversationId)}/message?page=${page}&limit=${limit}`,
      `${this.API_URL}/conversation/${encodeURIComponent(conversationId)}/message`,
      `${this.API_URL}/chats/${encodeURIComponent(conversationId)}/message?page=${page}&limit=${limit}`,
      // Query-based fallbacks seen in some docs
      `${this.API_URL}/chat/message?chat_guid=${encodeURIComponent(conversationId)}&page=${page}&limit=${limit}`,
      `${this.API_URL}/chat/message?chat_guid=${encodeURIComponent(conversationId)}&limit=${limit}`,
      `${this.API_URL}/chat/message?chat_guid=${encodeURIComponent(conversationId)}&offset=${offset}&limit=${limit}`,
      `${this.API_URL}/chat/message?chatGuid=${encodeURIComponent(conversationId)}&page=${page}&limit=${limit}`,
      `${this.API_URL}/chat/message?guid=${encodeURIComponent(conversationId)}&page=${page}&limit=${limit}`,
      `${this.API_URL}/chat/message?chat_id=${encodeURIComponent(conversationId)}&page=${page}&limit=${limit}`,
      `${this.API_URL}/chat/message?chat=${encodeURIComponent(conversationId)}&page=${page}&limit=${limit}`,
      `${this.API_URL}/chat/message?chat_guid=${encodeURIComponent(conversationId)}`,
      // Final fallback listing via generic message resource
      `${this.API_URL}/message?conversation_guid=${encodeURIComponent(conversationId)}&page=${page}&limit=${limit}`,
    ];
    return this.requestWithFallback<AnyChatPaginatedResponse<AnyChatMessage>>('GET', candidates);
  }

  /** Envía un mensaje a una conversación */
  sendMessage(conversationId: string, message: string): Observable<AnyChatMessage> {
    if (!this.conversationsEnabled) {
      return throwError(() => new Error('Enviar mensajes deshabilitado: endpoints no disponibles aún en AnyChat API'));
    }
    // Prefer RESTful form first: POST /chat/{chat_guid}/message with body { message }
    const body = { message };
    const primary = [`${this.API_URL}/chat/${encodeURIComponent(conversationId)}/message`];
    const secondary = [
      `${this.API_URL}/conversation/${encodeURIComponent(conversationId)}/message`,
      `${this.API_URL}/chats/${encodeURIComponent(conversationId)}/message`,
    ];
    return this.requestWithFallback<AnyChatMessage>('POST', primary, body).pipe(
      catchError(() => this.requestWithFallback<AnyChatMessage>('POST', secondary, body)),
      catchError(() => {
        // Fallback to legacy query-based endpoint: POST /chat/message { chat_guid, message }
        const legacyUrl = `${this.API_URL}/chat/message`;
        const legacyBody = { chat_guid: conversationId, message } as any;
        return this.requestWithFallback<AnyChatMessage>('POST', [legacyUrl], legacyBody);
      }),
      catchError(() => {
        // Final fallback: generic message creation
        const finalUrl = `${this.API_URL}/message`;
        const finalBody = { chat_guid: conversationId, message } as any;
        return this.requestWithFallback<AnyChatMessage>('POST', [finalUrl], finalBody);
      })
    );
  }

  /**
   * Marca un mensaje como leído
   * NOTA: Endpoint pendiente de documentación en AnyChat API
   */
  markAsRead(messageId: string): Observable<void> {
    const url = `${this.API_URL}/message/${messageId}/read`;
    
    return from(this.getHeadersAsync()).pipe(
      switchMap(headers => this.http.put<void>(url, {}, { headers })),
      catchError(this.handleError)
    );
  }
}
