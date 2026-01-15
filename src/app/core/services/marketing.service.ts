import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface MarketingMetric {
    id?: string;
    company_id: string;
    date: string; // YYYY-MM-DD
    channel: 'google_ads' | 'instagram_ads' | 'tiktok_ads' | 'organic' | 'email' | 'other';
    spend: number;
    impressions: number;
    clicks: number;
    leads_attributed: number;
    created_at?: string;
    updated_at?: string;
}

export interface SocialMetric {
    id?: string;
    company_id: string;
    date: string;
    platform: 'instagram' | 'tiktok' | 'facebook' | 'linkedin' | 'google_business';
    followers: number;
    engagement_rate: number;
    posts_count: number;
    created_at?: string;
}

export interface ContentPost {
    id?: string;
    company_id: string;
    title: string;
    status: 'idea' | 'copy' | 'design' | 'review' | 'scheduled' | 'published';
    platform: string;
    scheduled_date?: string;
    content_url?: string;
    notes?: string;
    created_at?: string;
}

@Injectable({
    providedIn: 'root'
})
export class MarketingService {
    private supabase = inject(SupabaseClientService).instance;

    /**
     * Get marketing metrics for a date range
     */
    getMarketingMetrics(companyId: string, startDate?: string, endDate?: string): Observable<MarketingMetric[]> {
        let query = this.supabase
            .from('marketing_metrics')
            .select('*')
            .eq('company_id', companyId)
            .order('date', { ascending: true });

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        return from(query).pipe(
            map(res => {
                if (res.error) throw res.error;
                return (res.data || []) as MarketingMetric[];
            }),
            catchError(err => {
                console.error('Error fetching marketing metrics:', err);
                return of([]);
            })
        );
    }

    /**
     * Upsert a daily marketing metric
     */
    async upsertMarketingMetric(metric: Partial<MarketingMetric> & { company_id: string, date: string, channel: string }): Promise<MarketingMetric> {
        const { data, error } = await this.supabase
            .from('marketing_metrics')
            .upsert(metric, { onConflict: 'company_id, date, channel' })
            .select()
            .single();

        if (error) throw error;
        return data as MarketingMetric;
    }

    /**
     * Get social snapshots for a date range
     */
    getSocialMetrics(companyId: string, startDate?: string, endDate?: string): Observable<SocialMetric[]> {
        let query = this.supabase
            .from('social_metrics')
            .select('*')
            .eq('company_id', companyId)
            .order('date', { ascending: true });

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        return from(query).pipe(
            map(res => {
                if (res.error) throw res.error;
                return (res.data || []) as SocialMetric[];
            }),
            catchError(err => {
                console.error('Error fetching social metrics:', err);
                return of([]);
            })
        );
    }

    /**
     * Upsert a social snapshot
     */
    /**
     * Upsert a social snapshot
     */
    async upsertSocialMetric(metric: Partial<SocialMetric> & { company_id: string, date: string, platform: string }): Promise<SocialMetric> {
        const { data, error } = await this.supabase
            .from('social_metrics')
            .upsert(metric, { onConflict: 'company_id, date, platform' })
            .select()
            .single();

        if (error) throw error;
        return data as SocialMetric;
    }

    // --- Content Calendar ---

    getContentPosts(companyId: string): Observable<ContentPost[]> {
        return from(this.supabase
            .from('content_posts')
            .select('*')
            .eq('company_id', companyId)
            .order('scheduled_date', { ascending: true })
        ).pipe(
            map(res => (res.data || []) as ContentPost[]),
            catchError(err => {
                console.error('Error fetching content posts:', err);
                return of([]);
            })
        );
    }

    async createContentPost(post: Partial<ContentPost>): Promise<ContentPost> {
        const { data, error } = await this.supabase
            .from('content_posts')
            .insert(post)
            .select()
            .single();

        if (error) throw error;
        return data as ContentPost;
    }

    async updateContentPost(id: string, updates: Partial<ContentPost>): Promise<ContentPost> {
        const { data, error } = await this.supabase
            .from('content_posts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ContentPost;
    }

    async deleteContentPost(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('content_posts')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
}
