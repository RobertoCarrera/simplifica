import { Injectable } from '@angular/core';
import { Address } from '../models/address';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
  providedIn: 'root'
})
export class AddressesService {

  constructor(private sbClient: SupabaseClientService){}

  getAddresses(): Observable<Address[]>{
    return from(this.sbClient.instance.from('addresses').select('*')).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const rows = res.data || [];
        return rows.map((r: any) => ({
          _id: r.id,
          created_at: r.created_at,
          tipo_via: r.tipo_via || '',
          nombre: r.direccion || '',
          numero: r.numero || '',
          localidad_id: r.locality_id || '',
          localidad: r.locality || undefined
        } as Address));
      })
    );
  }

  createAddress(address: Address): Observable<Address> {
    // Map frontend Address -> DB columns. We store tipo_via+nombre into `direccion` column by default.
    const payload: any = {
      direccion: address.nombre ? `${address.tipo_via ? (address.tipo_via + ' ') : ''}${address.nombre}`.trim() : '',
      numero: address.numero || null,
      locality_id: address.localidad_id || null
    };

    return from(this.sbClient.instance.from('addresses').insert(payload).select().single()).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = res.data;
        return {
          _id: r.id,
          id: r.id,
          created_at: r.created_at,
          tipo_via: address.tipo_via || '',
          nombre: r.direccion || '',
          numero: r.numero || '',
          localidad_id: r.locality_id || ''
        } as Address;
      })
    );
  }

  updateAddress(addressId: string, updateData: any): Observable<any> {
    // Accept frontend keys (tipo_via, nombre, numero, localidad_id) or DB keys.
    const dbUpdate: any = {};
    if (updateData.nombre !== undefined || updateData.tipo_via !== undefined) {
      const nombre = updateData.nombre !== undefined ? updateData.nombre : updateData.nombre;
      const tipo = updateData.tipo_via !== undefined ? updateData.tipo_via : undefined;
      dbUpdate.direccion = `${tipo ? (tipo + ' ') : ''}${nombre || ''}`.trim();
    }
    if (updateData.numero !== undefined) dbUpdate.numero = updateData.numero;
    if (updateData.localidad_id !== undefined) dbUpdate.locality_id = updateData.localidad_id;
    // allow passing DB fields directly
    Object.assign(dbUpdate, updateData);

    return from(this.sbClient.instance.from('addresses').update(dbUpdate).eq('id', addressId).select().single()).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = res.data;
        return {
          _id: r.id,
          id: r.id,
          created_at: r.created_at,
          tipo_via: updateData.tipo_via || '',
          nombre: r.direccion || '',
          numero: r.numero || '',
          localidad_id: r.locality_id || ''
        };
      })
    );
  }

  deleteAddress(addressId: string): Observable<void>{
    return from(this.sbClient.instance.from('addresses').delete().eq('id', addressId)).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        return undefined;
      })
    );
  }
}
