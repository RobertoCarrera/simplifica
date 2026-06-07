import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface MarketingCampaign {
  id: string;
  company_id: string;
  name: string;
  type: 'email' | 'whatsapp' | 'sms';
  subject: string | null;
  content: string;
  target_audience: { client_ids: string[] } | null;
  status: 'draft' | 'scheduled' | 'sent';
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  created_by: string | null;
  trigger_type: 'manual' | 'birthday' | 'inactivity';
  is_active: boolean;
  config: Record<string, unknown> | null;
}

export interface MarketingStats {
  total: number;
  active: number;
  sent: number;
  clientsWithConsent: number;
}

export interface MarketingClient {
  id: string;
  name: string;
  surname: string;
  email: string;
  phone: string;
  marketing_consent: boolean;
  birth_date?: string | null;
}

export interface Locality {
  id: string;
  name: string;
  postal_code: string | null;
  province: string | null;
}

export interface ClientFilters {
  // Contact data completeness
  hasEmail?: 'yes' | 'no' | 'all';
  hasPhone?: 'yes' | 'no' | 'all';
  hasDni?: 'yes' | 'no' | 'all';
  hasAddress?: 'yes' | 'no' | 'all';
  // Status
  isActive?: 'yes' | 'no' | 'all';
  hasMarketingConsent?: 'yes' | 'no' | 'all';
  // Demographics
  localityId?: string | null;
  ageRange?: '18-25' | '26-35' | '36-45' | '46-55' | '55+' | null;
  language?: string | null;
  clientType?: 'individual' | 'business' | 'all';
  // Classification
  tier?: string | null;
  source?: string | null;
  tags?: string[];
  // Date
  createdAfter?: string | null;
  createdBefore?: string | null;
  birthdayIn?: 'week' | 'month' | '3months' | null;
}

export interface FilterOptions {
  localities: Locality[];
  tiers: string[];
  sources: string[];
  languages: string[];
  tags: string[];
}

@Injectable({ providedIn: 'root' })
export class SupabaseMarketingService {
  private sb = inject(SupabaseClientService).instance;
  private auth = inject(AuthService);

  private get companyId(): string | null {
    return this.auth.currentCompanyId() ?? null;
  }

  // ── Campaign CRUD ──────────────────────────────────────────

  async getCampaigns(filters?: {
    status?: string;
    type?: string;
  }): Promise<MarketingCampaign[]> {
    const cid = this.companyId;
    if (!cid) return [];

    let query = this.sb
      .from('marketing_campaigns')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.type && filters.type !== 'all') {
      query = query.eq('type', filters.type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as MarketingCampaign[];
  }

  async getCampaign(id: string): Promise<MarketingCampaign | null> {
    const { data, error } = await this.sb
      .from('marketing_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as MarketingCampaign | null;
  }

  async createCampaign(data: {
    name: string;
    type: 'email' | 'whatsapp' | 'sms';
    subject?: string;
    content: string;
    target_audience?: { client_ids: string[] };
    scheduled_at?: string;
    trigger_type?: 'manual' | 'birthday' | 'inactivity';
    config?: Record<string, unknown>;
  }): Promise<MarketingCampaign> {
    const cid = this.companyId;
    if (!cid) throw new Error('No company selected');

    const { data: campaign, error } = await this.sb
      .from('marketing_campaigns')
      .insert({
        company_id: cid,
        name: data.name,
        type: data.type,
        subject: data.subject || null,
        content: data.content,
        target_audience: data.target_audience || null,
        status: 'draft',
        scheduled_at: data.scheduled_at || null,
        trigger_type: data.trigger_type || 'manual',
        is_active: false,
        config: data.config || null,
      })
      .select()
      .single();

    if (error) throw error;
    return campaign as MarketingCampaign;
  }

  async updateCampaign(
    id: string,
    data: Partial<{
      name: string;
      type: 'email' | 'whatsapp' | 'sms';
      subject: string;
      content: string;
      target_audience: { client_ids: string[] };
      scheduled_at: string;
      status: 'draft' | 'scheduled' | 'sent';
      trigger_type: 'manual' | 'birthday' | 'inactivity';
      is_active: boolean;
    }>,
  ): Promise<MarketingCampaign> {
    const { data: campaign, error } = await this.sb
      .from('marketing_campaigns')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return campaign as MarketingCampaign;
  }

  async deleteCampaign(id: string): Promise<void> {
    const { error } = await this.sb
      .from('marketing_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ── Stats ──────────────────────────────────────────────────

  async getStats(): Promise<MarketingStats> {
    const cid = this.companyId;
    if (!cid) return { total: 0, active: 0, sent: 0, clientsWithConsent: 0 };

    const [totalRes, activeRes, sentRes, clientsRes] = await Promise.all([
      this.sb.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('company_id', cid),
      this.sb.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('is_active', true),
      this.sb.from('marketing_campaigns').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'sent'),
      this.sb.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('marketing_consent', true).eq('is_active', true),
    ]);

    return {
      total: totalRes.count ?? 0,
      active: activeRes.count ?? 0,
      sent: sentRes.count ?? 0,
      clientsWithConsent: clientsRes.count ?? 0,
    };
  }

  // ── Audience ───────────────────────────────────────────────

  private applyFilters(query: any, filters: ClientFilters, baseFilters: any): any {
    // Contact completeness
    if (filters.hasEmail === 'yes') {
      query = query.not('email', 'is', null);
    } else if (filters.hasEmail === 'no') {
      query = query.is('email', null);
    }

    if (filters.hasPhone === 'yes') {
      query = query.not('phone', 'is', null);
    } else if (filters.hasPhone === 'no') {
      query = query.is('phone', null);
    }

    if (filters.hasDni === 'yes') {
      query = query.not('dni', 'is', null);
    } else if (filters.hasDni === 'no') {
      query = query.is('dni', null);
    }

    if (filters.hasAddress === 'yes') {
      query = query.not('direccion_id', 'is', null);
    } else if (filters.hasAddress === 'no') {
      query = query.is('direccion_id', null);
    }

    // Status - isActive
    if (filters.isActive === 'yes') {
      query = query.eq('is_active', true);
    } else if (filters.isActive === 'no') {
      query = query.eq('is_active', false);
    }
    // 'all' = no filter applied (base filters handle default)

    // Marketing consent
    if (filters.hasMarketingConsent === 'yes') {
      query = query.eq('marketing_consent', true);
    } else if (filters.hasMarketingConsent === 'no') {
      query = query.eq('marketing_consent', false);
    }

    // Demographics - locality
    if (filters.localityId) {
      query = query.eq('locality_id', filters.localityId);
    }

    // Age range
    if (filters.ageRange) {
      const now = new Date();
      let minAge: number, maxAge: number;
      switch (filters.ageRange) {
        case '18-25':
          minAge = 18;
          maxAge = 25;
          break;
        case '26-35':
          minAge = 26;
          maxAge = 35;
          break;
        case '36-45':
          minAge = 36;
          maxAge = 45;
          break;
        case '46-55':
          minAge = 46;
          maxAge = 55;
          break;
        case '55+':
          minAge = 55;
          maxAge = 120;
          break;
      }
      const maxDob = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
      const minDob = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1);
      query = query.gte('birth_date', minDob.toISOString().split('T')[0]);
      query = query.lte('birth_date', maxDob.toISOString().split('T')[0]);
    }

    // Language
    if (filters.language) {
      query = query.eq('language', filters.language);
    }

    // Client type
    if (filters.clientType === 'individual') {
      query = query.eq('client_type', 'individual');
    } else if (filters.clientType === 'business') {
      query = query.eq('client_type', 'business');
    }

    // Classification - tier
    if (filters.tier) {
      query = query.eq('tier', filters.tier);
    }

    // Source
    if (filters.source) {
      query = query.eq('source', filters.source);
    }

    // Tags - match any
    if (filters.tags && filters.tags.length > 0) {
      query = query.or(`tags.cs.${JSON.stringify(filters.tags)}`);
    }

    // Date range - created_at
    if (filters.createdAfter) {
      query = query.gte('created_at', filters.createdAfter);
    }
    if (filters.createdBefore) {
      query = query.lte('created_at', filters.createdBefore);
    }

    // Birthday upcoming - compute date range server-side
    if (filters.birthdayIn) {
      const now = new Date();
      const year = now.getFullYear();
      let startMonth: number, startDay: number, endMonth: number, endDay: number;

      switch (filters.birthdayIn) {
        case 'week': {
          // This week: from today to today + 7 days
          const end = new Date(now);
          end.setDate(now.getDate() + 7);
          startMonth = now.getMonth() + 1;
          startDay = now.getDate();
          endMonth = end.getMonth() + 1;
          endDay = end.getDate();
          break;
        }
        case 'month': {
          // This month
          startMonth = now.getMonth() + 1;
          startDay = now.getDate();
          endMonth = now.getMonth() + 1;
          endDay = new Date(year, now.getMonth() + 1, 0).getDate();
          break;
        }
        case '3months': {
          // Next 3 months
          startMonth = now.getMonth() + 1;
          startDay = now.getDate();
          const future = new Date(now);
          future.setMonth(now.getMonth() + 3);
          endMonth = future.getMonth() + 1;
          endDay = future.getDate();
          break;
        }
      }

      // Use PostgREST date extraction for birthday filtering
      // birth_date month = startMonth AND (day >= startDay OR month > startMonth)
      // OR birth_date month = endMonth AND day <= endDay
      // This is complex in pure PostgREST - we'll use a text array approach with date_part
      // For simplicity, use a date range approach: compute actual dates
      if (filters.birthdayIn === 'week' || filters.birthdayIn === 'month' || filters.birthdayIn === '3months') {
        // Compute target date range for this year (or next if past month)
        const startDate = new Date(year, startMonth - 1, startDay);
        let endDate = new Date(year, endMonth - 1, endDay);

        // If end date is in the past relative to now, it means next year
        if (endDate < now) {
          endDate = new Date(year + 1, endMonth - 1, endDay);
        }

        // Get all clients and filter by birth_date month/day (client-side for date extraction)
        // This is a limitation - PostgREST doesn't have great date extraction for this use case
        // Alternative: use .or() with computed ranges for each day (impractical)
        // Best approach: apply as much as possible and handle remaining in-memory for date extraction
        // Actually, let's try using extract in a filter - PostgREST supports date_part
        // We can't easily do this in PostgREST without RPC, so we'll handle at query level
        // For now, just apply a generous date range and filter in JS if needed
      }
    }

    return query;
  }

  async getClientsWithConsent(search?: string, filters?: ClientFilters): Promise<MarketingClient[]> {
    const cid = this.companyId;
    if (!cid) return [];

    let query = this.sb
      .from('clients')
      .select('id, name, surname, email, phone, marketing_consent, birth_date')
      .eq('company_id', cid)
      .eq('marketing_consent', true)
      .eq('is_active', true)
      .order('surname', { ascending: true })
      .limit(500);

    // Apply filters
    if (filters) {
      query = this.applyFilters(query, filters, {});
    }

    if (search) {
      const term = `%${search}%`;
      query = query.or(`name.ilike.${term},surname.ilike.${term},email.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    let results = (data || []) as MarketingClient[];

    // Client-side birthday filter (date extraction not fully supported in PostgREST)
    if (filters?.birthdayIn) {
      const now = new Date();
      const year = now.getFullYear();
      results = results.filter(c => {
        if (!c.birth_date) return false;
        const birth = new Date(c.birth_date);
        const thisYearBirthday = new Date(year, birth.getMonth(), birth.getDate());
        const nextBirthday = thisYearBirthday < now
          ? new Date(year + 1, birth.getMonth(), birth.getDate())
          : thisYearBirthday;

        const diffDays = Math.ceil((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        switch (filters.birthdayIn) {
          case 'week': return diffDays >= 0 && diffDays <= 7;
          case 'month': return diffDays >= 0 && diffDays <= 30;
          case '3months': return diffDays >= 0 && diffDays <= 90;
          default: return true;
        }
      });
    }

    return results;
  }

  /**
   * Get ALL active clients regardless of marketing consent.
   * ONLY for one-time onboarding/informational emails under GDPR Art. 6(1)(b)/(f).
   * Returns clients with `marketing_consent` field so the UI can differentiate.
   */
  async getAllActiveClients(search?: string, filters?: ClientFilters): Promise<MarketingClient[]> {
    const cid = this.companyId;
    if (!cid) return [];

    let query = this.sb
      .from('clients')
      .select('id, name, surname, email, phone, marketing_consent, birth_date')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('surname', { ascending: true })
      .limit(500);

    // Apply filters
    if (filters) {
      query = this.applyFilters(query, filters, {});
    }

    if (search) {
      const term = `%${search}%`;
      query = query.or(`name.ilike.${term},surname.ilike.${term},email.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    let results = (data || []) as MarketingClient[];

    // Client-side birthday filter
    if (filters?.birthdayIn) {
      const now = new Date();
      const year = now.getFullYear();
      results = results.filter(c => {
        if (!c.birth_date) return false;
        const birth = new Date(c.birth_date);
        const thisYearBirthday = new Date(year, birth.getMonth(), birth.getDate());
        const nextBirthday = thisYearBirthday < now
          ? new Date(year + 1, birth.getMonth(), birth.getDate())
          : thisYearBirthday;

        const diffDays = Math.ceil((nextBirthday.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        switch (filters.birthdayIn) {
          case 'week': return diffDays >= 0 && diffDays <= 7;
          case 'month': return diffDays >= 0 && diffDays <= 30;
          case '3months': return diffDays >= 0 && diffDays <= 90;
          default: return true;
        }
      });
    }

    return results;
  }

  async getFilterOptions(): Promise<FilterOptions> {
    const cid = this.companyId;
    if (!cid) return { localities: [], tiers: [], sources: [], languages: [], tags: [] };

    // Load localities
    const { data: locData } = await this.sb
      .from('localities')
      .select('id, name, postal_code, province')
      .limit(500);

    // Load distinct tiers
    const { data: tierData } = await this.sb
      .from('clients')
      .select('tier')
      .eq('company_id', cid)
      .not('tier', 'is', null)
      .limit(1000);

    // Load distinct sources
    const { data: sourceData } = await this.sb
      .from('clients')
      .select('source')
      .eq('company_id', cid)
      .not('source', 'is', null)
      .limit(1000);

    // Load distinct tags — fetch the tags array from clients, then flatten + dedupe client-side.
    // PostgREST can't `unnest` a text[] column directly, so we aggregate in JS.
    const { data: tagData } = await this.sb
      .from('clients')
      .select('tags')
      .eq('company_id', cid)
      .not('tags', 'is', null)
      .limit(1000);

    // Hardcoded languages
    const languages = ['es', 'ca', 'en', 'de', 'fr', 'pt', 'it', 'eu', 'gl'];

    // Extract unique values
    const tiers = [...new Set((tierData || []).map((r: any) => r.tier).filter(Boolean))] as string[];
    const sources = [...new Set((sourceData || []).map((r: any) => r.source).filter(Boolean))] as string[];

    // Flatten and dedupe tags (each client can have multiple tags)
    const tagSet = new Set<string>();
    for (const row of (tagData || []) as any[]) {
      if (Array.isArray(row.tags)) {
        for (const t of row.tags) {
          if (t) tagSet.add(t);
        }
      }
    }
    const tags = Array.from(tagSet).sort();

    const localities: Locality[] = (locData || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      postal_code: r.postal_code,
      province: r.province,
    }));

    return { localities, tiers, sources, languages, tags };
  }

  // ── Campaign Execution ─────────────────────────────────────

  async sendCampaign(campaignId: string): Promise<{ sent: number; failed: number }> {
    const { data, error } = await this.sb.functions.invoke('send-campaign', {
      body: { campaignId },
    });

    if (error) throw new Error(error.message || 'Error sending campaign');
    return data as { sent: number; failed: number };
  }
}
