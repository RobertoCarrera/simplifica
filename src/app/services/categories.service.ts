import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Category } from '../models/category';

@Injectable({
  providedIn: 'root'
})
export class CategoriesService {
  
  private apiUrl = "https://a2022.twidget.io/categias";
  
  constructor(private http: HttpClient){}

  getCategories(): Observable<Category[]>{
    return this.http.get<Category[]>(this.apiUrl);
  }

  createCategory(category: Category): Observable<Category> {
    return this.http.post<Category>(this.apiUrl, category);
  }

  updateCategory(categoryId: string, updateData: any): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${categoryId}`, updateData);
  }

  deleteCategory(categoryId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${categoryId}`);
  }
}
