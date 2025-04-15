import { Injectable } from '@angular/core';
import { TicketsStage } from '../models/tickets-stage';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class TicketStagesService {

  private apiUrl = "https://a2022.twidget.io/tickets_estados";
  
  constructor(private http: HttpClient){}

  getStages(): Observable<TicketsStage[]>{
    return this.http.get<TicketsStage[]>(this.apiUrl);
  }

  createStage(TicketStage: TicketsStage): Observable<TicketsStage> {
    return this.http.post<TicketsStage>(this.apiUrl, TicketStage);
  }

  updateStage(TicketStageId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${TicketStageId}`, updateData);
  }

  deleteStage(TicketStageId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${TicketStageId}`);
  }
}
