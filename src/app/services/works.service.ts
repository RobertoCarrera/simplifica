import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Work } from '../models/work';

@Injectable({
  providedIn: 'root'
})
export class WorksService {

  private apiUrl = "https://a2022.twidget.io/trabajos";
  
  constructor(private http: HttpClient){}

  getWorks(negocioId: string): Observable<Work[]>{
    let params = new HttpParams().set('negocio_id', negocioId);
    
    return this.http.get<Work[]>(this.apiUrl, {params});
  }

  createWork(work: Work): Observable<Work> {
    return this.http.post<Work>(this.apiUrl, work);
  }

  updateWork(workId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${workId}`, updateData);
  }

  deleteWork(workId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${workId}`);
  }
}
