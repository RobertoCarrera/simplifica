import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Locality } from '../models/locality';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LocalitiesService {

  private apiUrl = "https://a2022.twidget.io/localidades";
  
  constructor(private http: HttpClient){}

  getLocalities(): Observable<Locality[]>{
    return this.http.get<Locality[]>(this.apiUrl);
  }

  createLocality(locality: Locality): Observable<Locality> {
    return this.http.post<Locality>(this.apiUrl, locality);
  }

  updateLocality(localityId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${localityId}`, updateData);
  }

  deleteLocality(localityId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${localityId}`);
  }
}
