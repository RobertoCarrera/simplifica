import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface DuplicatePair {
  id_a: string;
  name_a: string;
  surname_a: string | null;
  email_a: string | null;
  phone_a: string | null;
  created_a: string;
  is_active_a: boolean;
  id_b: string;
  name_b: string;
  surname_b: string | null;
  email_b: string | null;
  phone_b: string | null;
  created_b: string;
  is_active_b: boolean;
  match_reason: 'email_and_name' | 'email' | 'name';
}

export interface ClientMergeData {
  name: string;
  surname: string | null;
  email: string | null;
  phone: string | null;
  business_name: string | null;
  trade_name: string | null;
  notes: string | null;
}

export interface MergeResult {
  success: boolean;
  kept_id: string;
  discarded_id: string;
  reassigned: {
    bookings: number;
    invoices: number;
    quotes: number;
  };
}

@Injectable({ providedIn: 'root' })
export class DuplicateMergeService {
  private supabase: SupabaseClient;

  constructor(private sbClient: SupabaseClientService) {
    this.supabase = this.sbClient.instance;
  }

  detectDuplicates(companyId: string): Observable<DuplicatePair[]> {
    return from(
      this.supabase.rpc('detect_duplicate_clients', { p_company_id: companyId })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as DuplicatePair[]) ?? [];
      })
    );
  }

  mergeClients(
    keepId: string,
    discardId: string,
    mergedData: Partial<ClientMergeData>
  ): Observable<MergeResult> {
    return from(
      this.supabase.rpc('merge_clients', {
        p_keep_id: keepId,
        p_discard_id: discardId,
        p_merged_data: mergedData
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as MergeResult;
      })
    );
  }
}
