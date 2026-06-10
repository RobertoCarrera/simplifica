import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { Observable, from } from 'rxjs';

export interface ProfessionalBlockedDate {
    id: string;
    company_id: string;
    professional_id: string;
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
export class ProfessionalBlockedDatesService {
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

    getBlockedDates(professionalIds?: string[]): Observable<ProfessionalBlockedDate[]> {
        // Multi-company fix 2026-06-10: when filtering by specific professional
        // ids, trust the RLS policy (which uses `professionals.user_id` join,
        // not `users.company_id`) to return only the blocks the caller is
        // entitled to see across all their companies. The previous behaviour
        // of always adding `.eq('company_id', currentCompanyId())` blocked
        // multi-company professionals (e.g. a supervisor of CAIBS whose
        // primary `users.company_id` is Simplifica) from seeing blocks the
        // owner of CAIBS created for them in CAIBS.
        //
        // When `professionalIds` is NOT supplied (the owner/scheduler asking
        // for "all blocks in my current company"), keep the company filter —
        // that's the admin-side listing and should not leak across companies.
        return from((async () => {
            const filterByProfessional = (professionalIds?.length ?? 0) > 0;
            let query = this.supabase
                .from('professional_blocked_dates')
                .select('*')
                .order('start_date');

            if (filterByProfessional) {
                query = query.in('professional_id', professionalIds!);
            } else {
                query = query.eq('company_id', this.getCompanyId());
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as ProfessionalBlockedDate[];
        })());
    }

    getBlockedDatesForDate(date: Date): Observable<ProfessionalBlockedDate[]> {
        // Bug fix 2026-06-10: do NOT use date.toISOString() because that
        // converts to UTC and shifts the day backwards/forwards depending
        // on the user's timezone. E.g. blocking "all day 2026-06-15" in
        // Europe/Madrid (UTC+2 in summer) would match 2026-06-14 because
        // 2026-06-15T00:00:00+02:00 = 2026-06-14T22:00:00.000Z, whose
        // ISO date part is 2026-06-14. We need a YYYY-MM-DD that reflects
        // the user's local calendar day.
        const yyyy = date.getFullYear();
        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
        const dd = date.getDate().toString().padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        return from((async () => {
            const { data, error } = await this.supabase
                .from('professional_blocked_dates')
                .select('*')
                .eq('company_id', this.getCompanyId())
                .lte('start_date', dateStr)
                .gte('end_date', dateStr);

            if (error) throw error;
            return (data || []) as ProfessionalBlockedDate[];
        })());
    }

    async createBlockedDate(block: { professional_id: string; start_date: string; end_date: string; reason?: string; all_day?: boolean; start_time?: string; end_time?: string }): Promise<ProfessionalBlockedDate> {
        const { data, error } = await this.supabase
            .from('professional_blocked_dates')
            .insert({ ...block, company_id: this.getCompanyId() })
            .select()
            .single();

        if (error) throw error;
        return data as ProfessionalBlockedDate;
    }

    async updateBlockedDate(id: string, updates: Partial<ProfessionalBlockedDate>): Promise<ProfessionalBlockedDate> {
        const { data, error } = await this.supabase
            .from('professional_blocked_dates')
            .update(updates)
            .eq('id', id)
            .eq('company_id', this.getCompanyId())
            .select()
            .single();

        if (error) throw error;
        return data as ProfessionalBlockedDate;
    }

    async deleteBlockedDate(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('professional_blocked_dates')
            .delete()
            .eq('id', id)
            .eq('company_id', this.getCompanyId());

        if (error) throw error;
    }
}
