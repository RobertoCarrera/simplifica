import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface SavingsStats {
    actualSecondsSaved: number;
    potentialSecondsSaved: number;
}

export interface AiUsageBreakdown {
    tickets: number;
    clients: number;
    devices: number;
    totalSeconds: number;
}

@Injectable({
    providedIn: 'root'
})
export class AiAnalyticsService {
    private supabase: SupabaseClient;
    private authService = inject(AuthService);

    // Constants for Potential Savings Calculation (in seconds)
    private readonly TIME_PER_CLIENT_MANUAL = 300; // 5 mins to create a client manually
    private readonly TIME_PER_QUOTE_MANUAL = 900;  // 15 mins to create a detailed quote
    private readonly TIME_PER_TICKET_MANUAL = 300; // 5 mins to create a ticket
    private readonly TIME_PER_DEVICE_MANUAL = 180; // 3 mins to register a device details

    constructor(private sbClient: SupabaseClientService) {
        this.supabase = this.sbClient.instance;
    }

    // Per-company memoization so multiple subscribers (e.g. constructor effect + ngOnInit
    // double-fire) share the same Observable instance and dedupe DB queries.
    // Rafter v0.40 (perf audit 2026-06-22 — Finding 4).
    private actualSavingsCache = new Map<string, Observable<number>>();
    private usageBreakdownCache = new Map<string, Observable<AiUsageBreakdown>>();
    private potentialSavingsCache = new Map<string, Observable<number>>();

    /**
     * Get total actual time saved from logs for the company
     */
    getActualSavings(): Observable<number> {
        const companyId = this.authService.companyId();
        if (!companyId) return of(0);

        const cached = this.actualSavingsCache.get(companyId);
        if (cached) return cached;

        const obs$ = from(
            this.supabase
                .from('ai_usage_logs')
                .select('saved_seconds')
                .eq('company_id', companyId)
        ).pipe(
            map(({ data, error }) => {
                if (error) {
                    console.error('Error fetching AI savings:', error);
                    return 0;
                }
                return (data || []).reduce((acc, curr) => acc + (curr.saved_seconds || 0), 0);
            }),
            catchError(() => of(0)),
            shareReplay({ bufferSize: 1, refCount: true })
        );

        this.actualSavingsCache.set(companyId, obs$);
        return obs$;
    }

    /**
     * Get detailed breakdown of AI usage
     */
    getUsageBreakdown(): Observable<AiUsageBreakdown> {
        const companyId = this.authService.companyId();
        if (!companyId) return of({ tickets: 0, clients: 0, devices: 0, totalSeconds: 0 });

        const cached = this.usageBreakdownCache.get(companyId);
        if (cached) return cached;

        const obs$ = from(
            this.supabase
                .from('ai_usage_logs')
                .select('feature_key, saved_seconds')
                .eq('company_id', companyId)
        ).pipe(
            map(({ data, error }) => {
                if (error) {
                    // Ignore "table not found" error (migration not run yet)
                    if (error.code !== 'PGRST205' && error.code !== '42P01') {
                        console.error('Error fetching AI usage logs:', error);
                    }
                    return { tickets: 0, clients: 0, devices: 0, totalSeconds: 0 };
                }

                const logs = data || [];
                return logs.reduce((acc, curr) => {
                    acc.totalSeconds += (curr.saved_seconds || 0);

                    if (curr.feature_key === 'audio_ticket') acc.tickets++;
                    else if (curr.feature_key === 'audio_client') acc.clients++;
                    else if (curr.feature_key === 'scan_device') acc.devices++;

                    return acc;
                }, { tickets: 0, clients: 0, devices: 0, totalSeconds: 0 });
            }),
            catchError(() => of({ tickets: 0, clients: 0, devices: 0, totalSeconds: 0 })),
            shareReplay({ bufferSize: 1, refCount: true })
        );

        this.usageBreakdownCache.set(companyId, obs$);
        return obs$;
    }

    /**
     * Calculate potential savings based on total volume of data
     * (If they had used AI for everything they did manually)
     */
    getPotentialSavings(): Observable<number> {
        const companyId = this.authService.companyId();
        if (!companyId) return of(0);

        const cached = this.potentialSavingsCache.get(companyId);
        if (cached) return cached;

        // We fetch counts for key entities
        // head: true returns only the count header, no row data
        const queries = [
            this.supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            this.supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            this.supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            this.supabase.from('devices').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
        ];

        const obs$ = from(Promise.all(queries)).pipe(
            map(results => {
                const clientCount = results[0].count || 0;
                const quoteCount = results[1].count || 0;
                const ticketCount = results[2].count || 0;
                const deviceCount = results[3].count || 0;

                const totalPotential =
                    (clientCount * this.TIME_PER_CLIENT_MANUAL) +
                    (quoteCount * this.TIME_PER_QUOTE_MANUAL) +
                    (ticketCount * this.TIME_PER_TICKET_MANUAL) +
                    (deviceCount * this.TIME_PER_DEVICE_MANUAL);

                return totalPotential;
            }),
            catchError(err => {
                console.error('Error calculating potential savings', err);
                return of(0);
            }),
            shareReplay({ bufferSize: 1, refCount: true })
        );

        this.potentialSavingsCache.set(companyId, obs$);
        return obs$;
    }
}
