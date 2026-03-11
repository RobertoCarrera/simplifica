import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';

export type WaitlistStatus = 'pending' | 'notified' | 'prioritized' | 'expired' | 'converted';

export interface WaitlistEntry {
  id: string;
  company_id: string;
  client_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  status: WaitlistStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class SupabaseWaitlistService {
  private sbClient = inject(SupabaseClientService);

  private get supabase(): SupabaseClient {
    return this.sbClient.instance;
  }

  /**
   * Add a client to the waitlist for a specific service+slot
   */
  async addToWaitlist(entry: Omit<WaitlistEntry, 'id' | 'created_at' | 'updated_at' | 'status'>): Promise<WaitlistEntry> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .insert({
        company_id: entry.company_id,
        client_id: entry.client_id,
        service_id: entry.service_id,
        start_time: entry.start_time,
        end_time: entry.end_time,
        status: 'pending' as WaitlistStatus,
        notes: entry.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WaitlistEntry;
  }

  /**
   * Get waitlist entries for a specific service+slot (ordered by creation date)
   */
  async getWaitlistForSlot(serviceId: string, startTime: string, endTime: string): Promise<WaitlistEntry[]> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .select('*')
      .eq('service_id', serviceId)
      .eq('start_time', startTime)
      .eq('end_time', endTime)
      .in('status', ['pending', 'notified', 'prioritized'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as WaitlistEntry[];
  }

  /**
   * Remove a client from the waitlist
   */
  async removeFromWaitlist(waitlistId: string): Promise<void> {
    const { error } = await this.supabase
      .from('waitlist')
      .delete()
      .eq('id', waitlistId);

    if (error) throw error;
  }

  /**
   * Get all waitlist entries for a specific client
   */
  async getWaitlistByClient(clientId: string): Promise<WaitlistEntry[]> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['pending', 'notified', 'prioritized'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []) as WaitlistEntry[];
  }

  /**
   * Count confirmed/pending bookings for a specific service+slot.
   * Used to check capacity before confirming a new booking.
   */
  async getBookingCountForSlot(serviceId: string, startTime: string, endTime: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId)
      .eq('start_time', startTime)
      .eq('end_time', endTime)
      .in('status', ['confirmed', 'pending']);

    if (error) throw error;
    return count || 0;
  }

  /**
   * Update waitlist entry status
   */
  async updateWaitlistStatus(waitlistId: string, status: WaitlistStatus): Promise<void> {
    const { error } = await this.supabase
      .from('waitlist')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', waitlistId);

    if (error) throw error;
  }
}
