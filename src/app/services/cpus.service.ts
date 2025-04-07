import { Injectable } from '@angular/core';
import { Cpu } from '../models/cpu';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class CpusService {

  private apiUrl = "https://a2022.twidget.io/cpus";
  
  constructor(private http: HttpClient){}

  getCPUs(): Observable<Cpu[]>{
    return this.http.get<Cpu[]>(this.apiUrl);
  }

  createCpu(cpu: Cpu): Observable<Cpu> {
    return this.http.post<Cpu>(this.apiUrl, cpu);
  }

  updateCpu(cpuId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${cpuId}`, updateData);
  }

  deleteCpu(cpuId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${cpuId}`);
  }
}
