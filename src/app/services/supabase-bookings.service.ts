import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { Observable, from, map } from 'rxjs';
import { SupabaseWaitlistService } from './supabase-waitlist.service';

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
  client_id?: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  service_id?: string;
  professional_id?: string;
  resource_id?: string;
  room_id?: string;
  booking_type_id?: string;
  google_event_id?: string;
  meeting_link?: string;
  session_type?: 'presencial' | 'online';
  // Relations
  service?: { name: string; base_price?: number; category?: string };
  professional?: { display_name?: string; color?: string; title?: string };
  resource?: { name: string; type?: string; capacity?: number };

  start_time: string;
  end_time: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'rescheduled';
  payment_status?: 'paid' | 'pending' | 'partial' | 'refunded';
  total_price?: number;
  deposit_paid?: number;
  notes?: string;
  source?: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseBookingsService {
  constructor(
    private sbClient: SupabaseClientService,
    private waitlistService: SupabaseWaitlistService,
  ) {}

  private get supabase() {
    return this.sbClient.instance;
  }

  // --- Bookings CRUD ---

  async getBookings(filters?: {
    companyId?: string;
    clientId?: string;
    from?: string;
    to?: string;
    before?: string; // lt (exclusive upper bound)
    limit?: number;
    ascending?: boolean;
    columns?: string;
  }): Promise<{ data: Booking[]; error: any }> {
    const ascending = filters?.ascending ?? false;

    // Allow callers to request a lighter column set (e.g. client-bookings list)
    const columns =
      filters?.columns ??
      `id, company_id, client_id, customer_name, customer_email, customer_phone, service_id, professional_id, resource_id, booking_type_id, google_event_id, meeting_link, start_time, end_time, status, payment_status, total_price, currency, notes, source, created_at,
                service:services(name, base_price, category),
                professional:professionals(display_name, title, color),
                resource:resources(name, type, capacity)`;

    let query = this.supabase.from('bookings').select(columns).order('start_time', { ascending });

    // CRITICAL: always filter by company to avoid full table scans
    if (filters?.companyId) {
      query = query.eq('company_id', filters.companyId);
    }
    if (filters?.clientId) {
      query = query.eq('client_id', filters.clientId);
    }
    if (filters?.from) {
      query = query.gte('start_time', filters.from);
    }
    if (filters?.to) {
      query = query.lte('start_time', filters.to);
    }
    if (filters?.before) {
      query = query.lt('start_time', filters.before);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    return { data: (data ?? []) as unknown as Booking[], error };
  }

  async createBooking(booking: Partial<Booking>) {
    const { data, error } = await this.supabase.from('bookings').insert(booking).select().single();
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

  async deleteBooking(id: string): Promise<void> {
    // Fetch booking details before deleting (needed for waitlist RPCs)
    const { data: booking } = await this.supabase
      .from('bookings')
      .select('service_id, start_time, end_time, company_id')
      .eq('id', id)
      .single();

    const { error } = await this.supabase.from('bookings').delete().eq('id', id);
    if (error) throw error;

    // RPC-first: handle waitlist promotion/notification after cancellation
    if (booking?.service_id) {
      this.waitlistService
        .handleCancellationWaitlist(booking.service_id, booking.start_time, booking.end_time)
        .catch((err: unknown) =>
          console.warn('deleteBooking: waitlist handling error (non-blocking):', err),
        );
    }
  }

  // --- Booking Types ---

  getBookingTypes(companyId: string): Observable<BookingType[]> {
    return from(
      this.supabase
        .from('booking_types')
        .select('id, company_id, owner_id, name, slug, description, duration, price, currency, is_active, created_at')
        .eq('company_id', companyId)
        .order('name')
        .limit(100),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as BookingType[];
      }),
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
    const { error } = await this.supabase.from('booking_types').delete().eq('id', id);
    if (error) throw error;
  }

  // --- Resources ---

  getResources(companyId: string): Observable<Resource[]> {
    return from(
      this.supabase
        .from('resources')
        .select('id, company_id, name, type, capacity, description, is_active')
        .eq('company_id', companyId)
        .order('name')
        .limit(100),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Resource[];
      }),
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
    const { error } = await this.supabase.from('resources').delete().eq('id', id);
    if (error) throw error;
  }

  // --- Availability ---

  getAvailabilitySchedules(userId: string): Observable<AvailabilitySchedule[]> {
    return from(
      this.supabase
        .from('availability_schedules')
        .select('id, user_id, booking_type_id, day_of_week, start_time, end_time, is_unavailable')
        .eq('user_id', userId)
        .is('booking_type_id', null) // Default schedule
        .order('day_of_week')
        .order('start_time')
        .limit(100),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as AvailabilitySchedule[];
      }),
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
