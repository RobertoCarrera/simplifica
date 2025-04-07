import { Injectable } from '@angular/core';
import { Model } from '../models/model';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
@Injectable({
  providedIn: 'root'
})
export class ModelsService {

  private apiUrl = "https://a2022.twidget.io/modelos";
  
  constructor(private http: HttpClient){}
  
  getModels(negocioId: string, marcaId?: string): Observable<Model[]>{
    let params = new HttpParams().set('negocio_id', negocioId);

    if(marcaId){
      params = params.set('marca_id', marcaId);
    }

    return this.http.get<Model[]>(this.apiUrl,{params});
  }

  createModel(model: Model): Observable<Model>{
    return this.http.post<Model>(this.apiUrl, model);
  }

  deleteModel(modelId: string): Observable<void>{
    return this.http.delete<void>(`${this.apiUrl}/${modelId}`);
  }
}