import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Inch } from '../models/inch';

@Injectable({
  providedIn: 'root'
})
export class InchesService {

  private apiUrl = "https://a2022.twidget.io/pulgadas";
  
  constructor(private http: HttpClient){}

  getInches(): Observable<Inch[]>{
    return this.http.get<Inch[]>(this.apiUrl);
  }

  createInch(inch: Inch): Observable<Inch> {
    return this.http.post<Inch>(this.apiUrl, inch);
  }

  updateInch(inchId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${inchId}`, updateData);
  }

  deleteInch(inchId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${inchId}`);
  }
}