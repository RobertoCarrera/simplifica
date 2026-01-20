import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';

export interface DailyRevenue {
    day: string;
    revenue: number;
    bookings_count: number;
}

export interface ServiceRevenue {
    service_name: string;
    revenue: number;
    bookings_count: number;
}

export interface ProfessionalRevenue {
    professional_name: string;
    revenue: number;
    bookings_count: number;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseAnalyticsService {
    private supabase: SupabaseClient;

    constructor(private sbClient: SupabaseClientService) {
        this.supabase = this.sbClient.instance;
    }

    async getDailyRevenue(companyId: string, startDate: Date, endDate: Date): Promise<DailyRevenue[]> {
        const { data, error } = await this.supabase
            .rpc('get_daily_revenue', {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                p_company_id: companyId
            });

        if (error) throw error;
        return data || [];
    }

    async getRevenueByService(companyId: string, startDate: Date, endDate: Date): Promise<ServiceRevenue[]> {
        const { data, error } = await this.supabase
            .rpc('get_revenue_by_service', {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                p_company_id: companyId
            });

        if (error) throw error;
        return data || [];
    }

    async getRevenueByProfessional(companyId: string, startDate: Date, endDate: Date): Promise<ProfessionalRevenue[]> {
        const { data, error } = await this.supabase
            .rpc('get_revenue_by_professional', {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
                p_company_id: companyId
            });

        if (error) throw error;
        return data || [];
    }
    async getOccupancyHeatmap(companyId: string, startDate: Date, endDate: Date): Promise<{ day_of_week: number, hour_of_day: number, booking_count: number }[]> {
        const { data, error } = await this.supabase
            .rpc('f_analytics_occupancy_heatmap', {
                p_company_id: companyId,
                p_start_date: startDate.toISOString(),
                p_end_date: endDate.toISOString()
            });

        if (error) throw error;
        return data || [];
    }

    async getRevenueForecast(companyId: string): Promise<{ period: string, total_revenue: number }[]> {
        const { data, error } = await this.supabase
            .rpc('f_analytics_revenue_forecast', {
                p_company_id: companyId
            });

        if (error) throw error;
        return data || [];
    }

    async getTopPerformers(companyId: string, monthDate: Date): Promise<{ professional_id: string, professional_name: string, bookings_count: number, total_revenue: number }[]> {
        const { data, error } = await this.supabase
            .rpc('f_analytics_top_performers', {
                p_company_id: companyId,
                p_month_date: monthDate.toISOString()
            });

        if (error) throw error;
        return data || [];
    }
}
