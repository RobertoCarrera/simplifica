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
    type: 'room' | 'equipment';
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

    // Joined fields
    booking_type?: { name: string; color?: string };
    service?: { name: string };
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
                    service:services(name, duration_minutes),
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
                service:services(name, duration_minutes)
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
                service:services(name, duration_minutes)
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
                service:services(name, duration_minutes)
            `)
            .single();

        if (error) throw error;

        // Sync to Google Calendar
        if (data.google_event_id) {
            try {
                const bookingWithService = {
                    ...data,
                    service_name: data.service?.name,
                };

                await this.supabase.functions.invoke('google-calendar', {
                    body: {
                        action: 'update_event',
                        companyId: data.company_id,
                        google_event_id: data.google_event_id,
                        booking: bookingWithService
                    }
                });
            } catch (e) {
                console.warn('Google Calendar Update Failed:', e);
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

