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
    lead_source_id?: string;
    gdpr_consent_sent_at?: string;
    gdpr_accepted?: boolean;
    lead_source?: { id: string; name: string };
}

export interface LeadSource {
    id: string;
    company_id: string;
    name: string;
    is_active: boolean;
}

export interface LeadInteraction {
    id: string;
    lead_id: string;
    user_id: string;
    type: 'call' | 'email' | 'meeting' | 'note' | 'whatsapp' | 'other';
    summary: string;
    created_at: string;
    user?: {
        full_name: string;
        email: string;
    };
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
            .select('*, lead_source:lead_source_id(name)')
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

    /**
     * Get a single lead by ID
     */
    async getLead(id: string): Promise<Lead | null> {
        const { data, error } = await this.supabase
            .from('leads')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Lead;
    }

    /**
     * Get interactions for a lead
     */
    async getInteractions(leadId: string): Promise<LeadInteraction[]> {
        const { data, error } = await this.supabase
            .from('lead_interactions')
            .select('*, user:user_id(name, surname, email)')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching interactions', error);
            return [];
        }
        return (data || []) as LeadInteraction[];
    }

    /**
     * Add a new interaction
     */
    async addInteraction(interaction: Partial<LeadInteraction>): Promise<LeadInteraction> {
        const { data: user } = await this.supabase.auth.getUser();
        if (user.user) {
            interaction.user_id = user.user.id;
        }

        const { data, error } = await this.supabase
            .from('lead_interactions')
            .insert(interaction)
            .select()
            .single();

        if (error) throw error;
        return data as LeadInteraction;
    }

    /**
     * Get lead sources
     */
    async getLeadSources(companyId: string): Promise<LeadSource[]> {
        const { data, error } = await this.supabase
            .from('lead_sources')
            .select('*')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .order('name');

        if (error) throw error;
        return (data || []) as LeadSource[];
    }

    /**
     * Create lead source
     */
    async createLeadSource(name: string, companyId: string): Promise<LeadSource> {
        const { data, error } = await this.supabase
            .from('lead_sources')
            .insert({ name, company_id: companyId })
            .select()
            .single();

        if (error) throw error;
        return data as LeadSource;
    }
    /**
     * Delete a lead source (Soft delete by setting is_active = false)
     */
    async deleteLeadSource(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('lead_sources')
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw error;
    }

    async sendGdprRequest(leadId: string, email: string, name: string): Promise<void> {
        const { error: emailError } = await this.supabase.functions.invoke('send-email', {
            body: {
                to: [email],
                subject: 'Consentimiento para Tratamiento de Datos - CAIBS',
                body: `Hola ${name},

Para poder continuar ofreciéndote nuestros servicios de psicología y salud, necesitamos tu consentimiento explícito para el tratamiento de tus datos personales, conforme al RGPD.

Por favor, responde a este correo confirmando que ACEPTAS el tratamiento de tus datos para fines de gestión de citas y comunicación profesional.

Atentamente,
El equipo de CAIBS`,
                fromName: 'CAIBS Admin',
                // fromEmail omitted to use default
            }
        });

        if (emailError) throw emailError;

        const { error: dbError } = await this.supabase
            .from('leads')
            .update({ gdpr_consent_sent_at: new Date() })
            .eq('id', leadId);

        if (dbError) throw dbError;
    }

    /**
     * Delete a lead
     */
    async deleteLead(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('leads')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
}
