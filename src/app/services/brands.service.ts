import { Injectable } from '@angular/core';
import { Brand } from '../models/brand';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class BrandsService {

  private apiUrl = "https://a2022.twidget.io/marcas";
  
  constructor(private http: HttpClient){}
  
  getBrands(negocioId: string): Observable<Brand[]>{
    let params = new HttpParams().set('negocio_id', negocioId);

    return this.http.get<Brand[]>(this.apiUrl,{params});
  }

  createBrand(brand: Brand): Observable<Brand>{
    return this.http.post<Brand>(this.apiUrl, brand);
  }

  deleteBrand(brandId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${brandId}`);
  }
}