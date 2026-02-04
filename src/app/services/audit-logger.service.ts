import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface AuditLogEntry {
    action: string;
    resource_type: string;
    resource_id?: string;
    details?: any;
    performed_by?: string;
    performed_at?: string;
    ip_address?: string; // Optional if available
}

@Injectable({
    providedIn: 'root'
})
export class AuditLoggerService {
    private supabase = inject(SupabaseClientService);
    private auth = inject(AuthService);

    /**
     * Logs a sensitive action to the audit_logs table.
     * Fire and forget - does not block UI.
     */
    async logAction(action: string, resourceType: string, resourceId?: string, details?: any) {
        try {
            const user = this.auth.userProfile;
            if (!user) return;

            const params = {
                user_id: user.id,
                company_id: user.company_id,
                action_type: action,
                table_name: resourceType,
                record_id: resourceId,
                subject_email: details?.email || details?.viewed_customer_email || undefined,
                purpose: 'Security Audit: Sensitive Data Access',
                new_values: details
            };

            const { error } = await this.supabase.instance.rpc('gdpr_log_access', params);

            if (error) {
                // Fallback if RPC fails or doesn't exist (e.g. permission issue)
                console.warn('GDPR Log RPC failed, falling back to console:', error);
            }
        } catch (e) {
            console.warn('Audit log exception:', e);
        }
    }
}
