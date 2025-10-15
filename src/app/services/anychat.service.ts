import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

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
  
  private readonly API_URL = 'https://api.anychat.one/public/v1';
  private readonly API_KEY = environment.anychatApiKey;

  /**
   * Genera los headers necesarios para las peticiones a AnyChat
   */
  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'x-api-key': this.API_KEY,
      'Content-Type': 'application/json'
    });
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
    const url = `${this.API_URL}/contact?page=${page}&limit=${limit}`;
    
    return this.http.get<AnyChatPaginatedResponse<AnyChatContact>>(url, { 
      headers: this.getHeaders() 
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Busca un contacto por email
   */
  searchContactByEmail(email: string): Observable<AnyChatPaginatedResponse<AnyChatContact>> {
    const url = `${this.API_URL}/contact/search?email=${encodeURIComponent(email)}`;
    
    return this.http.get<AnyChatPaginatedResponse<AnyChatContact>>(url, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Obtiene información de un contacto específico
   */
  getContact(contactId: string): Observable<AnyChatContact> {
    const url = `${this.API_URL}/contact/${contactId}`;
    
    return this.http.get<AnyChatContact>(url, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Crea un nuevo contacto
   */
  createContact(contact: Partial<AnyChatContact>): Observable<AnyChatContact> {
    const url = `${this.API_URL}/contact`;
    
    return this.http.post<AnyChatContact>(url, contact, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Actualiza un contacto existente
   */
  updateContact(contactId: string, contact: Partial<AnyChatContact>): Observable<AnyChatContact> {
    const url = `${this.API_URL}/contact/${contactId}`;
    
    return this.http.put<AnyChatContact>(url, contact, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  // ===============================
  // CONVERSACIONES (PREPARADO PARA FUTURA IMPLEMENTACIÓN)
  // ===============================

  /**
   * Obtiene las conversaciones
   * NOTA: Endpoint pendiente de documentación en AnyChat API
   */
  getConversations(page: number = 1, limit: number = 20): Observable<AnyChatPaginatedResponse<AnyChatConversation>> {
    const url = `${this.API_URL}/conversation?page=${page}&limit=${limit}`;
    
    return this.http.get<AnyChatPaginatedResponse<AnyChatConversation>>(url, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Obtiene los mensajes de una conversación
   * NOTA: Endpoint pendiente de documentación en AnyChat API
   */
  getMessages(conversationId: string, page: number = 1, limit: number = 50): Observable<AnyChatPaginatedResponse<AnyChatMessage>> {
    const url = `${this.API_URL}/conversation/${conversationId}/message?page=${page}&limit=${limit}`;
    
    return this.http.get<AnyChatPaginatedResponse<AnyChatMessage>>(url, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Envía un mensaje a una conversación
   * NOTA: Endpoint pendiente de documentación en AnyChat API
   */
  sendMessage(conversationId: string, message: string): Observable<AnyChatMessage> {
    const url = `${this.API_URL}/conversation/${conversationId}/message`;
    
    return this.http.post<AnyChatMessage>(url, { message }, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Marca un mensaje como leído
   * NOTA: Endpoint pendiente de documentación en AnyChat API
   */
  markAsRead(messageId: string): Observable<void> {
    const url = `${this.API_URL}/message/${messageId}/read`;
    
    return this.http.put<void>(url, {}, {
      headers: this.getHeaders()
    }).pipe(
      catchError(this.handleError)
    );
  }
}
