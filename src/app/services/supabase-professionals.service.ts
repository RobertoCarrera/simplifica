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

export interface ProfessionalTitle {
    id: string;
    company_id: string;
    name: string;
    created_at: string;
}

export interface ProfessionalSchedule {
    id: string;
    professional_id: string;
    day_of_week: number; // 0=Sunday, 1=Monday...
    start_time: string; // HH:mm:ss
    end_time: string;
    break_start?: string;
    break_end?: string;
    is_active: boolean;
}

export interface ProfessionalDocument {
    id: string;
    professional_id: string;
    name: string;
    file_url: string;
    type: string;
    is_signed: boolean;
    signed_at?: string;
    signature_url?: string;
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

    // --- Titles Management ---

    async getProfessionalTitles(): Promise<ProfessionalTitle[]> {
        const companyId = this.companyId;
        if (!companyId) return [];

        const { data, error } = await this.supabase
            .from('professional_titles')
            .select('*')
            .eq('company_id', companyId)
            .order('name');

        if (error) throw error;
        return data || [];
    }

    async createProfessionalTitle(name: string): Promise<ProfessionalTitle> {
        const companyId = this.companyId;
        if (!companyId) throw new Error('No company ID');

        const { data, error } = await this.supabase
            .from('professional_titles')
            .insert({ name, company_id: companyId })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteProfessionalTitle(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('professional_titles')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    // --- Storage ---

    async uploadAvatar(file: File): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${fileName}`;
        
        const { error } = await this.supabase.storage
            .from('professional-avatars')
            .upload(filePath, file, { upsert: true });

        if (error) throw error;

        const { data } = this.supabase.storage
            .from('professional-avatars')
            .getPublicUrl(filePath);

        return data.publicUrl;
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
            .upsert({
                user_id: professional.user_id,
                company_id: professional.company_id || this.companyId,
                display_name: professional.display_name,
                title: professional.title,
                bio: professional.bio,
                avatar_url: professional.avatar_url,
                is_active: professional.is_active ?? true
            }, {
                onConflict: 'user_id, company_id'
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

        // First get role IDs for the desired roles from app_roles
        const { data: roles } = await this.supabase
            .from('app_roles')
            .select('id')
            .in('name', ['owner', 'admin', 'member', 'professional']);
        const roleIds = (roles || []).map((r: any) => r.id);

        const { data, error } = await this.supabase
            .from('company_members')
            .select('user_id, users:user_id(id, email, name, surname)')
            .eq('company_id', companyId)
            .in('role_id', roleIds);

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

    // --- Schedules ---

    async getProfessionalSchedules(professionalId: string): Promise<ProfessionalSchedule[]> {
        const { data, error } = await this.supabase
            .from('professional_schedules')
            .select('*')
            .eq('professional_id', professionalId)
            .order('day_of_week');

        if (error) throw error;
        return data || [];
    }

    async saveProfessionalSchedule(schedule: Partial<ProfessionalSchedule>): Promise<ProfessionalSchedule> {
        const { data, error } = await this.supabase
            .from('professional_schedules')
            .upsert({
                professional_id: schedule.professional_id,
                day_of_week: schedule.day_of_week,
                start_time: schedule.start_time,
                end_time: schedule.end_time,
                break_start: schedule.break_start,
                break_end: schedule.break_end,
                is_active: schedule.is_active
            }, {
                onConflict: 'professional_id, day_of_week'
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // --- Documents ---

    async getProfessionalDocuments(professionalId: string): Promise<ProfessionalDocument[]> {
        const { data, error } = await this.supabase
            .from('professional_documents')
            .select('*')
            .eq('professional_id', professionalId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async uploadProfessionalDocument(professionalId: string, file: File, type: string): Promise<ProfessionalDocument> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${professionalId}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        const { error: uploadError } = await this.supabase.storage
            .from('professional-documents')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = this.supabase.storage
            .from('professional-documents')
            .getPublicUrl(fileName);

        const { data, error } = await this.supabase
            .from('professional_documents')
            .insert({
                professional_id: professionalId,
                name: file.name,
                file_url: urlData.publicUrl,
                type: type
            })
            .select()
            .single();
            
        if (error) throw error;
        return data;
    }

    async deleteProfessionalDocument(id: string): Promise<void> {
        // ideally we should also delete from storage, but for now just DB record
        const { error } = await this.supabase
            .from('professional_documents')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async signDocument(documentId: string, signatureBlob: Blob): Promise<ProfessionalDocument> {
        const fileName = `signatures/${documentId}_${Date.now()}.png`;
        
        const { error: uploadError } = await this.supabase.storage
            .from('professional-signatures')
            .upload(fileName, signatureBlob);

        if (uploadError) throw uploadError;

        const { data: urlData } = this.supabase.storage
            .from('professional-signatures')
            .getPublicUrl(fileName);

        const { data, error } = await this.supabase
            .from('professional_documents')
            .update({
                is_signed: true,
                signed_at: new Date().toISOString(),
                signature_url: urlData.publicUrl
            })
            .eq('id', documentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
