import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type WaitlistStatus =
  | 'pending'
  | 'notified'
  | 'prioritized'
  | 'expired'
  | 'converted'
  | 'converting'
  | 'cancelled';

export type WaitlistMode = 'active' | 'passive';

export interface WaitlistEntry {
  id: string;
  company_id: string;
  client_id: string;
  service_id: string;
  start_time: string;
  end_time: string;
  mode?: WaitlistMode; // Optional: defaults to 'active' if omitted
  status: WaitlistStatus;
  notified_at?: string | null;
  converted_booking_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload returned by promote_waitlist() / notify_waitlist() RPCs.
 * Used by Angular to dispatch send-waitlist-email Edge Function.
 */
export interface WaitlistEmailPayload {
  email: string;
  name: string;
  service_name: string;
  waitlist_id: string;
}

/**
 * Result from promote_waitlist() RPC.
 */
export interface PromoteWaitlistResult {
  promoted: boolean;
  notify_instead?: boolean;
  waitlist_id?: string;
  client_email?: string;
  client_name?: string;
  service_name?: string;
  message?: string;
  error?: string;
}

/**
 * Result from notify_waitlist() RPC.
 */
export interface NotifyWaitlistResult {
  notified: number;
  emails_to_send: WaitlistEmailPayload[];
  error?: string;
}

/**
 * Result from claim_waitlist_spot() RPC.
 */
export type ClaimWaitlistResult =
  | { booking_id: string }
  | {
      error:
        | 'spot_taken'
        | 'window_expired'
        | 'already_booked'
        | 'client_not_found'
        | 'invalid_status'
        | string;
    };

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SupabaseWaitlistService {
  private sbClient = inject(SupabaseClientService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);

  private get supabase(): SupabaseClient {
    return this.sbClient.instance;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: fetch relevant company_settings for waitlist gating
  // ──────────────────────────────────────────────────────────────────────────

  private async fetchWaitlistSettings(): Promise<{
    waitlist_active_mode: boolean;
    waitlist_passive_mode: boolean;
  }> {
    const companyId = this.authService.currentCompanyId();
    if (!companyId) {
      return { waitlist_active_mode: true, waitlist_passive_mode: true };
    }
    const { data } = await this.supabase
      .from('company_settings')
      .select('waitlist_active_mode, waitlist_passive_mode')
      .eq('company_id', companyId)
      .maybeSingle();
    return {
      waitlist_active_mode: data?.waitlist_active_mode ?? true,
      waitlist_passive_mode: data?.waitlist_passive_mode ?? true,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Client-facing: join / leave / view
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Add a client to the active (slot-specific) waitlist.
   * Inserts directly — RLS enforces client can only insert their own entry.
   */
  async addToWaitlist(
    entry: Omit<WaitlistEntry, 'id' | 'created_at' | 'updated_at' | 'status'>,
  ): Promise<WaitlistEntry> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .insert({
        company_id: entry.company_id,
        client_id: entry.client_id,
        service_id: entry.service_id,
        start_time: entry.start_time,
        end_time: entry.end_time,
        mode: entry.mode ?? 'active',
        status: 'pending' as WaitlistStatus,
        notes: entry.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WaitlistEntry;
  }

  /**
   * Join the passive (service-interest) waitlist.
   * No slot required — client subscribes to any availability for the service.
   */
  async joinPassiveWaitlist(params: {
    company_id: string;
    client_id: string;
    service_id: string;
    notes?: string;
  }): Promise<WaitlistEntry> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .insert({
        company_id: params.company_id,
        client_id: params.client_id,
        service_id: params.service_id,
        // Passive mode has no specific slot
        start_time: new Date(0).toISOString(),
        end_time: new Date(0).toISOString(),
        mode: 'passive',
        status: 'pending' as WaitlistStatus,
        notes: params.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WaitlistEntry;
  }

  /**
   * Cancel (leave) a waitlist entry. Updates status to 'cancelled'.
   * RLS allows clients to update their own pending/notified entries to 'cancelled'.
   */
  async leaveWaitlist(waitlistId: string): Promise<void> {
    const { error } = await this.supabase
      .from('waitlist')
      .update({ status: 'cancelled' as WaitlistStatus, updated_at: new Date().toISOString() })
      .eq('id', waitlistId);

    if (error) throw error;
  }

  /**
   * @deprecated Use leaveWaitlist() with status='cancelled' instead.
   * Hard-deletes the waitlist entry (legacy behavior).
   */
  async removeFromWaitlist(waitlistId: string): Promise<void> {
    const { error } = await this.supabase.from('waitlist').delete().eq('id', waitlistId);

    if (error) throw error;
  }

  /**
   * Get waitlist entries for a specific service+slot (admin view).
   */
  async getWaitlistForSlot(
    serviceId: string,
    startTime: string,
    endTime: string,
  ): Promise<WaitlistEntry[]> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .select('*')
      .eq('service_id', serviceId)
      .eq('start_time', startTime)
      .eq('end_time', endTime)
      .in('status', ['pending', 'notified', 'prioritized'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    return (data ?? []) as WaitlistEntry[];
  }

  /**
   * Get passive waitlist subscribers for a service (admin view).
   * Returns all clients who subscribed for general availability notifications.
   */
  async getPassiveWaitlistForService(serviceId: string): Promise<WaitlistEntry[]> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .select('*')
      .eq('service_id', serviceId)
      .eq('mode', 'passive')
      .in('status', ['pending', 'notified', 'prioritized'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    return (data ?? []) as WaitlistEntry[];
  }

  /**
   * Get all waitlist entries for a specific client (client self-view).
   */
  async getWaitlistByClient(clientId: string): Promise<WaitlistEntry[]> {
    const { data, error } = await this.supabase
      .from('waitlist')
      .select('*')
      .eq('client_id', clientId)
      .in('status', ['pending', 'notified', 'prioritized'])
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    return (data ?? []) as WaitlistEntry[];
  }

  /**
   * Count confirmed/pending bookings for a specific service+slot.
   * Used to check capacity before confirming a new booking.
   */
  async getBookingCountForSlot(
    serviceId: string,
    startTime: string,
    endTime: string,
  ): Promise<number> {
    // Use PostgreSQL OVERLAPS for time range matching instead of exact equality
    // This correctly handles bookings that partially overlap with the requested slot
    const { count, error } = await this.supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId)
      .filter(
        'start_time',
        'overlaps',
        `timestamp '${startTime}' AND timestamp '${endTime}'`,
      )
      .in('status', ['confirmed', 'pending']);

    if (error) throw error;
    return count ?? 0;
  }

  /**
   * @deprecated Use leaveWaitlist() instead.
   * Updates the status field directly (legacy method for backward compatibility).
   */
  async updateWaitlistStatus(waitlistId: string, status: WaitlistStatus): Promise<void> {
    const { error } = await this.supabase
      .from('waitlist')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', waitlistId);

    if (error) throw error;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Admin: RPC-first promotion / notification orchestration
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Promote the first pending active waitlist entry.
   *
   * RPC: `promote_waitlist(p_service_id, p_start_time, p_end_time)`
   *   - Checks `company_settings.waitlist_auto_promote`
   *   - Updates entry status to 'converting'
   *   - Inserts in-app notification
   *   - Returns email payload OR { promote: false, notify_instead: true }
   *
   * After RPC succeeds, dispatches `send-waitlist-email` Edge Function.
   */
  async promoteWaitlist(
    serviceId: string,
    startTime: string,
    endTime: string,
  ): Promise<PromoteWaitlistResult> {
    const { data, error } = await this.supabase.rpc('promote_waitlist', {
      p_service_id: serviceId,
      p_start_time: startTime,
      p_end_time: endTime,
    });

    if (error) {
      console.error('promoteWaitlist: RPC error:', error);
      throw error;
    }

    const result = data as PromoteWaitlistResult;

    // If auto-promote is disabled, signal caller to use notify instead
    if (result?.error) {
      console.warn('promoteWaitlist: RPC returned error field:', result.error);
      return result;
    }

    // Dispatch email if RPC returned a client email
    if (result?.promoted && result.client_email) {
      await this.dispatchWaitlistEmail({
        to: result.client_email,
        name: result.client_name ?? '',
        service_name: result.service_name ?? '',
        start_time: startTime,
        end_time: endTime,
        type: 'promoted',
        waitlist_id: result.waitlist_id,
      });
    }

    return result;
  }

  /**
   * Notify pending waitlist entries for a service+slot.
   *
   * RPC: `notify_waitlist(p_service_id, p_start_time, p_end_time, p_mode)`
   *   - Active mode: notifies first pending active entry
   *   - Passive mode: bulk-notifies all pending passive entries (with 24h rate limit)
   *   - Updates statuses, inserts in-app notifications, manages rate limits
   *   - Returns { notified: N, emails_to_send: [...] }
   *
   * After RPC succeeds, dispatches `send-waitlist-email` for each email payload.
   */
  async notifyWaitlist(
    serviceId: string,
    startTime: string,
    endTime: string,
    mode: WaitlistMode = 'active',
  ): Promise<NotifyWaitlistResult> {
    const { data, error } = await this.supabase.rpc('notify_waitlist', {
      p_service_id: serviceId,
      p_start_time: startTime,
      p_end_time: endTime,
      p_mode: mode,
    });

    if (error) {
      console.error('notifyWaitlist: RPC error:', error);
      throw error;
    }

    const result = data as NotifyWaitlistResult;

    if (result?.error) {
      console.warn('notifyWaitlist: RPC returned error field:', result.error);
      return result;
    }

    // Dispatch emails for each returned entry
    const emailPayloads = result?.emails_to_send ?? [];
    const emailType = mode === 'passive' ? 'passive' : 'active_notify';

    for (const entry of emailPayloads) {
      await this.dispatchWaitlistEmail({
        to: entry.email,
        name: entry.name,
        service_name: entry.service_name,
        start_time: startTime,
        end_time: endTime,
        type: emailType,
        waitlist_id: entry.waitlist_id,
      }).catch((err: unknown) =>
        console.warn(`notifyWaitlist: email dispatch failed for ${entry.email}:`, err),
      );
    }

    return result;
  }

  /**
   * Claim a passive waitlist spot atomically.
   *
   * RPC: `claim_waitlist_spot(p_waitlist_entry_id)`
   *   - Validates status is 'notified'
   *   - Checks notification window expiry
   *   - Prevents double-booking
   *   - Creates booking atomically (FOR UPDATE SKIP LOCKED)
   *   - Returns { booking_id } or { error: '...' }
   */
  async claimSpot(waitlistEntryId: string): Promise<ClaimWaitlistResult> {
    const { data, error } = await this.supabase.rpc('claim_waitlist_spot', {
      p_waitlist_entry_id: waitlistEntryId,
    });

    if (error) {
      console.error('claimSpot: RPC error:', error);
      throw error;
    }

    return data as ClaimWaitlistResult;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Cancellation orchestration (called by SupabaseBookingsService.deleteBooking)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Handle waitlist after a booking is cancelled.
   *
   * Flow (RPC-first, settings-gated):
   *   0. Fetch tenant settings — abort entire flow if both modes disabled
   *   1. Try promote_waitlist() — auto-promotes first active entry if enabled
   *   2. If notify_instead=true → call notify_waitlist() for active mode
   *   3. Additionally, notify passive entries (only if tenant passive mode is enabled)
   *
   * This is fire-and-forget from deleteBooking — errors are caught by caller.
   */
  async handleCancellationWaitlist(
    serviceId: string,
    startTime: string,
    endTime: string,
  ): Promise<void> {
    // Step 0: Check tenant settings before doing any DB operations
    let settings: { waitlist_active_mode: boolean; waitlist_passive_mode: boolean };
    try {
      settings = await this.fetchWaitlistSettings();
    } catch (err) {
      console.warn(
        'handleCancellationWaitlist: could not load tenant settings, defaulting to enabled:',
        err,
      );
      settings = { waitlist_active_mode: true, waitlist_passive_mode: true };
    }

    const { waitlist_active_mode, waitlist_passive_mode } = settings;

    // Step 1: Active mode — only if tenant has active mode enabled
    if (waitlist_active_mode) {
      let promoteResult: PromoteWaitlistResult;
      try {
        promoteResult = await this.promoteWaitlist(serviceId, startTime, endTime);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('handleCancellationWaitlist: promoteWaitlist failed:', msg);
        await this.logWaitlistError('promoteWaitlist', serviceId, startTime, endTime, msg);
        this.toastService.warning(
          'La notificación automática a la lista de espera falló. Contacta manualmente al cliente.',
        );
        // Fall through to notify path
        promoteResult = { promoted: false, notify_instead: true };
      }

      // Step 2: If auto-promote is off, notify active entries instead
      if (!promoteResult.promoted && promoteResult.notify_instead) {
        try {
          await this.notifyWaitlist(serviceId, startTime, endTime, 'active');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('handleCancellationWaitlist: notifyWaitlist (active) failed:', msg);
          await this.logWaitlistError('notifyWaitlist_active', serviceId, startTime, endTime, msg);
          this.toastService.warning(
            'La notificación automática a la lista de espera falló. Contacta manualmente al cliente.',
          );
        }
      }
    }

    // Step 3: Passive mode — only if tenant has passive mode enabled
    if (waitlist_passive_mode) {
      try {
        await this.notifyWaitlist(serviceId, startTime, endTime, 'passive');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('handleCancellationWaitlist: notifyWaitlist (passive) failed:', msg);
        await this.logWaitlistError('notifyWaitlist_passive', serviceId, startTime, endTime, msg);
        this.toastService.warning(
          'La notificación automática a la lista de espera falló. Contacta manualmente al cliente.',
        );
      }
    }
  }

  /**
   * Logs a waitlist operation error to the audit log table (gdpr_audit_log).
   * Non-blocking: failures are swallowed and logged to console.error only.
   */
  private async logWaitlistError(
    operation: string,
    serviceId: string,
    startTime: string,
    endTime: string,
    errorMessage: string,
  ): Promise<void> {
    const companyId = this.authService.currentCompanyId();
    try {
      await this.supabase.from('gdpr_audit_log').insert({
        company_id: companyId ?? 'unknown',
        action: `waitlist_error.${operation}`,
        entity_type: 'waitlist',
        entity_id: serviceId,
        details: { start_time: startTime, end_time: endTime, error: errorMessage },
      });
    } catch (logErr: unknown) {
      const msg = logErr instanceof Error ? logErr.message : String(logErr);
      console.error('[logWaitlistError] Failed to write audit log:', msg);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private: email dispatch helper
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Invokes the `send-waitlist-email` Edge Function with the given payload.
   * No DB access — the RPC upstream already resolved all data.
   */
  private async dispatchWaitlistEmail(payload: {
    to: string;
    name: string;
    service_name: string;
    start_time: string;
    end_time: string;
    type: string;
    waitlist_id?: string;
  }): Promise<void> {
    const { error } = await this.supabase.functions.invoke('send-waitlist-email', {
      body: payload,
    });

    if (error) {
      console.warn('dispatchWaitlistEmail: Edge Function error:', error);
      // Non-fatal: email failure should not break the flow
    }
  }
}
