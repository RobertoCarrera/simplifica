import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Product } from '../models/product';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductsService {

  private apiUrl = "https://a2022.twidget.io/productos";
  
  constructor(private http: HttpClient){}

  getProducts(): Observable<Product[]>{
    return this.http.get<Product[]>(this.apiUrl);
  }

  createProduct(product: Product): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, product);
  }

  updateProduct(productId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${productId}`, updateData);
  }

  deleteProduct(productId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${productId}`);
  }
}
