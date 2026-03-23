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
    reason?: string;
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
        return from((async () => {
            let query = this.supabase
                .from('professional_blocked_dates')
                .select('*')
                .eq('company_id', this.getCompanyId())
                .order('start_date');

            if (professionalIds?.length) {
                query = query.in('professional_id', professionalIds);
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as ProfessionalBlockedDate[];
        })());
    }

    getBlockedDatesForDate(date: Date): Observable<ProfessionalBlockedDate[]> {
        const dateStr = date.toISOString().split('T')[0];
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

    async createBlockedDate(block: { professional_id: string; start_date: string; end_date: string; reason?: string }): Promise<ProfessionalBlockedDate> {
        const { data, error } = await this.supabase
            .from('professional_blocked_dates')
            .insert({ ...block, company_id: this.getCompanyId() })
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
