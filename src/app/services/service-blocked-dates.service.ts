import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { Observable, from } from 'rxjs';

export interface ServiceBlockedDate {
  id: string;
  company_id: string;
  service_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  start_time?: string; // HH:MM (null if all_day)
  end_time?: string;   // HH:MM (null if all_day)
  reason?: string;
  all_day: boolean;
  created_by?: string;
  created_at?: string;
}

@Injectable({ providedIn: 'root' })
export class ServiceBlockedDatesService {
  private sbClient = inject(SupabaseClientService);
  private authService = inject(AuthService);

  private get supabase() {
    return this.sbClient.instance;
  }

  private getCompanyId(): string {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) throw new Error('No active company found');
    return companyId;
  }

  /** Get all blocked dates for services in the current company */
  getBlockedDates(serviceIds?: string[]): Observable<ServiceBlockedDate[]> {
    return from((async () => {
      let query = this.supabase
        .from('service_blocked_dates')
        .select('*')
        .eq('company_id', this.getCompanyId())
        .order('start_date');

      if (serviceIds?.length) {
        query = query.in('service_id', serviceIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ServiceBlockedDate[];
    })());
  }

  /** Get service blocked dates that overlap with a specific date */
  getBlockedDatesForDate(date: Date): Observable<ServiceBlockedDate[]> {
    // Bug fix 2026-06-10: avoid toISOString() to keep the user's local
    // calendar day. UTC conversion shifts the date by ±1 in non-UTC TZs.
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    return from((async () => {
      const { data, error } = await this.supabase
        .from('service_blocked_dates')
        .select('*')
        .eq('company_id', this.getCompanyId())
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);

      if (error) throw error;
      return (data || []) as ServiceBlockedDate[];
    })());
  }

  /** Get service blocked dates overlapping a date range, optionally filtered by service_ids */
  async getBlockedDatesInRange(
    startDate: string,
    endDate: string,
    serviceIds?: string[],
  ): Promise<ServiceBlockedDate[]> {
    let query = this.supabase
      .from('service_blocked_dates')
      .select('*')
      .eq('company_id', this.getCompanyId())
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (serviceIds?.length) {
      query = query.in('service_id', serviceIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ServiceBlockedDate[];
  }

  /** Create a service blocked date */
  async createBlockedDate(block: {
    service_id: string;
    start_date: string;
    end_date: string;
    reason?: string;
    all_day?: boolean;
    start_time?: string;
    end_time?: string;
  }): Promise<ServiceBlockedDate> {
    const { data, error } = await this.supabase
      .from('service_blocked_dates')
      .insert({ ...block, company_id: this.getCompanyId() })
      .select()
      .single();

    if (error) throw error;
    return data as ServiceBlockedDate;
  }

  /** Update an existing service blocked date (added 2026-06-10) */
  async updateBlockedDate(
    id: string,
    updates: Partial<{
      service_id: string;
      start_date: string;
      end_date: string;
      reason: string;
      all_day: boolean;
      start_time: string;
      end_time: string;
    }>,
  ): Promise<ServiceBlockedDate> {
    const { data, error } = await this.supabase
      .from('service_blocked_dates')
      .update(updates)
      .eq('id', id)
      .eq('company_id', this.getCompanyId())
      .select()
      .single();

    if (error) throw error;
    return data as ServiceBlockedDate;
  }

  /** Delete a service blocked date */
  async deleteBlockedDate(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('service_blocked_dates')
      .delete()
      .eq('id', id)
      .eq('company_id', this.getCompanyId());

    if (error) throw error;
  }
}
