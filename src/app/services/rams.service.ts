import { Injectable } from '@angular/core';
import { Ram } from '../models/ram';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class RamsService {

  private apiUrl = "https://a2022.twidget.io/rams";
  
  constructor(private http: HttpClient){}

  getRAMs(): Observable<Ram[]>{
    return this.http.get<Ram[]>(this.apiUrl);
  }

  createRam(ram: Ram): Observable<Ram> {
    return this.http.post<Ram>(this.apiUrl, ram);
  }

  updateRam(ramId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${ramId}`, updateData);
  }

  deleteRam(ramId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${ramId}`);
  }
}