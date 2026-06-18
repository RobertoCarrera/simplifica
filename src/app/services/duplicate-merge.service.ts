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
  match_reason: 'email_and_name' | 'email' | 'phone' | 'name' | 'name_fuzzy';
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

/**
 * Outcome of `bulk_merge_safe_duplicates` (v2 — cluster-aware).
 * Returned by the SQL RPC as jsonb; we type-narrow it here.
 */
export interface BulkClusterPlan {
  cluster_key: string;
  keep_id: string;
  keep_name: string | null;
  keep_email: string | null;
  discard_ids: string[];
  member_count: number;
  reason: string;
  /**
   * When set, this cluster was NOT processed because the user
   * deselected it in the preview (or it was excluded via the
   * p_exclude_cluster_keys parameter). UI can use this to render
   * the cluster with a "skipped" badge.
   */
  skip_reason?: 'deselected';
}

export interface BulkMergeResult {
  dry_run: boolean;
  total_clusters: number;
  total_to_discard: number;
  merged: number;
  skipped_clusters: number;
  plan: BulkClusterPlan[];
  reassigned: {
    bookings: number | null;   // null in dry-run
    invoices: number | null;
    quotes: number | null;
  };
  errors: string[];
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

  /**
   * Dry-run: returns the merge plan without writing anything.
   * Same shape as `bulkMergeSafeDuplicates` but `merged = 0` and
   * `reassigned` fields are `null` (the server doesn't run merge_clients
   * in dry-run mode, so it can't know exact reattach counts).
   */
  previewBulkMerge(companyId: string): Observable<BulkMergeResult> {
    return this.invokeBulkMerge(companyId, true, null, null);
  }

  /**
   * Real merge: collapses every safe duplicate cluster into one row,
   * soft-deleting the rest. Idempotent.
   *
   * Pass `selectedClusterKeys` to act on a subset of the clusters
   * shown in the preview. Pass `null` (default) to act on all.
   */
  bulkMergeSafeDuplicates(
    companyId: string,
    selectedClusterKeys?: string[] | null
  ): Observable<BulkMergeResult> {
    return this.invokeBulkMerge(companyId, false, selectedClusterKeys ?? null, null);
  }

  private invokeBulkMerge(
    companyId: string,
    dryRun: boolean,
    includeClusterKeys: string[] | null,
    excludeClusterKeys: string[] | null
  ): Observable<BulkMergeResult> {
    return from(
      this.supabase.rpc('bulk_merge_safe_duplicates', {
        p_company_id: companyId,
        p_dry_run: dryRun,
        p_include_cluster_keys: includeClusterKeys,
        p_exclude_cluster_keys: excludeClusterKeys
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const r = (data ?? {}) as Partial<BulkMergeResult>;
        return {
          dry_run:          r.dry_run          ?? dryRun,
          total_clusters:   r.total_clusters   ?? 0,
          total_to_discard: r.total_to_discard ?? 0,
          merged:           r.merged           ?? 0,
          skipped_clusters: r.skipped_clusters ?? 0,
          plan:             r.plan             ?? [],
          reassigned: {
            bookings: r.reassigned?.bookings ?? (dryRun ? null : 0),
            invoices: r.reassigned?.invoices ?? (dryRun ? null : 0),
            quotes:   r.reassigned?.quotes   ?? (dryRun ? null : 0)
          },
          errors:           r.errors           ?? []
        } satisfies BulkMergeResult;
      })
    );
  }
}
