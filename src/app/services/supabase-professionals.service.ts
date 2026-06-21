import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { Observable, from, map } from 'rxjs';

export interface Professional {
    id: string;
    user_id: string;
    company_id: string;
    display_name: string;
    email?: string;
    title?: string;
    bio?: string;
    avatar_url?: string;
    is_active: boolean;
    is_public?: boolean; // Client-facing visibility for agenda/bookings
    color?: string; // HEX color for calendar
    google_calendar_id?: string;
    default_resource_id?: string;
    calendar_views?: string[]; // up to 3: 'day' | '3days' | 'week' | 'month' — not agenda (owner-only)
    slug?: string; // URL-safe identifier auto-generated from display_name
    created_at: string;
    updated_at: string;
    // Joined data
    services?: { id: string; name: string }[];
    schedules?: ProfessionalSchedule[];
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

export interface TimeSlot {
    start: string; // HH:mm
    end: string;   // HH:mm
}

export interface ProfessionalSchedule {
    id: string;
    professional_id: string;
    day_of_week: number; // 0=Sunday, 1=Monday...
    slots: TimeSlot[];     // Multiple time slots for split shifts
    is_active: boolean;
    // Legacy fields for backward compatibility
    start_time?: string; // HH:mm:ss
    end_time?: string;
    break_start?: string;
    break_end?: string;
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
            .select('id, company_id, name, created_at')
            .eq('company_id', companyId)
            .order('name')
            .limit(500);

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
        const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            throw new Error('Tipo de imagen no permitido. Use JPEG, PNG, GIF o WebP.');
        }
        if (file.size > MAX_AVATAR_SIZE) {
            throw new Error('La imagen supera el tamaño máximo permitido (5 MB).');
        }

        const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
        const fileExt = (file.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
            throw new Error('Extensión de archivo no permitida.');
        }
        const fileName = `${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
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

    async getProfessionalById(id: string): Promise<Professional | null> {
        const { data, error } = await this.supabase
            .from('professionals')
            .select(`
                *,
                user:users!professionals_user_id_fkey(id, email, name, surname),
                services:professional_services(service:services(id, name)),
                schedules:professional_schedules(id, day_of_week, start_time, end_time, is_active, slots)
            `)
            .eq('id', id)
            .single();
        if (error) throw error;
        if (!data) return null;

        // Map schedules with slots conversion (same as getProfessionalSchedules)
        const mappedSchedules = (data as any).schedules?.map((s: any) => {
            if (s.slots && Array.isArray(s.slots) && s.slots.length > 0) {
                return {
                    ...s,
                    slots: s.slots.map((slot: any) => ({
                        start: typeof slot.start === 'string' ? slot.start.substring(0, 5) : slot.start,
                        end: typeof slot.end === 'string' ? slot.end.substring(0, 5) : slot.end
                    }))
                };
            }
            return {
                ...s,
                slots: [{ start: s.start_time?.substring(0,5) || '09:00', end: s.end_time?.substring(0,5) || '18:00' }]
            };
        });

        return {
            ...data,
            schedules: mappedSchedules || [],
            services: (data as any).services?.map((ps: any) => ps.service) || [],
            color: (data as any).color || undefined,
        } as Professional;
    }

    getProfessionals(companyId?: string, includeInactive = false): Observable<Professional[]> {
        const targetCompanyId = companyId || this.companyId;
        if (!targetCompanyId) return from(Promise.resolve([]));

        let query = this.supabase
            .from('professionals')
            .select(`
                    *,
                    user:users!professionals_user_id_fkey(id, email, name, surname),
                    services:professional_services(service:services(id, name)),
                    schedules:professional_schedules(id, day_of_week, start_time, end_time, is_active, slots)
                `)
            .eq('company_id', targetCompanyId);

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        return from(
            query
                .order('display_name')
                .limit(100)
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                // Flatten services and map schedules with slots conversion
                return (data || []).map((p: any) => {
                    const mappedSchedules = p.schedules?.map((s: any) => {
                        if (s.slots && Array.isArray(s.slots) && s.slots.length > 0) {
                            return {
                                ...s,
                                slots: s.slots.map((slot: any) => ({
                                    start: typeof slot.start === 'string' ? slot.start.substring(0, 5) : slot.start,
                                    end: typeof slot.end === 'string' ? slot.end.substring(0, 5) : slot.end
                                }))
                            };
                        }
                        return {
                            ...s,
                            slots: [{ start: s.start_time?.substring(0,5) || '09:00', end: s.end_time?.substring(0,5) || '18:00' }]
                        };
                    });
                    return {
                        ...p,
                        schedules: mappedSchedules || [],
                        services: p.services?.map((ps: any) => ps.service) || [],
                        color: p.color || undefined
                    };
                });
            })
        );
    }

    /** Lightweight query for dropdowns/calendars — no nested JOINs */
    getProfessionalsBasic(companyId?: string): Observable<Pick<Professional, 'id' | 'user_id' | 'company_id' | 'display_name' | 'color' | 'is_active' | 'is_public' | 'calendar_views' | 'slug'>[]> {
        const targetCompanyId = companyId || this.companyId;
        if (!targetCompanyId) return from(Promise.resolve([]));

        return from(
            this.supabase
                .from('professionals')
                .select('id, user_id, company_id, display_name, color, is_active, is_public, calendar_views, slug')
                .eq('company_id', targetCompanyId)
                .eq('is_public', true)
                .order('display_name')
                .limit(200)
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return (data || []) as any[];
            })
        );
    }

    subscribeToChanges(callback: () => void, companyId?: string): RealtimeChannel | null {
        const targetCompanyId = companyId || this.companyId;
        if (!targetCompanyId) return null;

        return this.supabase
            .channel(`public:professionals:company_id=eq.${targetCompanyId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'professionals', filter: `company_id=eq.${targetCompanyId}` },
                () => {
                    callback();
                }
            )
            .subscribe();
    }

    async linkOrCreateMyProfessional(): Promise<{ id: string; is_new: boolean }> {
        const { data, error } = await this.supabase.rpc('link_or_create_my_professional');
        if (error) throw error;
        return data as { id: string; is_new: boolean };
    }

    async createProfessional(professional: Partial<Professional>): Promise<Professional> {
        // If there's an email but no user_id, we just insert.
        // If there's a user_id, we upsert on user_id + company_id.
        // Since we may not have user_id when inviting, we might need a regular insert or upsert based on email too?
        // Let's just do an insert if there's no user_id, or upsert if there is.
        // Actually, PostgREST upsert requires the conflict columns. If user_id is null, it might create duplicates.
        // But for our case, if we have email, we can just insert and rely on accept_company_invitation to link it.

        // Enforce the business rule at the application layer too: you cannot
        // create a pro that is_public=true but is_active=false. The DB CHECK
        // constraint `professionals_public_requires_active` will reject the
        // row if we don't normalize here, so this gives a friendlier error.
        const isActive = professional.is_active ?? true;
        const wantsPublic = professional.is_public ?? true;
        const isPublic = isActive ? wantsPublic : false;

        const payload = {
            user_id: professional.user_id || null,
            company_id: professional.company_id || this.companyId,
            display_name: professional.display_name,
            email: professional.email || null,
            title: professional.title,
            bio: professional.bio,
            avatar_url: professional.avatar_url,
            google_calendar_id: professional.google_calendar_id || null,
            default_resource_id: professional.default_resource_id || null,
            is_active: isActive,
            is_public: isPublic,
            color: professional.color || null
        };

        let request;
        
        if (professional.user_id) {
            request = this.supabase
                .from('professionals')
                .upsert(payload, { onConflict: 'user_id, company_id' })
                .select()
                .single();
        } else {
            request = this.supabase
                .from('professionals')
                .insert([payload])
                .select()
                .single();
        }

        const { data, error } = await request;

        if (error) throw error;
        return data;
    }

    async updateProfessional(id: string, updates: Partial<Professional>): Promise<Professional> {
        // Enforce the business rule: if the caller is flipping is_active to
        // false, force is_public to false too (a deactivated pro must not
        // remain public). The DB CHECK constraint would catch this anyway,
        // but normalizing here lets the UI stay consistent without 400s.
        let nextIsPublic = updates.is_public;
        if (updates.is_active === false) {
            nextIsPublic = false;
        }
        // Symmetric guard: if the caller is trying to set is_public=true but
        // not setting is_active, we have to read the current row to know
        // whether to allow it. Cheaper to let the DB CHECK constraint reject
        // it in that rare case and let the UI handle the error.

        const { data, error } = await this.supabase
            .from('professionals')
            .update({
                user_id: updates.user_id ?? undefined,
                display_name: updates.display_name,
                email: updates.email,
                title: updates.title,
                bio: updates.bio,
                avatar_url: updates.avatar_url,
                google_calendar_id: updates.google_calendar_id,
                default_resource_id: updates.default_resource_id,
                is_active: updates.is_active,
                is_public: nextIsPublic,
                color: updates.color,
                calendar_views: updates.calendar_views,
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
            .rpc('list_company_members', { p_company_id: companyId });

        if (error) throw error;

        const result = data as { success: boolean; users?: any[]; error?: string };
        if (!result?.success) return [];

        return (result.users || []).map((u: any) => ({
            id: u.id,
            user_id: u.id,
            full_name: u.name || '',
            email: u.email || ''
        }));
    }

    /**
     * Returns the company's bookable services.
     *
     * When `professionalId` is provided, the result is filtered at the DB level
     * to only services that are assigned to that professional via the
     * `professional_services` junction table. This prevents professionals from
     * seeing (and being assigned) services they are not qualified to perform.
     *
     * Pass `null`/`undefined` to return all bookable services for the company
     * (used by the professionals management tab where you need the full list
     * to assign services).
     *
     * NOTE: this method does NOT filter by `professionals.is_public`. The
     * `is_public` flag controls whether a professional appears in the public
     * client-facing booking URL — it is NOT a permission boundary for the
     * internal CRM. An admin creating a booking for a non-public pro from
     * the calendar modal must still see that pro's services. The public
     * URL has its own endpoint that DOES apply the is_public filter.
     */
    async getBookableServices(
        professionalId?: string | null,
    ): Promise<{ id: string; name: string; duration_minutes?: number }[]> {
        const companyId = this.companyId;
        if (!companyId) return [];

        const baseFilters = (q: any) =>
            q
                .eq('company_id', companyId)
                .eq('is_bookable', true)
                .eq('is_active', true)
                .is('deleted_at', null)
                .order('name')
                .limit(500);

        const { data, error } = professionalId
            ? // INNER JOIN with professional_services: the service must have a
              // matching row for the given professional. `!inner` filters at
              // the DB level — services the professional is not assigned to
              // are never returned, eliminating any client-side bypass.
              await baseFilters(
                  this.supabase
                      .from('services')
                      .select(
                          'id, name, duration_minutes, professional_services!inner(professional_id)',
                      ),
              ).eq('professional_services.professional_id', professionalId)
            : await baseFilters(
                  this.supabase.from('services').select('id, name, duration_minutes'),
              );

        if (error) throw error;
        return (data || []) as { id: string; name: string; duration_minutes?: number }[];
    }

    // --- Schedules ---

    async getProfessionalSchedules(professionalId: string): Promise<ProfessionalSchedule[]> {
        const { data, error } = await this.supabase
            .from('professional_schedules')
            .select('id, professional_id, day_of_week, start_time, end_time, is_active, slots')
            .eq('professional_id', professionalId)
            .order('day_of_week')
            .limit(500);

        if (error) throw error;
        return (data || []).map(s => {
            // If slots exists and has data, use it; otherwise convert from legacy start_time/end_time
            if (s.slots && Array.isArray(s.slots) && s.slots.length > 0) {
                return {
                    ...s,
                    slots: s.slots.map((slot: any) => ({
                        start: typeof slot.start === 'string' ? slot.start.substring(0, 5) : slot.start,
                        end: typeof slot.end === 'string' ? slot.end.substring(0, 5) : slot.end
                    }))
                };
            }
            // Fallback to legacy format
            return {
                ...s,
                slots: [{ start: s.start_time?.substring(0,5) || '09:00', end: s.end_time?.substring(0,5) || '18:00' }]
            };
        });
    }

    async saveProfessionalSchedule(schedule: Partial<ProfessionalSchedule>): Promise<ProfessionalSchedule> {
        // Handle slots array - use first slot for backward compatibility, save all to JSONB column
        const firstSlot = schedule.slots && schedule.slots.length > 0 ? schedule.slots[0] : null;

        const payload: any = {
            professional_id: schedule.professional_id,
            day_of_week: schedule.day_of_week,
            start_time: firstSlot ? firstSlot.start + ':00' : schedule.start_time,
            end_time: firstSlot ? firstSlot.end + ':00' : schedule.end_time,
            slots: schedule.slots || null, // Persist full slots array to JSONB column
            is_active: schedule.is_active
        };

        if (schedule.id) {
            // Usamos update explícito porque el UPSERT de supabase no siempre limpia valores a null
            const { data, error } = await this.supabase
                .from('professional_schedules')
                .update(payload)
                .eq('id', schedule.id)
                .select()
                .single();

            if (error) throw error;
            return { ...data, slots: schedule.slots || [] };
        }

        const { data, error } = await this.supabase
            .from('professional_schedules')
            .upsert(payload, {
                onConflict: 'professional_id,day_of_week'
            })
            .select()
            .single();

        if (error) throw error;
        return { ...data, slots: schedule.slots || [] };
    }

    // --- Documents ---

    async getProfessionalDocuments(professionalId: string): Promise<ProfessionalDocument[]> {
        const { data, error } = await this.supabase
            .from('professional_documents')
            .select('id, professional_id, name, file_url, type, is_signed, signed_at, signature_url, created_at')
            .eq('professional_id', professionalId)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;
        return data || [];
    }

    async uploadProfessionalDocument(professionalId: string, file: File, type: string): Promise<ProfessionalDocument> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${professionalId}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await this.supabase.storage
            .from('professional-documents')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        // professional-documents is PRIVATE — getPublicUrl() returns a broken URL.
        // Use createSignedUrl with 1h expiry. Rafter v0.14.1
        const { data: signedData, error: signedError } = await this.supabase.storage
            .from('professional-documents')
            .createSignedUrl(fileName, 3600);

        if (signedError) throw signedError;

        const { data, error } = await this.supabase
            .from('professional_documents')
            .insert({
                professional_id: professionalId,
                name: file.name,
                file_url: signedData.signedUrl,
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

        // professional-signatures is PRIVATE (PII: handwritten signatures) —
        // getPublicUrl() returns a broken URL. Use createSignedUrl with 1h expiry.
        // Rafter v0.14.1
        const { data: signedData, error: signedError } = await this.supabase.storage
            .from('professional-signatures')
            .createSignedUrl(fileName, 3600);

        if (signedError) throw signedError;

        const { data, error } = await this.supabase
            .from('professional_documents')
            .update({
                is_signed: true,
                signed_at: new Date().toISOString(),
                signature_url: signedData.signedUrl
            })
            .eq('id', documentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
