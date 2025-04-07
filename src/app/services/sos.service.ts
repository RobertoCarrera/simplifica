import { Injectable } from '@angular/core';
import { So } from '../models/so';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class SosService {

  private apiUrl = "https://a2022.twidget.io/sos";
  
  constructor(private http: HttpClient){}
  
  getSOs(isApple: string): Observable<So[]>{
    let params = new HttpParams().set('esApple', isApple);

    return this.http.get<So[]>(this.apiUrl,{params});
  }

  createSO(so: So): Observable<So>{
    return this.http.post<So>(this.apiUrl, so);
  }

  deleteSO(soId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${soId}`);
  }
}