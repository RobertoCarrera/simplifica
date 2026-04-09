import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { Observable, from, map } from 'rxjs';

export interface Resource {
    id: string;
    company_id: string;
    name: string;
    type?: string;
    capacity?: number;
    description?: string;
    google_calendar_id?: string;
    created_at: string;
    updated_at: string;
    resource_services?: { service_id: string }[];
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseResourcesService {
    private supabase = inject(SupabaseClientService).instance;
    private authService = inject(AuthService);

    get companyId(): string | undefined {
        return this.authService.currentCompanyId() ?? undefined;
    }

    getResources(companyId?: string): Observable<Resource[]> {
        const targetCompanyId = companyId || this.companyId;
        if (!targetCompanyId) return from(Promise.resolve([]));

        return from(
            this.supabase
                .from('resources')
                .select('id, company_id, name, description, type, is_active, color, order_position, created_at, updated_at, resource_services(service_id)')
                .eq('company_id', targetCompanyId)
                .order('name')
                .limit(500)
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data || [];
            })
        );
    }

    subscribeToChanges(callback: () => void, companyId?: string): RealtimeChannel | null {
        const targetCompanyId = companyId || this.companyId;
        if (!targetCompanyId) return null;

        return this.supabase
            .channel(`public:resources:company_id=eq.${targetCompanyId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'resources', filter: `company_id=eq.${targetCompanyId}` },
                () => {
                    callback();
                }
            )
            .subscribe();
    }

    async createResource(resource: Partial<Resource>): Promise<Resource> {
        const payload = {
            company_id: resource.company_id || this.companyId,
            name: resource.name,
            type: resource.type,
            capacity: resource.capacity,
            description: resource.description,
            google_calendar_id: resource.google_calendar_id || null
        };

        const { data, error } = await this.supabase
            .from('resources')
            .insert([payload])
            .select()
            .single();

        if (error) throw error;

        if (resource.resource_services && resource.resource_services.length > 0) {
            const servicesPayload = resource.resource_services.map(s => ({
                resource_id: data.id,
                service_id: s.service_id
            }));
            const { error: servicesError } = await this.supabase
                .from('resource_services')
                .insert(servicesPayload);
            if (servicesError) throw servicesError;
        }

        return data;
    }

    async updateResource(id: string, updates: Partial<Resource>): Promise<Resource> {
        const { data, error } = await this.supabase
            .from('resources')
            .update({
                name: updates.name,
                type: updates.type,
                capacity: updates.capacity,
                description: updates.description,
                google_calendar_id: updates.google_calendar_id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Update services: delete existing, then insert new ones
        if (updates.resource_services !== undefined) {
            const { error: deleteError } = await this.supabase
                .from('resource_services')
                .delete()
                .eq('resource_id', id);
            
            if (deleteError) throw deleteError;

            if (updates.resource_services.length > 0) {
                const servicesPayload = updates.resource_services.map(s => ({
                    resource_id: id,
                    service_id: s.service_id
                }));
                const { error: insertError } = await this.supabase
                    .from('resource_services')
                    .insert(servicesPayload);
                if (insertError) throw insertError;
            }
        }

        return data;
    }

    async deleteResource(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('resources')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
}
