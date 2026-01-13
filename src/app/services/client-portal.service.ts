import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';

export interface ClientPortalBooking {
  id: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rescheduled';
  service_name: string;
  service_duration: number;
  professional_name?: string;
  total_price: number;
  payment_status: string;
}


export interface ClientPortalTicket {
  id: string;
  title: string;
  description?: string | null;
  company_id: string;
  client_id: string;
  stage_id?: string | null;
  due_date?: string | null;
  is_opened?: boolean | null;
  updated_at?: string | null;
}

export interface ClientPortalQuote {
  id: string;
  company_id: string;
  client_id: string;
  full_quote_number: string;
  title: string;
  status: string;
  quote_date: string;
  valid_until: string;
  total_amount: number;
}

export interface ClientPortalInvoice {
  id: string;
  company_id: string;
  client_id: string;
  full_invoice_number?: string | null;
  invoice_series?: string | null;
  invoice_number?: number | null;
  status: string;
  invoice_date: string;
  due_date?: string | null;
  total: number;
  currency?: string | null;
  // Payment fields
  payment_status?: 'none' | 'pending' | 'paid' | string | null;
  payment_link_token?: string | null;
  payment_link_expires_at?: string | null;
  payment_link_provider?: string | null;
  pending_payment_url?: string | null;
  // Dual payment support
  stripe_payment_url?: string | null;
  paypal_payment_url?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClientPortalService {
  private sb = inject(SupabaseClientService);
  private auth = inject(AuthService);

  // Computed properties for service
  private get supabase() { return this.sb.instance; }

  private async requireAccessToken(): Promise<string> {
    // Mirror the robustness in SupabaseModulesService: sessions can take a moment to hydrate.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.access_token) return session.access_token;
      try { await this.supabase.auth.refreshSession(); } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 150 * attempt));
    }
    throw new Error('No hay una sesión válida. Inicia sesión de nuevo.');
  }

  async subscribeToClientQuotes(callback: (payload: any) => void): Promise<RealtimeChannel | null> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.client_id) return null;

    const channelName = `client-quotes-${user.client_id}-${Date.now()}`;

    const channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
        presence: { key: '' }
      }
    });

    channel.on(
      'postgres_changes',
      {
        event: '*', // Listen to INSERT and UPDATE
        schema: 'public',
        table: 'quotes',
        filter: `client_id=eq.${user.client_id}`
      },
      (payload) => callback(payload)
    );

    channel.subscribe();
    return channel;
  }

  async listTickets(): Promise<{ data: ClientPortalTicket[]; error?: any }> {
    const client = this.sb.instance;
    const { data, error } = await client
      .from('client_visible_tickets')
      .select('*')
      .order('updated_at', { ascending: false });
    return { data: (data || []) as any, error };
  }

  async listBookings(): Promise<{ data: ClientPortalBooking[]; error?: any }> {
    const client = this.sb.instance;
    // Query main table directly, relying on RLS
    const { data: allData, error: allError } = await client
      .from('bookings')
      .select(`
        id,
        start_time,
        end_time,
        status,
        service:services ( name, duration_minutes )
      `)
      .order('start_time', { ascending: false });

    if (allError) return { data: [], error: allError };

    // Map to ClientPortalBooking interface
    const mapped: ClientPortalBooking[] = (allData || []).map((b: any) => ({
      id: b.id,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
      service_name: b.service?.name,
      service_duration: b.service?.duration_minutes,
      professional_name: 'Asignado', // Placeholder until DB sync is confirmed
      total_price: 0, // Placeholder
      payment_status: 'pending' // Placeholder
    }));

    return { data: mapped, error: null };
  }

  async cancelBooking(bookingId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.sb.instance.rpc('client_cancel_booking', {
        p_booking_id: bookingId,
        p_reason: reason || null
      });

      if (error) return { success: false, error: error.message };
      if (data && !data.success) return { success: false, error: data.error };

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }


  async listPublicServices(): Promise<{ data: any[]; error?: any }> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.company_id) return { data: [], error: 'No company context' };

    const client = this.sb.instance;

    // 1. Fetch Services
    const { data: services, error: servicesError } = await client
      .from('services')
      .select('*')
      .eq('company_id', user.company_id)
      .eq('is_public', true)
      .eq('is_active', true)
      .order('name');

    if (servicesError) return { data: [], error: servicesError };
    if (!services || services.length === 0) return { data: [], error: null };

    // 2. Fetch Variants manually to avoid join issues
    const serviceIds = services.map(s => s.id);
    const { data: variants, error: variantsError } = await client
      .from('service_variants')
      .select('*, client_assignments:client_variant_assignments(*)')
      .in('service_id', serviceIds)
      .eq('is_active', true)
      .order('sort_order');

    if (variantsError) {
      console.error('Error fetching variants:', variantsError);
      // Return services without variants if variants fail
      return { data: services, error: null };
    }

    // 3. Attach variants to services
    const servicesWithVariants = services.map(service => {
      const serviceVariants = (variants || []).filter(v => v.service_id === service.id);
      return { ...service, variants: serviceVariants };
    });

    return { data: servicesWithVariants, error: null };
  }

  // New method to get service with variants by ID (for contracted services, even if not public)
  async getServiceWithVariants(serviceId: string): Promise<{ data: any; error?: any }> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.company_id) return { data: null, error: 'No company context' };

    const client = this.sb.instance;

    // Fetch service (any service the company has, not just public)
    const { data: service, error: serviceError } = await client
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('company_id', user.company_id)
      .eq('is_active', true)
      .maybeSingle();

    if (serviceError || !service) return { data: null, error: serviceError || 'Service not found' };

    // Fetch variants
    const { data: variants } = await client
      .from('service_variants')
      .select('*')
      .eq('service_id', serviceId)
      .eq('is_active', true)
      .order('sort_order');

    return { data: { ...service, variants: variants || [] }, error: null };
  }

  async getCompanySettings(): Promise<{ data: any; error?: any }> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.company_id) return { data: null, error: 'No company context' };

    const client = this.sb.instance;
    const { data, error } = await client
      .from('company_settings')
      .select('allow_direct_contracting, auto_send_quote_email, payment_integrations')
      .eq('company_id', user.company_id)
      .maybeSingle();

    return { data, error };
  }

  async getPaymentIntegrations(): Promise<{ data: any[]; error?: any }> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.company_id) return { data: [], error: 'No company context' };

    const client = this.sb.instance;
    const { data, error } = await client
      .from('payment_integrations')
      .select('*')
      .eq('company_id', user.company_id)
      .eq('is_active', true);

    return { data: data || [], error };
  }

  // Old requestService removed


  async contractService(serviceId: string, variantId?: string, preferredPaymentMethod?: string, existingInvoiceId?: string): Promise<{ data: any; error?: any }> {
    try {
      // Case 1: Payment Method Selected (or existing invoice pending payment)
      // We still use the Edge Function to generate the secure payment link
      if (preferredPaymentMethod || existingInvoiceId) {
        console.log('💳 Generating payment link via Edge Function...', { serviceId, variantId, preferredPaymentMethod, existingInvoiceId });
        const token = await this.requireAccessToken();
        const { data, error } = await this.supabase.functions.invoke('client-request-service', {
          body: {
            action: 'contract',
            serviceId,
            variantId,
            preferredPaymentMethod,
            existingInvoiceId
          },
          headers: { Authorization: `Bearer ${token}` }
        });
        return { data, error };
      }

      // Case 2: Initial Contract Request (No payment method yet)
      // Use RPC for speed and reliability, preventing 401s
      console.log('🚀 Contracting service via RPC...', { serviceId, variantId });

      const { data, error } = await this.sb.instance.rpc('contract_service_rpc', {
        p_service_id: serviceId,
        p_variant_id: variantId || null
      });

      if (error) throw error;

      console.log('✅ RPC Contract Result:', data);

      // RPC returns: { success, action, requires_payment_selection, data: { ... } }
      // We can return the whole object as 'data' because the component expects 'data' to contain the fields.
      return { data, error: null };

    } catch (e: any) {
      console.error('❌ Error contracting service:', e);
      return { data: null, error: e };
    }
  }

  async listQuotes(): Promise<{ data: ClientPortalQuote[]; error?: any }> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.client_id) return { data: [], error: 'No client context' };

    try {
      const { data, error } = await this.supabase
        .from('quotes')
        .select('*')
        .eq('client_id', user.client_id)
        .neq('status', 'cancelled') // Hide cancelled quotes as requested by user ("clean view")
        .order('quote_date', { ascending: false });

      if (error) throw error;
      return { data: (data || []) as any, error: null };
    } catch (e: any) {
      return { data: [], error: { message: e?.message || 'listQuotes failed' } };
    }
  }

  async getQuote(id: string): Promise<{ data: any | null; error?: any }> {
    try {
      // Direct query
      const { data, error } = await this.supabase
        .from('quotes')
        .select('id, full_quote_number, title, status, quote_date, valid_until, total_amount, currency, items:quote_items(*)')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { data: null, error: 'Quote not found' };

      return { data: data || null, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'getQuote failed' } };
    }
  }

  async listInvoices(): Promise<{ data: ClientPortalInvoice[]; error?: any }> {
    const user = await firstValueFrom(this.auth.userProfile$);
    if (!user?.client_id) return { data: [], error: 'No client context' };

    try {
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*')
        .eq('client_id', user.client_id)
        .neq('status', 'void') // Hide voided invoices
        .neq('status', 'cancelled') // Hide cancelled invoices if any
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      return { data: (data || []) as any, error: null };
    } catch (e: any) {
      return { data: [], error: { message: e?.message || 'listInvoices failed' } };
    }
  }

  async getInvoice(id: string): Promise<{ data: any | null; error?: any }> {
    try {
      // Direct query with RLS
      const { data, error } = await this.supabase
        .from('invoices')
        .select('*, items:invoice_items(*)')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return { data: null, error: 'Invoice not found' };

      // Map strict table structure to helpful frontend shape if needed,
      // but 'data' with 'items' usually suffices for components expecting it.
      return { data: data, error: null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message || 'getInvoice failed' } };
    }
  }


  async respondToQuote(id: string, action: 'accept' | 'reject', rejectionReason?: string): Promise<{ data: any | null; error?: any }> {
    try {
      console.log(`📝 Calling client-quote-respond Edge Function for quote ${id} with action ${action}...`);

      const token = await this.requireAccessToken();

      const { data, error } = await this.supabase.functions.invoke('client-quote-respond', {
        body: { id, action, rejection_reason: rejectionReason },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (error) {
        console.error('❌ Error from Edge Function:', error);
        return { data: null, error };
      }

      console.log('✅ Quote response successful:', data);
      return { data: data?.data || null, error: null };
    } catch (e: any) {
      console.error('❌ Unexpected error responding to quote:', e);
      return { data: null, error: { message: e?.message || 'Failed to respond to quote' } };
    }
  }

  async markTicketOpened(ticketId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.sb.instance;
      const { error } = await client
        .from('tickets')
        .update({ is_opened: true })
        .eq('id', ticketId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Admin mapping helpers
  async listMappings(companyId?: string): Promise<{ data: any[]; error?: any }> {
    const cid = companyId || this.auth.companyId();
    if (!cid) return { data: [], error: { message: 'No company id' } };
    const client = this.sb.instance;
    const { data, error } = await client
      .from('client_portal_users')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: false });
    return { data: data || [], error };
  }

  async upsertMapping(payload: { company_id: string; client_id: string; email: string; is_active?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.sb.instance;
      const { error } = await client
        .from('client_portal_users')
        .upsert({
          company_id: payload.company_id,
          client_id: payload.client_id,
          email: payload.email.toLowerCase(),
          is_active: payload.is_active ?? true
        }, { onConflict: 'company_id,client_id,email' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async deleteMapping(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.sb.instance;
      const { error } = await client
        .from('client_portal_users')
        .delete()
        .eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async setUserRoleForEmail(email: string, role: 'client' | 'none'): Promise<{ success: boolean; error?: string }> {
    const cid = this.auth.companyId();
    if (!cid) return { success: false, error: 'No company id' };
    try {
      const client = this.sb.instance;
      const { error } = await client
        .from('users')
        .update({ role })
        .eq('company_id', cid)
        .eq('email', email.toLowerCase())
        .eq('active', true);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Toggle access for a given client email in current company (create or deactivate mapping)
  async toggleClientPortalAccess(clientId: string, email: string, enable: boolean): Promise<{ success: boolean; error?: string }> {
    const cid = this.auth.companyId();
    if (!cid) return { success: false, error: 'No company id' };
    try {
      const client = this.sb.instance;
      if (enable) {
        const { error } = await client
          .from('client_portal_users')
          .upsert({ company_id: cid, client_id: clientId, email: email.toLowerCase(), is_active: true }, { onConflict: 'company_id,client_id,email' });
        if (error) return { success: false, error: error.message };
        // Legacy: await this.setUserRoleForEmail(email, 'client').catch(() => ({ success: false }));
      } else {
        const { error } = await client
          .from('client_portal_users')
          .update({ is_active: false })
          .eq('company_id', cid)
          .eq('client_id', clientId)
          .eq('email', email.toLowerCase());
        if (error) return { success: false, error: error.message };
        // Legacy: await this.setUserRoleForEmail(email, 'none').catch(() => ({ success: false }));
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async hasClientPortalAccess(clientId: string, email: string): Promise<boolean> {
    const cid = this.auth.companyId();
    if (!cid) return false;
    const client = this.sb.instance;
    const { data, error } = await client
      .from('client_portal_users')
      .select('id, is_active')
      .eq('company_id', cid)
      .eq('client_id', clientId)
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (error) return false;
    return !!data && (data as any).is_active !== false;
  }

  async sendInvitation(email: string, companyId: string, role: 'client' | 'member' | 'admin' | 'owner' = 'client'): Promise<{
    success: boolean;
    message?: string;
    code?: string;
    token?: string;
    error?: string;
  }> {
    try {
      const { data, error } = await this.supabase.functions.invoke('send-company-invite', {
        body: {
          email,
          company_id: companyId,
          role,
          force_email: true,  // SIEMPRE enviar email, nunca fallar silenciosamente
          message: role === 'client'
            ? "Se te han activado los consentimientos de Privacidad y Marketing. Puedes gestionarlos desde tu Panel de Cliente en la sección Configuración."
            : undefined
        }
      });

      if (error) throw error;

      // Validar que realmente se envió el email
      if (data && !data.success && data.code !== 'email_exists') {
        throw new Error(data.error || 'No se pudo enviar el email de invitación');
      }

      return data || { success: false, error: 'Sin respuesta de la función' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error al enviar invitación' };
    }
  }

  async requestService(serviceId: string, variantId?: string, comment?: string) {
    try {
      const email = (await firstValueFrom(this.auth.userProfile$))?.email;
      const companyId = (await firstValueFrom(this.auth.userProfile$))?.company_id;
      const role = (await firstValueFrom(this.auth.userProfile$))?.role;

      const { data, error } = await this.supabase.functions.invoke('client-request-service', {
        body: {
          action: 'request',
          serviceId,
          variantId,
          comment,
          email,        // Pass context if needed, though usually handled by auth header
          company_id: companyId
        }
      });

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      console.error('Error requesting service:', err);
      return { data: null, error: err };
    }
  }

  /**
   * Get payment information for an invoice using its payment link token
   */
  async getPaymentInfo(paymentToken: string): Promise<any> {
    try {
      const { data, error } = await this.supabase.functions.invoke('public-payment-info', {
        body: { token: paymentToken }
      });
      if (error) throw error;
      return data;
    } catch (e: any) {
      console.error('Error getting payment info:', e);
      throw e;
    }
  }

  /**
   * Mark an invoice as pending local payment (cash/in-person)
   */
  async markInvoiceLocalPayment(invoiceId: string): Promise<void> {
    try {
      const token = await this.requireAccessToken();
      const { error } = await this.supabase.functions.invoke('client-invoices', {
        body: {
          id: invoiceId,
          action: 'mark_local_payment'
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (error) throw error;
    } catch (e: any) {
      console.error('Error marking local payment:', e);
      throw e;
    }
  }

  /**
   * Cancel a contracted service (quote) and handle associated invoice.
   * Calls 'cancel_contracted_service' RPC.
   */
  async cancelService(quoteId: string, reason?: string): Promise<{ success: boolean; message?: string; action?: string; error?: string }> {
    try {
      console.log('🚫 Cancelling service (quote):', quoteId);
      const { data, error } = await this.sb.instance.rpc('cancel_contracted_service', {
        p_quote_id: quoteId,
        p_reason: reason || null
      });

      if (error) throw error;

      console.log('✅ Service cancellation result:', data);

      if (data && data.success) {
        return { success: true, message: data.message, action: data.action };
      } else {
        return { success: false, error: data?.error || 'No se pudo cancelar el servicio' };
      }

    } catch (e: any) {
      console.error('❌ Error cancelling service:', e);
      return { success: false, error: e.message || 'Error inesperado al cancelar servicio' };
    }
  }

  async getAvailabilityData(companyId: string, startDate: Date, endDate: Date): Promise<{ data: any; error?: any }> {
    try {
      const { data, error } = await this.sb.instance.rpc('get_availability_data', {
        p_company_id: companyId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString()
      });
      return { data, error };
    } catch (e: any) {
      return { data: null, error: e.message };
    }
  }

  async rescheduleBooking(bookingId: string, newStartTime: string, newEndTime: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.sb.instance.rpc('client_reschedule_booking', {
        p_booking_id: bookingId,
        p_new_start_time: newStartTime,
        p_new_end_time: newEndTime
      });

      if (error) return { success: false, error: error.message };
      if (data && !data.success) return { success: false, error: data.error };

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async createSelfBooking(booking: { service_id: string, start_time: string, end_time: string, form_responses?: any }): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) return { success: false, error: 'No company context' };

      const { data, error } = await this.sb.instance.rpc('client_create_booking', {
        p_company_id: user.company_id,
        p_service_id: booking.service_id,
        p_start_time: booking.start_time,
        p_end_time: booking.end_time,
        p_form_responses: booking.form_responses || null
      });

      if (error) return { success: false, error: error.message };
      if (data && !data.success) return { success: false, error: data.error };

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // --- Profile & Preferences ---

  async updateProfile(fullName: string, phone: string, avatarUrl?: string): Promise<{ success: boolean; error: any }> {
    const { data, error } = await this.sb.instance.rpc('client_update_profile', {
      p_full_name: fullName,
      p_phone: phone,
      p_avatar_url: avatarUrl || null
    });
    return { success: !error, error };
  }

  async getPreferences(): Promise<{ data: any; error: any }> {
    const { data, error } = await this.sb.instance.rpc('client_get_preferences');
    return { data, error };
  }

  async updatePreferences(prefs: { email_notifications: boolean; sms_notifications: boolean; marketing_accepted: boolean }): Promise<{ success: boolean; error: any }> {
    const { error } = await this.sb.instance.rpc('client_update_preferences', {
      p_email_notifications: prefs.email_notifications,
      p_sms_notifications: prefs.sms_notifications,
      p_marketing_accepted: prefs.marketing_accepted
    });
    return { success: !error, error };
  }

  async changePassword(newPassword: string): Promise<{ success: boolean; error: any }> {
    const { error } = await this.sb.instance.auth.updateUser({ password: newPassword });
    return { success: !error, error };
  }
}
