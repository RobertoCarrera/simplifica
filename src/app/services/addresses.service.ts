import { Injectable } from '@angular/core';
import { Address } from '../models/address';
import { Observable, from, of, throwError } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';

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

  getAddressById(addressId: string): Observable<Address | null> {
    if (!addressId) return of(null);
    return from(this.sbClient.instance.from('addresses').select('*').eq('id', addressId).maybeSingle()).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = res.data;
        if (!r) return null;
        return {
          _id: r.id,
          id: r.id,
          created_at: r.created_at,
          tipo_via: '',
          nombre: r.direccion || '',
          numero: r.numero || '',
          localidad_id: r.locality_id || ''
        } as Address;
      })
    );
  }

  // Get the most recent address for a given customer (by usuario_id)
  getLatestAddressForCustomer(customerId: string): Observable<Address | null> {
    // Deprecated semantics: addresses.usuario_id actually references auth.users.id,
    // not the clients.id. Keep this method for backward compatibility, but it will
    // typically return null unless your schema links addresses to clients directly.
    return from(
      this.sbClient.instance
        .from('addresses')
        .select('*')
        .eq('usuario_id', customerId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
    ).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
        if (!r) return null;
        return {
          _id: r.id,
          created_at: r.created_at,
          tipo_via: '',
          nombre: r.direccion || '',
          numero: r.numero || '',
          localidad_id: r.locality_id || ''
        } as Address;
      })
    );
  }

  // Preferred: get the latest address linked to the current authenticated user
  getLatestAddressForCurrentUser(): Observable<Address | null> {
    return from(this.sbClient.instance.auth.getUser()).pipe(
      mergeMap(({ data, error }: any) => {
        if (error) throw error;
        const authUserId = data?.user?.id;
        if (!authUserId) return of(null);
        return from(
          this.sbClient.instance
            .from('addresses')
            .select('*')
            .eq('usuario_id', authUserId)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
        ).pipe(
          map((res: any) => {
            if (res.error) throw res.error;
            const r = Array.isArray(res.data) && res.data.length ? res.data[0] : null;
            if (!r) return null;
            return {
              _id: r.id,
              created_at: r.created_at,
              tipo_via: '',
              nombre: r.direccion || '',
              numero: r.numero || '',
              localidad_id: r.locality_id || ''
            } as Address;
          })
        );
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

    // Prefer Edge Function first to avoid RLS 403 noise in the browser
    const base = (environment.edgeFunctionsBaseUrl || '').replace(/\/+$/, '');
    if (base) {
      const funcUrl = base + '/create-address';
      return from(this.sbClient.instance.auth.getSession()).pipe(
        mergeMap(async (sessRes: any) => {
          const accessToken = sessRes?.data?.session?.access_token || null;
          const headers: any = { 'Content-Type': 'application/json' };
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
          const body = {
            p_direccion: payload.direccion,
            p_numero: payload.numero,
            p_locality_id: payload.locality_id
          };
          const resp = await fetch(funcUrl, { method: 'POST', headers, body: JSON.stringify(body) });
          let json: any = {};
          try { json = await resp.json(); } catch(e) { json = {}; }
          if (!resp.ok) {
            if (resp.status === 403) throw { type: 'EDGE_FORBIDDEN', message: 'Edge function returned 403 Forbidden', status: 403, original: json };
            if (resp.status === 404) throw { type: 'EDGE_NOT_FOUND', message: `Edge function ${funcUrl} not found (404).`, status: 404, original: json };
            throw { type: 'EDGE_ERROR', message: json?.message || 'Edge create-address failed', status: resp.status, original: json };
          }
          const r = Array.isArray(json) ? json[0] : (json?.result || json?.data || json?.inserted?.[0] || json);
          if (!r) throw { type: 'EDGE_INVALID_RESPONSE', message: 'Edge create-address returned no address object', original: json };
          return {
            _id: r.id,
            id: r.id,
            created_at: r.created_at,
            tipo_via: address.tipo_via || '',
            nombre: r.direccion || r.address || '',
            numero: r.numero || r.number || '',
            localidad_id: r.locality_id || ''
          } as Address;
        })
      );
    }

    // Fallback: direct insert (will likely 403 under RLS)
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
