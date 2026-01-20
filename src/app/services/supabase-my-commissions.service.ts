import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Observable, from, map } from 'rxjs';

export interface CommissionLog {
    id: string;
    company_id: string;
    employee_id: string;
    booking_id?: string;
    service_name: string;
    service_price: number;
    calculated_commission: number;
    performed_at: string; // Date
    created_at: string;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseMyCommissionsService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);
    }

    getMyCommissions(companyId: string, startDate: Date, endDate: Date): Observable<CommissionLog[]> {
        // RLS ensures we only see our own logs
        // But we must filter by company_id and date
        return from(
            this.supabase
                .from('employee_productivity_logs')
                .select('*')
                .eq('company_id', companyId)
                .gte('performed_at', startDate.toISOString())
                .lte('performed_at', endDate.toISOString())
                .order('performed_at', { ascending: false })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return (data as CommissionLog[]) || [];
            })
        );
    }

    getCommissionStats(companyId: string, startDate: Date, endDate: Date): Observable<{ total: number, count: number, avgTicket: number }> {
        return this.getMyCommissions(companyId, startDate, endDate).pipe(
            map(logs => {
                const total = logs.reduce((sum, log) => sum + log.calculated_commission, 0);
                const count = logs.length;
                const totalSales = logs.reduce((sum, log) => sum + log.service_price, 0);
                const avgTicket = count > 0 ? totalSales / count : 0;

                return { total, count, avgTicket };
            })
        );
    }
}
