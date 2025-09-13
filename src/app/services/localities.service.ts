import { Injectable } from '@angular/core';
import { Locality } from '../models/locality';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class LocalitiesService {

  constructor(private sbClient: SupabaseClientService){}

  getLocalities(): Observable<Locality[]>{
    return from(this.sbClient.instance.from('localities').select('*')).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const rows = res.data || [];
        // Map DB schema to app Locality model
        return rows.map((r: any) => ({
          _id: r.id,
          created_at: r.created_at,
          nombre: r.name,
          comarca: r.country || '',
          provincia: r.province || '',
          CP: r.postal_code || ''
        })) as Locality[];
      })
    );
  }

  createLocality(locality: Locality): Observable<Locality> {
    // Map app Locality -> DB columns
    const payload: any = {
      name: locality.nombre,
      province: locality.provincia,
      country: locality.comarca,
      postal_code: locality.CP
    };
    return from(this.sbClient.instance.from('localities').insert(payload).select().single()).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = res.data;
        return {
          _id: r.id,
          created_at: r.created_at,
          nombre: r.name,
          comarca: r.country || '',
          provincia: r.province || '',
          CP: r.postal_code || ''
        } as Locality;
      })
    );
  }

  updateLocality(localityId: string, updateData: any): Observable<any> {
    // Map updateData keys from app model to DB columns if present
    const dbUpdate: any = {};
    if (updateData.nombre !== undefined) dbUpdate.name = updateData.nombre;
    if (updateData.provincia !== undefined) dbUpdate.province = updateData.provincia;
    if (updateData.comarca !== undefined) dbUpdate.country = updateData.comarca;
    if (updateData.CP !== undefined) dbUpdate.postal_code = updateData.CP;
    // Allow passing DB-style fields directly as well
    Object.assign(dbUpdate, updateData);

    return from(this.sbClient.instance.from('localities').update(dbUpdate).eq('id', localityId).select().single()).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = res.data;
        return {
          _id: r.id,
          created_at: r.created_at,
          nombre: r.name,
          comarca: r.country || '',
          provincia: r.province || '',
          CP: r.postal_code || ''
        };
      })
    );
  }

  deleteLocality(localityId: string): Observable<void>{
    return from(this.sbClient.instance.from('localities').delete().eq('id', localityId)).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        return undefined;
      })
    );
  }
}
