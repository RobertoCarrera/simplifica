import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Domain } from '../models/domain';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DomainsService {

  private apiUrl = "https://a2022.twidget.io/dominios";
  
  constructor(private http: HttpClient){}

  getDomains(): Observable<Domain[]>{
    return this.http.get<Domain[]>(this.apiUrl);
  }

  createDomain(domain: Domain): Observable<Domain> {
    return this.http.post<Domain>(this.apiUrl, domain);
  }

  updateDomain(domainId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${domainId}`, updateData);
  }

  deleteDomain(domainId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${domainId}`);
  }
}
