import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { Observable, from, map } from 'rxjs';

export interface Professional {
    id: string;
    user_id: string;
    company_id: string;
    display_name: string;
    title?: string;
    bio?: string;
    avatar_url?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // Joined data
    services?: { id: string; name: string }[];
    user?: { email?: string; name?: string; surname?: string };
}

export interface ProfessionalService {
    id: string;
    professional_id: string;
    service_id: string;
    created_at: string;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseProfessionalsService {
    private supabase = inject(SupabaseClientService).instance;
    private authService = inject(AuthService);

    get companyId(): string | undefined {
        return this.authService.currentCompanyId() ?? undefined;
    }

    // --- Professionals CRUD ---

    getProfessionals(companyId?: string): Observable<Professional[]> {
        const targetCompanyId = companyId || this.companyId;
        if (!targetCompanyId) return from(Promise.resolve([]));

        return from(
            this.supabase
                .from('professionals')
                .select(`
                    *,
                    user:users(id, email, name, surname),
                    services:professional_services(service:services(id, name))
                `)
                .eq('company_id', targetCompanyId)
                .order('display_name')
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                // Flatten services from join
                return (data || []).map((p: any) => ({
                    ...p,
                    services: p.services?.map((ps: any) => ps.service) || []
                }));
            })
        );
    }

    async createProfessional(professional: Partial<Professional>): Promise<Professional> {
        const { data, error } = await this.supabase
            .from('professionals')
            .insert({
                user_id: professional.user_id,
                company_id: professional.company_id || this.companyId,
                display_name: professional.display_name,
                title: professional.title,
                bio: professional.bio,
                avatar_url: professional.avatar_url,
                is_active: professional.is_active ?? true
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateProfessional(id: string, updates: Partial<Professional>): Promise<Professional> {
        const { data, error } = await this.supabase
            .from('professionals')
            .update({
                display_name: updates.display_name,
                title: updates.title,
                bio: updates.bio,
                avatar_url: updates.avatar_url,
                is_active: updates.is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteProfessional(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('professionals')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // --- Professional Services (Junction) ---

    async assignServices(professionalId: string, serviceIds: string[]): Promise<void> {
        // 1. Remove all current assignments
        const { error: deleteError } = await this.supabase
            .from('professional_services')
            .delete()
            .eq('professional_id', professionalId);

        if (deleteError) throw deleteError;

        if (serviceIds.length === 0) return;

        // 2. Insert new assignments
        const inserts = serviceIds.map(serviceId => ({
            professional_id: professionalId,
            service_id: serviceId
        }));

        const { error: insertError } = await this.supabase
            .from('professional_services')
            .insert(inserts);

        if (insertError) throw insertError;
    }

    // --- Helpers ---

    async getCompanyMembers(): Promise<{ id: string; user_id: string; full_name: string; email: string }[]> {
        const companyId = this.companyId;
        if (!companyId) return [];

        const { data, error } = await this.supabase
            .from('company_members')
            .select('user_id, users:user_id(id, email, name, surname)')
            .eq('company_id', companyId)
            .in('role', ['owner', 'admin', 'member', 'professional']);

        if (error) throw error;

        return (data || []).map((m: any) => ({
            id: m.user_id,
            user_id: m.user_id,
            full_name: [m.users?.name, m.users?.surname].filter(Boolean).join(' ') || '',
            email: m.users?.email || ''
        }));
    }

    async getBookableServices(): Promise<{ id: string; name: string }[]> {
        const companyId = this.companyId;
        if (!companyId) return [];

        const { data, error } = await this.supabase
            .from('services')
            .select('id, name')
            .eq('company_id', companyId)
            .eq('is_bookable', true)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('name');

        if (error) throw error;
        return data || [];
    }
}
