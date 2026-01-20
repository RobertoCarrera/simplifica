import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';

export interface NotificationTemplate {
    id: string;
    company_id: string;
    name: string;
    type: 'email' | 'sms' | 'whatsapp' | 'push';
    trigger_event: 'booking_created' | 'booking_cancelled' | 'reminder_24h' | 'reminder_1h' | 'followup_review';
    subject?: string;
    body: string;
    active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface NotificationLog {
    id: string;
    company_id: string;
    booking_id?: string;
    template_id?: string;
    recipient: string;
    channel: string;
    status: 'sent' | 'failed' | 'queued';
    error_message?: string;
    sent_at?: string;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseNotificationsConfigService {
    private supabase: SupabaseClient;

    constructor(private sbClient: SupabaseClientService) {
        this.supabase = this.sbClient.instance;
    }

    async getTemplates(companyId: string): Promise<NotificationTemplate[]> {
        const { data, error } = await this.supabase
            .from('notification_templates')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async createTemplate(template: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
        const { data, error } = await this.supabase
            .from('notification_templates')
            .insert(template)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateTemplate(id: string, updates: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
        const { data, error } = await this.supabase
            .from('notification_templates')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteTemplate(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('notification_templates')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // Logs
    async getLogs(companyId: string, limit = 50): Promise<NotificationLog[]> {
        const { data, error } = await this.supabase
            .from('notification_logs')
            .select('*')
            .eq('company_id', companyId)
            .order('sent_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    }
}
