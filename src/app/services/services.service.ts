import { Injectable } from '@angular/core';
import { Service } from '../models/service';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ServicesService {

  private apiUrl = "https://a2022.twidget.io/servicios";
  
  constructor(private http: HttpClient){}
  
  getServices(): Observable<Service[]>{
    return this.http.get<Service[]>(this.apiUrl);
  }

  createService(service: Service): Observable<Service>{
    return this.http.post<Service>(this.apiUrl, service);
  }

  deleteService(serviceId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${serviceId}`);
  }
}