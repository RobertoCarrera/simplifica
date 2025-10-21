import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

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

@Injectable({ providedIn: 'root' })
export class ClientPortalService {
  private sb = inject(SupabaseClientService);
  private auth = inject(AuthService);

  async listTickets(): Promise<{ data: ClientPortalTicket[]; error?: any }> {
    const client = this.sb.instance;
    const { data, error } = await client
      .from('client_visible_tickets')
      .select('*')
      .order('updated_at', { ascending: false });
    return { data: (data || []) as any, error };
  }

  async listQuotes(): Promise<{ data: ClientPortalQuote[]; error?: any }> {
    const client = this.sb.instance;
    const { data, error } = await client
      .from('client_visible_quotes')
      .select('*')
      .order('quote_date', { ascending: false });
    return { data: (data || []) as any, error };
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
        // Align role with access grant
        await this.setUserRoleForEmail(email, 'client').catch(() => ({ success: false }));
      } else {
        const { error } = await client
          .from('client_portal_users')
          .update({ is_active: false })
          .eq('company_id', cid)
          .eq('client_id', clientId)
          .eq('email', email.toLowerCase());
        if (error) return { success: false, error: error.message };
        // Downgrade role when access is revoked
        await this.setUserRoleForEmail(email, 'none').catch(() => ({ success: false }));
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
}
