import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { GraphicCard } from '../models/graphic-card';

@Injectable({
  providedIn: 'root'
})
export class GraphicCardsService {

  private apiUrl = "https://a2022.twidget.io/graficas";
  
  constructor(private http: HttpClient){}
  
  getGraphicCards(): Observable<GraphicCard[]>{
    return this.http.get<GraphicCard[]>(this.apiUrl);
  }

  createGraphicCard(graphicCard: GraphicCard): Observable<GraphicCard>{
    return this.http.post<GraphicCard>(this.apiUrl, graphicCard);
  }

  deleteGraphicCard(graphicCardId: string): Observable<void>{
    return this.http.delete<void>(this.apiUrl);
  }
}
