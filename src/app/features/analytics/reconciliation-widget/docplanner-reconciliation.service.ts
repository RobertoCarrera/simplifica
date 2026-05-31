import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { RuntimeConfigService } from '../../../services/runtime-config.service';

export interface ReconciliationAudit {
  id: string;
  company_id: string;
  date: string;
  dp_total: number;
  crm_synced: number;
  discrepancy: number;
  dp_breakdown: Record<string, number> | null;
  synced_at: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class DocplannerReconciliationService {
  private supabase = inject(SupabaseClientService).instance;
  private cfg = inject(RuntimeConfigService);

  getReconciliationAudit(companyId: string, fromDate?: string): Observable<ReconciliationAudit[]> {
    let q = this.supabase.from('docplanner_reconciliation_audit').select('*')
      .eq('company_id', companyId).order('date', { ascending: true }).limit(30);
    if (fromDate) { q = q.gte('date', fromDate); }
    return from(q.then((r: { data: ReconciliationAudit[] | null; error: any }) => {
      if (r.error) { throw r.error; }
      return (r.data as ReconciliationAudit[]) || [];
    }));
  }

  getDayBookings(dateStr: string): Observable<any> {
    const [y, m, d] = dateStr.split('-').map(Number);
    const nd = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const f = (s: string) => s.includes('T') ? s : `${s}T00:00:00Z`;
    return this._call(this._url('docplanner-reconciliation-cron', { start: f(dateStr), end: f(nd), debug: '1' }));
  }

  triggerAudit(): Observable<any> {
    return this._call(this._url('docplanner-reconciliation-cron', { scope: 'full' }));
  }

  triggerAuditRange(start: string, end: string): Observable<any> {
    const f = (s: string) => s.includes('T') ? s : `${s}T00:00:00Z`;
    return this._call(this._url('docplanner-reconciliation-cron', { start: f(start), end: f(end) }));
  }

  triggerSyncDay(start: string, end: string): Observable<any> {
    const f = (s: string) => s.includes('T') ? s : `${s}T00:00:00Z`;
    return this._call(this._url('docplanner-reconciliation-cron', { start: f(start), end: f(end), action: 'sync', debug: '1' }));
  }

  triggerSync(): Observable<any> {
    return this._call(`${this.cfg.get().supabase.url.replace(/\/$/, '')}/functions/v1/docplanner-api`, { action: 'sync-bookings' });
  }

  private _url(fn: string, params: Record<string, string>): string {
    return `${this.cfg.get().supabase.url.replace(/\/$/, '')}/functions/v1/${fn}?${new URLSearchParams(params)}`;
  }

  private _call(url: string, body: any = {}): Observable<any> {
    return new Observable((obs) => {
      this.supabase.auth.getSession().then(({ data: { session } }: any) => {
        if (!session?.access_token) { obs.error(new Error('No session')); return; }
        fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(async (res: Response) => {
          if (!res.ok) { obs.error(new Error(`HTTP ${res.status}`)); }
          else { obs.next(await res.json()); obs.complete(); }
        }).catch((e: Error) => obs.error(e));
      }).catch((e: Error) => obs.error(e));
    });
  }
}
