import { Injectable } from '@angular/core';
import { Ssd } from '../models/ssd';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class SsdsService {

  private apiUrl = "https://a2022.twidget.io/ssds";
  
  constructor(private http: HttpClient){}

  getSSDs(): Observable<Ssd[]>{
    return this.http.get<Ssd[]>(this.apiUrl);
  }

  createSsd(ssd: Ssd): Observable<Ssd> {
    return this.http.post<Ssd>(this.apiUrl, ssd);
  }

  updateSsd(ssdId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${ssdId}`, updateData);
  }

  deleteSsd(ssdId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${ssdId}`);
  }
}