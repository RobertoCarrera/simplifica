import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface Lead {
    id: string;
    first_name: string;
    last_name?: string;
    email?: string;
    phone?: string;
    status: 'new' | 'contacted' | 'no_answer' | 'meeting_scheduled' | 'won' | 'lost';
    source: 'web_form' | 'doctoralia' | 'top_doctors' | 'whatsapp' | 'phone' | 'referral' | 'other';
    interest?: string;
    notes?: string;
    assigned_to?: string;
    metadata?: any;
    created_at: string;
    updated_at: string;
    company_id: string;
}

@Injectable({
    providedIn: 'root'
})
export class LeadService {
    private supabase = inject(SupabaseClientService).instance;

    /**
     * Get all leads for the current company
     */
    getLeads(companyId: string): Observable<Lead[]> {
        const query = this.supabase
            .from('leads')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        return from(query).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return (data || []) as Lead[];
            }),
            catchError(err => {
                console.error('Error fetching leads:', err);
                return of([]);
            })
        );
    }

    /**
     * Update lead status
     */
    async updateLeadStatus(leadId: string, status: Lead['status']): Promise<Lead | null> {
        const { data, error } = await this.supabase
            .from('leads')
            .update({ status })
            .eq('id', leadId)
            .select()
            .single();

        if (error) throw error;
        return data as Lead;
    }

    /**
     * Create a new lead manually
     */
    async createLead(lead: Partial<Lead>): Promise<Lead | null> {
        const { data, error } = await this.supabase
            .from('leads')
            .insert(lead)
            .select()
            .single();

        if (error) throw error;
        return data as Lead;
    }

    /**
   * Update lead details
   */
    async updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
        const { data, error } = await this.supabase
            .from('leads')
            .update(updates)
            .eq('id', leadId)
            .select()
            .single();

        if (error) throw error;
        return data as Lead;
    }
}
