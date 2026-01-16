import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { Observable, from, map } from 'rxjs';

export interface BookingType {
    id: string;
    company_id: string;
    owner_id?: string | null;
    name: string;
    slug: string;
    description?: string;
    duration: number;
    price: number;
    currency: string;
    is_active: boolean;
    created_at?: string;
    google_event_id?: string | null;
}

export interface Resource {
    id: string;
    company_id: string;
    name: string;
    type: string;
    capacity: number;
    description?: string;
    is_active: boolean;
}

export interface AvailabilitySchedule {
    id?: string;
    user_id: string;
    booking_type_id?: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_unavailable: boolean;
}

export interface Booking {
    id: string;
    company_id: string;
    booking_type_id?: string;
    service_id?: string;
    resource_id?: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    start_time: string;
    end_time: string;
    status: 'confirmed' | 'pending' | 'cancelled' | 'rescheduled';
    professional_id?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
    google_event_id?: string | null;
    total_price?: number;
    payment_status?: 'pending' | 'partial' | 'paid' | 'refunded';
    deposit_paid?: number;
    form_responses?: Record<string, any>; // Answers to Intake Form

    // Joined fields
    booking_type?: { name: string; color?: string };
    service?: {
        name: string;
        duration_minutes?: number;
        buffer_minutes?: number;
        min_notice_minutes?: number;
        max_lead_days?: number;
    };
    resource?: { name: string };
    professional?: { user: { name: string } };
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseBookingsService {

    constructor(private sbClient: SupabaseClientService) { }

    private get supabase() {
        return this.sbClient.instance;
    }

    // --- Booking Types ---

    getBookingTypes(companyId: string): Observable<BookingType[]> {
        return from(
            this.supabase
                .from('booking_types')
                .select('*')
                .eq('company_id', companyId)
                .order('name')
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as BookingType[];
            })
        );
    }

    async createBookingType(bookingType: Partial<BookingType>) {
        const { data, error } = await this.supabase
            .from('booking_types')
            .insert(bookingType)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateBookingType(id: string, updates: Partial<BookingType>) {
        const { data, error } = await this.supabase
            .from('booking_types')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteBookingType(id: string) {
        const { error } = await this.supabase
            .from('booking_types')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // --- Resources ---

    getResources(companyId: string): Observable<Resource[]> {
        return from(
            this.supabase
                .from('resources')
                .select('*')
                .eq('company_id', companyId)
                .order('name')
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as Resource[];
            })
        );
    }

    async createResource(resource: Partial<Resource>) {
        const { data, error } = await this.supabase
            .from('resources')
            .insert(resource)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateResource(id: string, updates: Partial<Resource>) {
        const { data, error } = await this.supabase
            .from('resources')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteResource(id: string) {
        const { error } = await this.supabase
            .from('resources')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // --- Availability ---

    getAvailabilitySchedules(userId: string): Observable<AvailabilitySchedule[]> {
        return from(
            this.supabase
                .from('availability_schedules')
                .select('*')
                .eq('user_id', userId)
                .is('booking_type_id', null) // Default schedule
                .order('day_of_week')
                .order('start_time')
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as AvailabilitySchedule[];
            })
        );
    }

    getCompanyDefaultSchedule(companyId: string): Observable<AvailabilitySchedule[]> {
        return from(
            this.supabase.rpc('get_company_schedule', { p_company_id: companyId })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                // RPC returns the rows directly in 'data' when successful
                return (data || []) as AvailabilitySchedule[];
            })
        );
    }

    getBookingConfiguration(companyId: string): Observable<any> {
        return from(
            this.supabase.rpc('get_booking_config', { p_company_id: companyId })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data || {};
            })
        );
    }

    async saveAvailabilitySchedules(userId: string, schedules: AvailabilitySchedule[]) {
        // 1. Delete existing default schedules for user
        const { error: deleteError } = await this.supabase
            .from('availability_schedules')
            .delete()
            .eq('user_id', userId)
            .is('booking_type_id', null);

        if (deleteError) throw deleteError;

        if (schedules.length === 0) return;

        // 2. Insert new
        const { error: insertError } = await this.supabase
            .from('availability_schedules')
            .insert(schedules);

        if (insertError) throw insertError;
    }

    // --- Bookings ---

    getBookings(companyId: string, fromDate: Date, toDate: Date): Observable<Booking[]> {
        const fromStr = fromDate.toISOString();
        const toStr = toDate.toISOString();

        return from(
            this.supabase
                .from('bookings')
                .select(`
                    *,
                    booking_type:booking_types(name),
                    resource:resources(name),
                    service:services(name, form_schema, buffer_minutes, min_notice_minutes, max_lead_days),
                    professional:professionals!professional_id(
                        user:users(name)
                    )
                `)
                .eq('company_id', companyId)
                .gte('start_time', fromStr)
                .lte('end_time', toStr)
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data;
            })
        );
    }

    getMyBookings(companyId: string): Observable<Booking[]> {
        return from(
            this.supabase
                .from('bookings')
                .select(`
                    *,
                    service:services(name, duration_minutes, buffer_minutes),
                    booking_type:booking_types(name)
                `)
                .eq('company_id', companyId)
                .order('start_time', { ascending: true })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as Booking[];
            })
        );
    }

    async createBooking(booking: any) {
        // 1. Insert into DB first
        const { data, error } = await this.supabase
            .from('bookings')
            .insert(booking)
            .select(`
                *,
                service:services(name, duration_minutes, buffer_minutes)
            `)
            .single();

        if (error) throw error;

        // 2. Sync to Google Calendar (Best effort)
        try {
            const bookingWithService = {
                ...booking,
                service_name: data.service?.name, // Add service name for Google Event title
                // Ensure date format or other fields as needed
            };

            // Check if company has integration? The edge function handles checks.
            const { data: googleData, error: googleError } = await this.supabase.functions.invoke('google-calendar', {
                body: {
                    action: 'create_event',
                    companyId: booking.company_id, // Ensure this is passed
                    booking: bookingWithService
                }
            });

            if (googleError) {
                console.warn('Google Calendar Sync Failed (Function Error):', googleError);
            } else if (googleData?.google_event_id) {
                // 3. Update DB with Google Event ID
                await this.supabase
                    .from('bookings')
                    .update({ google_event_id: googleData.google_event_id })
                    .eq('id', data.id);

                data.google_event_id = googleData.google_event_id; // Update local return
            } else {
                console.warn('Google Calendar Sync Failed (No ID returned):', googleData);
            }

        } catch (syncError) {
            console.error('Google Calendar Sync Exception:', syncError);
            // We do NOT throw here, we want the booking to succeed even if sync fails
        }

        return data;
    }

    async createBookingsBatch(bookings: any[]) {
        if (!bookings.length) return [];

        // 1. Batch Insert
        const { data, error } = await this.supabase
            .from('bookings')
            .insert(bookings)
            .select(`
                *,
                service:services(name, duration_minutes, buffer_minutes)
            `);

        if (error) throw error;

        // 2. Sync to Google Calendar (Best effort, individual for now)
        const promises = (data || []).map(async (booking) => {
            try {
                const bookingWithService = {
                    ...booking,
                    service_name: booking.service?.name,
                };

                const { data: googleData, error: googleError } = await this.supabase.functions.invoke('google-calendar', {
                    body: {
                        action: 'create_event',
                        companyId: booking.company_id,
                        booking: bookingWithService
                    }
                });

                if (googleData?.google_event_id) {
                    await this.supabase
                        .from('bookings')
                        .update({ google_event_id: googleData.google_event_id })
                        .eq('id', booking.id);
                }
            } catch (e) {
                console.error('Google Sync failed for recurring booking', e);
            }
        });

        await Promise.all(promises);

        return data;
    }

    async updateBooking(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('bookings')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                service:services(name, duration_minutes, buffer_minutes)
            `)
            .single();

        if (error) throw error;

        // Sync to Google Calendar
        if (data.google_event_id) {
            console.log(`[Sync] Updating Google Event: ${data.google_event_id}`);
            try {
                const bookingWithService = {
                    ...data,
                    service_name: data.service?.name,
                };

                const { data: googleData, error: googleError } = await this.supabase.functions.invoke('google-calendar', {
                    body: {
                        action: 'update_event',
                        companyId: data.company_id,
                        google_event_id: data.google_event_id,
                        booking: bookingWithService
                    }
                });

                if (googleError) {
                    console.error('[Sync] Google Calendar Update Function Error:', googleError);
                    // Optional: Notify user of partial failure but don't block
                } else {
                    console.log('[Sync] Google Calendar Update Success:', googleData);
                }
            } catch (e) {
                console.error('[Sync] Google Calendar Update Exception:', e);
            }
        } else {
            console.warn('[Sync] No google_event_id found. Attempting to creating new Google Event to re-sync...');
            try {
                const bookingWithService = {
                    ...data,
                    service_name: data.service?.name,
                };

                const { data: googleData, error: googleError } = await this.supabase.functions.invoke('google-calendar', {
                    body: {
                        action: 'create_event',
                        companyId: data.company_id,
                        booking: bookingWithService
                    }
                });

                if (googleError) {
                    console.error('[Sync] Auto-create failed (Function Error):', googleError);
                } else if (googleData?.google_event_id) {
                    console.log('[Sync] Auto-create Success. Linking ID:', googleData.google_event_id);
                    // Update DB with new ID
                    await this.supabase
                        .from('bookings')
                        .update({ google_event_id: googleData.google_event_id })
                        .eq('id', id);

                    data.google_event_id = googleData.google_event_id; // Update local reference
                }
            } catch (e) {
                console.error('[Sync] Auto-create Exception:', e);
            }
        }

        return data;
    }

    async deleteBooking(id: string) {
        // 1. Fetch to get Google Event ID
        const { data: booking } = await this.supabase
            .from('bookings')
            .select('company_id, google_event_id')
            .eq('id', id)
            .single();

        // 2. Delete from Google Calendar if linked
        if (booking?.google_event_id) {
            try {
                await this.supabase.functions.invoke('google-calendar', {
                    body: {
                        action: 'delete_event',
                        companyId: booking.company_id,
                        google_event_id: booking.google_event_id
                    }
                });
            } catch (e) {
                console.warn('Google Calendar Delete Failed:', e);
            }
        }

        // 3. Delete from DB
        const { error } = await this.supabase
            .from('bookings')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    // --- Availability Exceptions (Block Days) ---

    getAvailabilityExceptions(companyId: string, fromDate: Date, toDate: Date, userId?: string): Observable<AvailabilityException[]> {
        const fromStr = fromDate.toISOString();
        const toStr = toDate.toISOString();

        let query = this.supabase
            .from('availability_exceptions')
            .select('*')
            .eq('company_id', companyId)
            // Exceptions that overlap with the range:
            // (Start <= RangeEnd) AND (End >= RangeStart)
            .lte('start_time', toStr)
            .gte('end_time', fromStr);

        if (userId) {
            query = query.eq('user_id', userId);
        }

        return from(query).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as AvailabilityException[];
            })
        );
    }

    async createAvailabilityException(exception: any) {
        const { data, error } = await this.supabase
            .from('availability_exceptions')
            .insert(exception)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteAvailabilityException(id: string) {
        const { error } = await this.supabase
            .from('availability_exceptions')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
    async findAvailableResource(companyId: string, resourceType: string, startTime: Date, endTime: Date): Promise<string | null> {
        // 1. Fetch resources of type
        const { data: resources, error: resError } = await this.supabase
            .from('resources')
            .select('id')
            .eq('company_id', companyId)
            .eq('type', resourceType)
            .eq('is_active', true);

        if (resError || !resources || resources.length === 0) return null;

        const resourceIds = resources.map(r => r.id);

        // 2. Fetch overlapping bookings that use these resources
        // Overlap: (StartA < EndB) and (EndA > StartB)
        const { data: bookings, error: bookError } = await this.supabase
            .from('bookings')
            .select('resource_id')
            .eq('company_id', companyId)
            .in('resource_id', resourceIds)
            .neq('status', 'cancelled')
            .lt('start_time', endTime.toISOString()) // B.start < A.end
            .gt('end_time', startTime.toISOString()); // B.end > A.start

        if (bookError) throw bookError;

        const busyResourceIds = new Set((bookings || []).map(b => b.resource_id));

        // 3. Find first free resource
        const freeResource = resources.find(r => !busyResourceIds.has(r.id));

        return freeResource ? freeResource.id : null;
    }

    async checkServiceCapacity(serviceId: string, startTime: Date, endTime: Date): Promise<number> {
        // Count confirmed bookings for this service in this time slot
        // Used for Group Classes (max_capacity > 1)
        const { count, error } = await this.supabase
            .from('bookings')
            .select('*', { count: 'exact', head: true })
            .eq('service_id', serviceId)
            .neq('status', 'cancelled')
            .lt('start_time', endTime.toISOString())
            .gt('end_time', startTime.toISOString());

        if (error) throw error;
        return count || 0;
    }

    /**
     * Checks for conflicts including Buffer Times.
     * @param newBufferMinutes Optional buffer coming AFTER this new appointment
     */
    async checkProfessionalConflict(
        companyId: string,
        professionalId: string,
        startTime: Date,
        endTime: Date,
        excludeBookingId?: string,
        newBufferMinutes: number = 0
    ): Promise<{ hasConflict: boolean, reason?: string }> {
        const startStr = startTime.toISOString();
        const endStr = endTime.toISOString();

        // Calculate the "Effective End Time" for the NEW booking (End + Buffer)
        const newEffectiveEndMs = endTime.getTime() + (newBufferMinutes * 60000);
        const newEffectiveEndStr = new Date(newEffectiveEndMs).toISOString();

        // 1. Check Bookings Overlap
        // Range optimization: Look for bookings starting 2 hours before (max buffer assumption)
        // to ensure we catch those with long buffers.
        const searchStart = new Date(startTime.getTime() - 7200000).toISOString();
        const searchEnd = newEffectiveEndStr;

        let query = this.supabase
            .from('bookings')
            .select('id, start_time, end_time, service:services(buffer_minutes)')
            .eq('company_id', companyId)
            //.eq('professional_id', professionalId) // Fix potentially ambiguous column if joined? No, simple select.
            .eq('professional_id', professionalId)
            .neq('status', 'cancelled')
            .lt('start_time', searchEnd)
            .gt('end_time', searchStart);

        if (excludeBookingId) {
            query = query.neq('id', excludeBookingId);
        }

        const { data: bookings, error: bookError } = await query;
        if (bookError) throw bookError;

        if (bookings && bookings.length > 0) {
            for (const b of bookings) {
                const bStart = new Date(b.start_time).getTime();
                const bEnd = new Date(b.end_time).getTime();
                // Safe access to buffer, defaulting to 0
                const bBuffer = (b.service as any)?.buffer_minutes || 0;
                const bEffectiveEnd = bEnd + (bBuffer * 60000);

                // Overlap Check: (NewStart < ExistingEffectiveEnd) AND (NewEffectiveEnd > ExistingStart)
                const newStartMs = startTime.getTime();

                if (newStartMs < bEffectiveEnd && newEffectiveEndMs > bStart) {
                    return { hasConflict: true, reason: 'Conflicto con cita existente (o su tiempo de preparación).' };
                }
            }
        }

        // 2. Check Blocks (Availability Exceptions)
        // Blocks are hard blocks (no buffer usually, or implicit).
        let blockQuery = this.supabase
            .from('availability_exceptions')
            .select('id, reason')
            .eq('company_id', companyId)
            .or(`user_id.eq.${professionalId},user_id.is.null`)
            .lt('start_time', newEffectiveEndStr)
            .gt('end_time', startStr);

        const { data: foundBlocks, error: bErr } = await blockQuery;
        if (bErr) throw bErr;

        if (foundBlocks && foundBlocks.length > 0) {
            return { hasConflict: true, reason: `Horario bloqueado: ${foundBlocks[0].reason || 'Cierre'}` };
        }

        return { hasConflict: false };
    }

    /**
     * Validates business rules like min notice, max lead time, availability window.
     * Does NOT check slot availability (use checkProfessionalConflict for that).
     */
    validateBookingRules(service: any, startTime: Date): { valid: boolean, error?: string } {
        const now = new Date();
        const startMs = startTime.getTime();
        const nowMs = now.getTime();

        // 1. Min Notice
        if (service.min_notice_minutes) {
            const minNoticeMs = service.min_notice_minutes * 60000;
            if (startMs < nowMs + minNoticeMs) {
                return {
                    valid: false,
                    error: `Se requiere una antelación mínima de ${service.min_notice_minutes} minutos.`
                };
            }
        }

        // 2. Max Lead Time (Days)
        if (service.max_lead_days) {
            const maxLeadMs = service.max_lead_days * 24 * 60 * 60 * 1000;
            // Allow until end of that day? Or exact time? Usually days means "date".
            // Let's use strict timestamp for simplicity.
            if (startMs > nowMs + maxLeadMs) {
                return {
                    valid: false,
                    error: `No se puede reservar con más de ${service.max_lead_days} días de antelación.`
                };
            }
        }

        return { valid: true };
    }

    // --- Audit/History ---

    getBookingHistory(bookingId: string): Observable<BookingHistory[]> {
        return from(
            this.supabase
                .from('booking_history')
                .select(`
                    *,
                    modifier:changed_by_user_id(name, email)
                `)
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: false })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as BookingHistory[];
            })
        );
    }

    // --- Waitlist ---

    async joinWaitlist(entry: Partial<WaitlistEntry>) {
        const { data, error } = await this.supabase
            .from('waitlist')
            .insert(entry)
            .select()
            .single();

        if (error) throw error;
        return data as WaitlistEntry;
    }

    getWaitlist(companyId: string): Observable<WaitlistEntry[]> {
        return from(
            this.supabase
                .from('waitlist')
                .select(`
                    *,
                    client:client_id (
                        email,
                        name,
                        surname
                    ),
                    service:service_id (
                        name
                    )
                `)
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as any[];
            })
        );
    }

    async updateWaitlistStatus(id: string, status: 'pending' | 'notified' | 'prioritized' | 'expired' | 'converted') {
        const { error } = await this.supabase
            .from('waitlist')
            .update({ status })
            .eq('id', id);
        if (error) throw error;
    }

}

export interface AvailabilityException {
    id: string;
    company_id: string;
    user_id?: string;
    start_time: string;
    end_time: string;
    reason?: string;
    type: 'block' | 'work';
}

export interface BookingHistory {
    id: string;
    booking_id: string;
    changed_by: string;
    changed_by_user_id?: string;
    previous_status?: string;
    new_status?: string;
    change_type: 'create' | 'update' | 'cancel' | 'reschedule' | 'status_change';
    details?: any;
    created_at: string;
    // Joined
    modifier?: { name: string, email: string };
}


export interface WaitlistEntry {
    id: string;
    company_id: string;
    client_id: string;
    service_id: string;
    start_time: string;
    end_time: string;
    status: 'pending' | 'notified' | 'prioritized' | 'expired' | 'converted';
    notes?: string;
    created_at: string;
}

// --- Waitlist ---



