import { Injectable } from '@angular/core';
import { Hhd } from '../models/hhd';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class HhdsService {

  private apiUrl = "https://a2022.twidget.io/hhds";
  
  constructor(private http: HttpClient){}

  getHHDs(): Observable<Hhd[]>{
    return this.http.get<Hhd[]>(this.apiUrl);
  }

  createHhd(hhd: Hhd): Observable<Hhd> {
    return this.http.post<Hhd>(this.apiUrl, hhd);
  }

  updateHhd(hhdId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${hhdId}`, updateData);
  }

  deleteHhd(hhdId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${hhdId}`);
  }
}