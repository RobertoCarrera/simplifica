import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface AuditLog {
    id: string;
    created_at: string;
    action: string;
    entity_type: string;
    entity_id: string;
    actor_id: string;
    company_id: string;
    old_data: any;
    new_data: any;
    ip_address: string;
    user_agent: string;
    actor_email?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuditService {
    constructor(private supabase: SupabaseService) { }

    async getLogs(
        page: number = 0,
        pageSize: number = 20,
        filters?: { entityType?: string; action?: string; dateFrom?: string; dateTo?: string }
    ): Promise<{ data: AuditLog[], count: number }> {

        let query = this.supabase.db
            .from('audit_logs')
            .select('*', { count: 'exact' });

        if (filters?.entityType) {
            query = query.eq('entity_type', filters.entityType);
        }
        if (filters?.action) {
            query = query.eq('action', filters.action);
        }
        if (filters?.dateFrom) {
            query = query.gte('created_at', filters.dateFrom);
        }
        if (filters?.dateTo) {
            query = query.lte('created_at', filters.dateTo);
        }

        // Pagination
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        // Type assertion/mapping if needed, but Supabase JS returns any usually
        return { data: data as any[], count: count || 0 };
    }

    async getEntityTypes(): Promise<string[]> {
        // Distinct entity types query?
        // Supabase generic simple query
        const { data, error } = await this.supabase.db
            .from('audit_logs')
            .select('entity_type') // distinct?
            // .distinct() not directly supported like this usually, need RPC or post-process
            .limit(100);

        if (error) return [];

        const types = new Set((data as any[])?.map(d => d.entity_type));
        return Array.from(types).sort();
    }
    async logAction(action: string, entityType: string, entityId: string, companyId: string | null, metadata: any = {}): Promise<void> {
        try {
            const { error } = await this.supabase.db.rpc('log_audit_event', {
                p_company_id: companyId,
                p_action: action,
                p_entity_type: entityType,
                p_entity_id: entityId,
                p_metadata: metadata
            } as any);
            if (error) {
                console.error('Audit logging failed:', error);
            }
        } catch (e) {
            console.error('Audit logging exception:', e);
        }
    }
}
