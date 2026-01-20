import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';

export interface Campaign {
    id?: string;
    company_id?: string;
    name: string;
    type: 'email' | 'whatsapp' | 'sms';
    subject?: string;
    content: string;
    target_audience: {
        inactive_days?: number;
        birthday_month?: number;
    };
    status?: 'draft' | 'scheduled' | 'sent';
    sent_at?: string;
    trigger_type?: 'manual' | 'birthday' | 'inactivity';
    is_active?: boolean;
    config?: any;
    created_at?: string;
}

export interface AudienceMember {
    client_id: string;
    name: string;
    email: string;
    phone: string;
    last_booking_date: string;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseMarketingService {
    private supabase: SupabaseClient;

    constructor(private sbClient: SupabaseClientService) {
        this.supabase = this.sbClient.instance;
    }

    async getCampaigns(companyId: string) {
        const { data, error } = await this.supabase
            .from('marketing_campaigns')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async createCampaign(campaign: Campaign) {
        const { data, error } = await this.supabase
            .from('marketing_campaigns')
            .insert(campaign)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateCampaign(id: string, updates: Partial<Campaign>) {
        const { data, error } = await this.supabase
            .from('marketing_campaigns')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getEstimatedAudience(companyId: string, criteria: any): Promise<AudienceMember[]> {
        const { data, error } = await this.supabase
            .rpc('f_marketing_get_audience', {
                p_company_id: companyId,
                p_criteria: criteria
            });

        if (error) throw error;
        return data || [];
    }

    async sendCampaign(campaignId: string) {
        // OLD: Update DB directly
        // const { error } = await this.supabase
        //     .from('marketing_campaigns')
        //     .update({ status: 'sent', sent_at: new Date().toISOString() })
        //     .eq('id', campaignId);

        // NEW: Invoke Edge Function
        const { data, error } = await this.supabase.functions.invoke('process-campaign', {
            body: { campaignId }
        });

        if (error) throw error;
        return data;
    }

    async getStats(companyId: string) {
        // Query marketing_logs joined with campaigns to filter by company
        // Using 'head: true' for count only

        try {
            // 1. Sent
            const { count: sentCount, error: sentError } = await this.supabase
                .from('marketing_logs')
                .select('id, marketing_campaigns!inner(company_id)', { count: 'exact', head: true })
                .eq('marketing_campaigns.company_id', companyId)
                .eq('status', 'sent');

            if (sentError) throw sentError;

            // 2. Opened
            const { count: openCount, error: openError } = await this.supabase
                .from('marketing_logs')
                .select('id, marketing_campaigns!inner(company_id)', { count: 'exact', head: true })
                .eq('marketing_campaigns.company_id', companyId)
                .eq('status', 'opened');

            if (openError) throw openError;

            const totalSent = sentCount || 0;
            const opened = openCount || 0;

            return {
                totalSent,
                opened,
                openRate: totalSent > 0 ? (opened / totalSent) * 100 : 0
            };
        } catch (error) {
            console.error('Error fetching stats:', error);
            // Return zeros on error to avoid breaking UI
            return { totalSent: 0, opened: 0, openRate: 0 };
        }
    }
}
