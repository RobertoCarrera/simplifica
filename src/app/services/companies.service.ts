import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Company } from '../models/company';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CompaniesService {

  private apiUrl = "https://a2022.twidget.io/empresas";
  
  constructor(private http: HttpClient){}

  getCompanies(): Observable<Company[]>{
    return this.http.get<Company[]>(this.apiUrl);
  }

  createCompany(company: Company): Observable<Company> {
    return this.http.post<Company>(this.apiUrl, company);
  }

  updateCompany(companyId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${companyId}`, updateData);
  }

  deleteCompany(companyId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${companyId}`);
  }
}
