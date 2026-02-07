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
    client_id: string;
    customer_name: string;
    customer_email?: string;
    service_id?: string;
    // Relations
    service?: { name: string; color?: string };
    professional?: { user?: { name: string } };
    booking_type?: { name: string; color?: string };

    start_time: string;
    end_time: string;
    status: 'confirmed' | 'pending' | 'cancelled';
    payment_status?: 'paid' | 'pending' | 'partial' | 'refunded';
    total_price?: number;
    currency?: string;
    notes?: string;
    created_at?: string;
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseBookingsService {

    constructor(private sbClient: SupabaseClientService) { }

    private get supabase() {
        return this.sbClient.instance;
    }

    // --- Bookings CRUD ---

    async getBookings(filters?: { clientId?: string, from?: string, to?: string, limit?: number }): Promise<{ data: Booking[], error: any }> {
        let query = this.supabase
            .from('bookings')
            .select('*, booking_type:booking_types(name, color), service:services(name), professional:professionals(user:users(name))')
            .order('start_time', { ascending: false });

        if (filters?.clientId) {
            query = query.eq('client_id', filters.clientId);
        }
        if (filters?.from) {
            query = query.gte('start_time', filters.from);
        }
        if (filters?.to) {
            query = query.lte('start_time', filters.to);
        }
        if (filters?.limit) {
            query = query.limit(filters.limit);
        }

        const { data, error } = await query;
        return { data: data as Booking[], error };
    }

    async createBooking(booking: Partial<Booking>) {
        const { data, error } = await this.supabase
            .from('bookings')
            .insert(booking)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async updateBooking(id: string, updates: Partial<Booking>) {
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
}

