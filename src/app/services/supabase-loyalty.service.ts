import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';
import { BehaviorSubject } from 'rxjs';

export interface LoyaltyPointTransaction {
    id: string;
    company_id: string;
    customer_id: string;
    points: number;
    source: string; // 'manual', 'booking', 'referral', etc.
    reason?: string;
    created_at: string;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseLoyaltyService {
    private supabase: SupabaseClient;

    constructor(private sbClient: SupabaseClientService) {
        this.supabase = this.sbClient.instance;
    }

    /**
     * Get total points balance for a customer
     */
    async getPointsBalance(customerId: string): Promise<number> {
        const { data, error } = await this.supabase
            .from('loyalty_points')
            .select('points')
            .eq('customer_id', customerId);

        if (error) throw error;

        // Sum points
        return (data || []).reduce((acc, curr) => acc + (curr.points || 0), 0);
    }

    /**
     * Get transaction history
     */
    async getHistory(customerId: string): Promise<LoyaltyPointTransaction[]> {
        const { data, error } = await this.supabase
            .from('loyalty_points')
            .select('*')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Add (or subtract if negative) points
     */
    async addPoints(transaction: {
        company_id: string;
        customer_id: string;
        points: number;
        source: string;
        reason?: string;
    }): Promise<LoyaltyPointTransaction> {
        const { data, error } = await this.supabase
            .from('loyalty_points')
            .insert(transaction)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
