import { Injectable } from '@angular/core';
import { Cpu } from '../models/cpu';
import { Observable, of } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';

/**
 * CPU catalog lookup.
 *
 * No dedicated `cpus` table exists on the current Supabase schema
 * (`device_components` is the destination, but it's per-device and
 * currently empty for catalog options). Until a dedicated catalog is
 * provisioned, this service returns an empty observable so consumers
 * degrade gracefully.
 */
@Injectable({
  providedIn: 'root'
})
export class CpusService {

  constructor(private sbClient: SupabaseClientService) {
    if (!this.sbClient) {
      throw new Error('[CpusService] SupabaseClientService is unavailable');
    }
  }

  getCPUs(): Observable<Cpu[]> {
    console.warn('[CpusService] No dedicated Supabase table for CPU catalog; returning empty list.');
    return of([]);
  }

  createCpu(cpu: Cpu): Observable<Cpu> {
    console.warn('[CpusService] createCpu ignored — no Supabase table for CPU catalog.');
    return of({ ...cpu });
  }

  updateCpu(cpuId: string, updateData: any): Observable<any> {
    console.warn('[CpusService] updateCpu ignored — no Supabase table for CPU catalog.');
    return of({ id: cpuId, ...(updateData || {}) });
  }

  deleteCpu(cpuId: string): Observable<void> {
    console.warn('[CpusService] deleteCpu ignored — no Supabase table for CPU catalog.');
    return of(void 0);
  }
}
