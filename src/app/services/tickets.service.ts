import { Injectable } from '@angular/core';
import { Ticket } from '../models/ticket';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class TicketsService {

  private apiUrl = "https://a2022.twidget.io/tickets";
  
  constructor(private http: HttpClient){}
  
  getTickets(): Observable<Ticket[]>{
    return this.http.get<Ticket[]>(this.apiUrl);
  }

  createTicket(ticket: Ticket): Observable<Ticket>{
    return this.http.post<Ticket>(this.apiUrl, ticket);
  }

  deleteTicket(serviceId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${serviceId}`);
  }
}
