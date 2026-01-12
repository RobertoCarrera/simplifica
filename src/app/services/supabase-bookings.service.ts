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
    status: 'confirmed' | 'pending' | 'cancelled';
    professional_id?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
    google_event_id?: string | null;

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

    async createBooking(booking: any) {
        const { data, error } = await this.supabase
            .from('bookings')
            .insert(booking)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateBooking(id: string, updates: any) {
        const { data, error } = await this.supabase
            .from('bookings')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteBooking(id: string) {
        const { error } = await this.supabase
            .from('bookings')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
}

