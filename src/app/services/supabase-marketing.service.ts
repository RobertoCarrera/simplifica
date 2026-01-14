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

    async getEstimatedAudience(companyId: string, criteria: any): Promise<AudienceMember[]> {
        const { data, error } = await this.supabase
            .rpc('f_marketing_get_audience', {
                p_company_id: companyId,
                p_criteria: criteria
            });

        if (error) throw error;
        return data || [];
    }

    // Mock send function (in reality this would call an Edge Function)
    async sendCampaign(campaignId: string) {
        const { error } = await this.supabase
            .from('marketing_campaigns')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', campaignId);

        if (error) throw error;
        return true;
    }
}
