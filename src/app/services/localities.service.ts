import { Injectable } from '@angular/core';
import { Locality } from '../models/locality';
import { Observable, from, of, throwError } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';

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

  createLocality(locality: Partial<Locality> | any): Observable<Locality> {
    // Accept both app-model keys and DB-style keys from caller
    const nameRaw = (locality as any)?.nombre ?? (locality as any)?.name ?? '';
    const provinceRaw = (locality as any)?.provincia ?? (locality as any)?.province ?? '';
    const countryRaw = (locality as any)?.comarca ?? (locality as any)?.country ?? '';
    const cpRaw = (locality as any)?.CP ?? (locality as any)?.postal_code ?? (locality as any)?.cp ?? '';

    const name = (nameRaw || '').toString().trim();
    const province = (provinceRaw || '').toString().trim();
    const country = (countryRaw || '').toString().trim();
    const normalizedCP = (cpRaw || '').toString().replace(/\D+/g, '').trim();

    // Quick client-side validation to match Edge Function strict contract
    if (!name || !normalizedCP) {
      return throwError(() => ({ type: 'VALIDATION_ERROR', message: 'Faltan campos obligatorios: nombre y CP', details: { required: ['nombre', 'CP'] } }));
    }

    const payload: any = {
      name: name,
      province: province || null,
      country: country || null,
      postal_code: normalizedCP
    };

    // Option A: If configured, call server-side Edge Function which uses service_role
    if (environment.useEdgeCreateLocality) {
      const url = (environment.edgeFunctionsBaseUrl || '').replace(/\/+$/, '') + '/create-locality';
      const body = {
        p_name: payload.name,
        p_province: payload.province,
        p_country: payload.country,
        p_postal_code: payload.postal_code
      };
      return from(this.sbClient.instance.auth.getSession()).pipe(
        switchMap(async (sessionRes: any) => {
          const accessToken = sessionRes?.data?.session?.access_token || null;
          const headers: any = { 'Content-Type': 'application/json' };
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
          const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
          const json = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            const msg = json?.error || json?.message || 'Edge function error';
            throw { type: 'EDGE_ERROR', message: msg, original: json, status: resp.status };
          }
          const row = json?.result || json?.data || json;
          const picked = Array.isArray(row) ? row[0] : row;
          return {
            _id: picked.id,
            created_at: picked.created_at,
            nombre: picked.name,
            comarca: picked.country || '',
            provincia: picked.province || '',
            CP: picked.postal_code || ''
          } as Locality;
        })
      );
    }

    // First attempt: call RPC `insert_or_get_locality` if available (preferred)
    return from(this.sbClient.instance.rpc('insert_or_get_locality', {
      p_name: payload.name,
      p_province: payload.province,
      p_country: payload.country,
      p_postal_code: payload.postal_code
    })).pipe(
      switchMap((rpcRes: any) => {
        // Supabase rpc returns { data, error } depending on client version
        if (rpcRes && !rpcRes.error) {
          const r = rpcRes.data || rpcRes; // older clients sometimes return data directly
          // If RPC returned an array (unknown shape) attempt to pick first
          const row = Array.isArray(r) ? r[0] : r;
          if (row) {
            return of({
              _id: row.id,
              created_at: row.created_at,
              nombre: row.name,
              comarca: row.country || '',
              provincia: row.province || '',
              CP: row.postal_code || ''
            } as Locality);
          }
        }

        // If RPC returned an error, inspect it. If it's a 404 the function likely isn't deployed.
        const rpcErr = rpcRes && rpcRes.error ? rpcRes.error : null;
        if (rpcErr) {
          const m = (rpcErr.message || '').toLowerCase();
          // RPC not found (404) -> inform developer to run migration
          const isNotFound = rpcErr.status === 404 || m.includes('not found') || m.includes('could not find');
          if (isNotFound) {
            throw {
              type: 'RPC_NOT_FOUND',
              message: 'RPC insert_or_get_locality not found in the database. Run the migration `database/06-insert-or-get-locality.sql` in your Supabase project to create it.',
              original: rpcErr
            };
          }

          // If RPC error looks like RLS/permission denial, propagate an actionable RLS error
          const isRls = m.includes('row-level security') || m.includes('forbidden') || rpcErr.status === 403 || rpcErr.code === '42501';
          if (isRls) {
            throw {
              type: 'RLS_ERROR',
              message: 'RPC call denied due to row-level security or permissions. Ensure the RPC exists and is granted to authenticated, or call it from a server-side function. See SUPABASE_RLS_LOCALITIES.md',
              original: rpcErr
            };
          }
        }

        // RPC didn't give us a result; fall back to direct insert (keeps previous behavior)
        return from(this.sbClient.instance.from('localities').insert(payload).select().single()).pipe(
          switchMap((res: any) => {
            if (!res.error) {
              const r = res.data;
              return of({
                _id: r.id,
                created_at: r.created_at,
                nombre: r.name,
                comarca: r.country || '',
                provincia: r.province || '',
                CP: r.postal_code || ''
              } as Locality);
            }
            const err = res.error || {};
            const message = (err.message || '').toLowerCase();
            const isRls = message.includes('row-level security') || message.includes('forbidden') || err.status === 403 || err.code === '42501';
            if (isRls) {
              throw {
                type: 'RLS_ERROR',
                message: 'Row-level security or permission prevented creating a locality. Create the locality from a server-side RPC/Edge Function or relax RLS for this operation. See SUPABASE_RLS_LOCALITIES.md for steps.',
                original: err
              };
            }

            // fallback to search by postal_code
            return from(this.sbClient.instance.from('localities').select('*').eq('postal_code', normalizedCP).maybeSingle()).pipe(
              map((r2: any) => {
                if (r2.error) throw r2.error;
                const row = r2.data;
                if (!row) throw res.error;
                return {
                  _id: row.id,
                  created_at: row.created_at,
                  nombre: row.name,
                  comarca: row.country || '',
                  provincia: row.province || '',
                  CP: row.postal_code || ''
                } as Locality;
              })
            );
          }),
          catchError((err: any) => {
            if (err && err.type === 'RLS_ERROR') throw err;
            return from(this.sbClient.instance.from('localities').select('*').eq('postal_code', normalizedCP).maybeSingle()).pipe(
              map((r2: any) => {
                if (r2.error) throw r2.error;
                const row = r2.data;
                if (!row) throw err;
                return {
                  _id: row.id,
                  created_at: row.created_at,
                  nombre: row.name,
                  comarca: row.country || '',
                  provincia: row.province || '',
                  CP: row.postal_code || ''
                } as Locality;
              }),
              catchError((finalErr: any) => {
                const isRls = finalErr && ((finalErr.message || '').toLowerCase().includes('row-level security') || finalErr.code === '42501' || finalErr.status === 403);
                if (isRls) {
                  throw {
                    type: 'RLS_ERROR',
                    message: 'Row-level security prevented creating locality. Use a server-side RPC/Edge Function with service_role or add an RPC with SECURITY DEFINER. See SUPABASE_RLS_LOCALITIES.md in the project root for exact SQL and examples.',
                    original: finalErr
                  };
                }
                throw finalErr;
              })
            );
          })
        );
      })
    );
  }

  // Helper to find locality by postal code (server-side check)
  findByPostalCode(postalCode: string): Observable<Locality | null> {
    const normalized = (postalCode || '').toString().replace(/\D+/g, '').trim();
    if (!normalized) return of(null);
    return from(this.sbClient.instance.from('localities').select('*').eq('postal_code', normalized).maybeSingle()).pipe(
      map((res: any) => {
        if (res.error) throw res.error;
        const r = res.data;
        if (!r) return null;
        return {
          _id: r.id,
          created_at: r.created_at,
          nombre: r.name,
          comarca: r.country || '',
          provincia: r.province || '',
          CP: r.postal_code || ''
        } as Locality;
      }),
      catchError(() => of(null))
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
