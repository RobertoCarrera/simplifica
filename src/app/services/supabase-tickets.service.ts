import { Injectable, inject } from '@angular/core';
import { SimpleSupabaseService } from './simple-supabase.service';

export interface TicketStage {
  id: string;
  name: string;
  color: string;
  position: number;
  is_active: boolean;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export interface TicketPriority {
  id: string;
  name: string;
  level: number;
  color: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  client_id: string;
  stage_id: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  assigned_to?: string;
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  total_amount?: number;
  tags?: string[];
  comments?: TicketComment[];
  attachments?: TicketAttachment[];
  services?: TicketService[];
  company_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  
  // Relaciones populadas
  client?: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  stage?: TicketStage;
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
  user?: {
    name: string;
    email: string;
  };
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  filename: string;
  file_url: string;
  file_size: number;
  file_type: string;
  uploaded_by: string;
  created_at: string;
}

export interface TicketService {
  id: string;
  ticket_id: string;
  service_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  service?: {
    id: string;
    name: string;
    description: string;
    base_price: number;
  };
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  avgResolutionTime: number;
  totalRevenue: number;
  totalEstimatedHours: number;
  totalActualHours: number;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseTicketsService {
  
  private supabase = inject(SimpleSupabaseService);
  private currentCompanyId = ''; // Default vacío; usar tenant/current_company_id cuando esté disponible

  private isValidUuid(id: string | number | undefined | null): boolean {
    if (!id) return false;
    const str = String(id);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  constructor() {
    console.log('🎫 SupabaseTicketsService initialized');
  }

  async getTickets(companyId?: string): Promise<Ticket[]> {
    try {
      const targetCompanyId = companyId || this.currentCompanyId;
      console.log(`🎫 Getting tickets for company ID: ${targetCompanyId}`);

      // Usar tabla tickets existente o crear mock data
      return this.getTicketsFromDatabase(targetCompanyId);
    } catch (error) {
      console.error('❌ Error getting tickets:', error);
      throw error;
    }
  }

  private async getTicketsFromDatabase(companyId: string): Promise<Ticket[]> {
    try {
      // Intentar obtener de tabla tickets real
      let query: any = this.supabase.getClient()
        .from('tickets')
        .select(`
          *,
          clients(id, name, email, phone),
          ticket_stages(id, name, color, position)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      } else {
        // Invalid or missing companyId: proceed with global/untagged query (no warning to avoid noisy logs)
      }

      const { data: tickets, error } = await query;

      if (error && error.code === '42P01') {
        // Tabla no existe, crear mock data
        console.log('🎫 Tickets table not found, creating mock data...');
        return this.getMockTickets(companyId);
      }

      if (error) throw error;

      return (tickets || []).map(this.transformTicketData);
    } catch (error) {
      console.log('🎫 Using mock data due to database error:', error);
      return this.getMockTickets(companyId);
    }
  }

  private getMockTickets(companyId: string): Ticket[] {
    const companies: Record<string, string> = {
      '1': 'SatPCGo',
      '2': 'Michinanny', 
      '3': 'Libera Tus Creencias'
    };

    const companyName = companies[companyId] || 'Empresa';

    return [
      {
        id: `ticket-${companyId}-001`,
        ticket_number: `${companyName.toUpperCase().slice(0,3)}-001`,
        title: `Reparación de laptop ${companyName}`,
        description: `Laptop HP no enciende. Cliente reporta que se apagó de repente y no vuelve a encender.`,
        client_id: `client-${companyId}-001`,
        stage_id: 'stage-001',
        priority: 'high',
        due_date: '2024-12-20',
        estimated_hours: 4,
        total_amount: 150,
        tags: ['hardware', 'laptop', 'reparacion'],
        company_id: companyId.toString(),
        is_active: true,
        created_at: '2024-12-01T10:00:00Z',
        updated_at: '2024-12-01T10:00:00Z',
        client: {
          id: `client-${companyId}-001`,
          name: `Cliente Premium ${companyName}`,
          email: `cliente@${companyName.toLowerCase()}.com`,
          phone: '+34 600 000 001'
        },
        stage: {
          id: 'stage-001',
          name: 'En Diagnóstico',
          color: '#f59e0b',
          position: 1,
          is_active: true,
          company_id: companyId.toString(),
          created_at: '2024-12-01T10:00:00Z',
          updated_at: '2024-12-01T10:00:00Z'
        }
      },
      {
        id: `ticket-${companyId}-002`,
        ticket_number: `${companyName.toUpperCase().slice(0,3)}-002`,
        title: `Instalación de software ${companyName}`,
        description: `Instalar y configurar suite de oficina completa en 5 equipos.`,
        client_id: `client-${companyId}-002`,
        stage_id: 'stage-002',
        priority: 'normal',
        due_date: '2024-12-25',
        estimated_hours: 6,
        total_amount: 200,
        tags: ['software', 'instalacion', 'configuracion'],
        company_id: companyId.toString(),
        is_active: true,
        created_at: '2024-12-02T14:00:00Z',
        updated_at: '2024-12-02T14:00:00Z',
        client: {
          id: `client-${companyId}-002`,
          name: `Empresa Colaboradora ${companyName}`,
          email: `colaboracion@${companyName.toLowerCase()}.com`,
          phone: '+34 600 000 002'
        },
        stage: {
          id: 'stage-002',
          name: 'En Progreso',
          color: '#3b82f6',
          position: 2,
          is_active: true,
          company_id: companyId.toString(),
          created_at: '2024-12-01T10:00:00Z',
          updated_at: '2024-12-01T10:00:00Z'
        }
      },
      {
        id: `ticket-${companyId}-003`,
        ticket_number: `${companyName.toUpperCase().slice(0,3)}-003`,
        title: `Mantenimiento preventivo ${companyName}`,
        description: `Mantenimiento trimestral de servidores y equipos de red.`,
        client_id: `client-${companyId}-003`,
        stage_id: 'stage-003',
        priority: 'low',
        due_date: '2024-12-30',
        estimated_hours: 8,
        total_amount: 300,
        tags: ['mantenimiento', 'servidores', 'red'],
        company_id: companyId.toString(),
        is_active: true,
        created_at: '2024-12-03T09:00:00Z',
        updated_at: '2024-12-03T09:00:00Z',
        client: {
          id: `client-${companyId}-003`,
          name: `Cliente Corporativo ${companyName}`,
          email: `corporativo@${companyName.toLowerCase()}.com`,
          phone: '+34 600 000 003'
        },
        stage: {
          id: 'stage-003',
          name: 'Completado',
          color: '#10b981',
          position: 3,
          is_active: true,
          company_id: companyId.toString(),
          created_at: '2024-12-01T10:00:00Z',
          updated_at: '2024-12-01T10:00:00Z'
        }
      }
    ];
  }

  private transformTicketData(ticket: any): Ticket {
    return {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      title: ticket.title,
      description: ticket.description,
      client_id: ticket.client_id,
      stage_id: ticket.stage_id,
      priority: ticket.priority,
      assigned_to: ticket.assigned_to,
      due_date: ticket.due_date,
      estimated_hours: ticket.estimated_hours,
      actual_hours: ticket.actual_hours,
      total_amount: ticket.total_amount,
  tags: [],
      company_id: ticket.company_id,
      // derive is_active from deleted_at for backward-compat in UI
      is_active: ticket.deleted_at ? false : true,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      client: ticket.clients,
      stage: ticket.ticket_stages
    };
  }

  async createTicket(ticketData: Partial<Ticket>): Promise<Ticket> {
    try {
      // Prefer Edge Function to bypass RLS safely and validate membership
      const client = this.supabase.getClient();
  const { RuntimeConfigService } = await import('./runtime-config.service');
  const cfg = new (RuntimeConfigService as any)();
  await cfg.load?.();
  const base: string | undefined = cfg.get().edgeFunctionsBaseUrl as any;

      if (base) {
        try {
          const funcUrl = base.replace(/\/+$/, '') + '/create-ticket';
          const sess = await client.auth.getSession();
          const accessToken = (sess as any)?.data?.session?.access_token || null;
          const headers: any = { 'Content-Type': 'application/json' };
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

          const body: any = {
            p_company_id: ticketData.company_id,
            p_client_id: ticketData.client_id,
            p_title: ticketData.title,
            p_description: ticketData.description,
            p_stage_id: ticketData.stage_id,
            p_priority: ticketData.priority || 'normal',
            p_due_date: ticketData.due_date,
            p_estimated_hours: ticketData.estimated_hours,
            p_total_amount: ticketData.total_amount
          };

          const resp = await fetch(funcUrl, { method: 'POST', headers, body: JSON.stringify(body) });
          let json: any = {};
          try { json = await resp.json(); } catch { json = {}; }
          if (!resp.ok) {
            if (resp.status === 404) {
              console.warn('Edge create-ticket not deployed (404), falling back to direct insert');
            } else if (resp.status >= 500) {
              console.warn('Edge create-ticket returned 5xx, falling back to direct insert', json);
            } else {
              console.error('Edge create-ticket error', json);
              throw new Error(json?.error || 'Error creando ticket');
            }
          } else {
            const r = Array.isArray(json) ? json[0] : (json?.result || json?.data || json);
            if (r && r.id) {
              return this.transformTicketData(r);
            }
          }
        } catch (edgeErr: any) {
          // Only fallback when the function is missing; otherwise bubble up
          const msg = typeof edgeErr === 'object' && edgeErr && 'message' in edgeErr
            ? String((edgeErr as any).message)
            : String(edgeErr || '');
          if (/404/.test(msg) || /not deployed/i.test(msg)) {
            console.warn('Edge create-ticket not available, using direct insert');
          } else {
            throw edgeErr;
          }
        }
      }

      // Fallback: client-side insert (subject to RLS) - aligned with current tickets schema
      const newTicketData: any = {
        company_id: ticketData.company_id,
        client_id: ticketData.client_id,
        title: ticketData.title,
        description: ticketData.description,
        stage_id: ticketData.stage_id,
        priority: ticketData.priority || 'normal',
        due_date: ticketData.due_date || null,
        total_amount: ticketData.total_amount ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await client
        .from('tickets')
        .insert(newTicketData)
        .select()
        .single();

      if (error) throw error;

      return this.transformTicketData(data);
    } catch (error) {
      console.error('❌ Error creating ticket:', error);
      throw error;
    }
  }

  // Create a ticket and assign its services atomically (via Edge Function when available)
  async createTicketWithServices(
    ticketData: Partial<Ticket>,
    items: Array<{ service_id: string; quantity: number; unit_price?: number }>
  ): Promise<Ticket> {
    // Normalize items
    const normalized = (items || [])
      .map(it => ({
        service_id: it.service_id,
        quantity: Math.max(1, Number(it.quantity || 1)),
        unit_price: typeof it.unit_price === 'number' ? it.unit_price : undefined
      }))
      .filter(it => typeof it.service_id === 'string' && it.service_id.length > 0);

    // If no services, we still create the ticket but UI should have prevented this
    try {
      const client = this.supabase.getClient();
  const { RuntimeConfigService } = await import('./runtime-config.service');
  const cfg = new (RuntimeConfigService as any)();
  await cfg.load?.();
  const base: string | undefined = cfg.get().edgeFunctionsBaseUrl as any;

      if (base) {
        try {
          const funcUrl = base.replace(/\/+$/, '') + '/create-ticket';
          const sess = await client.auth.getSession();
          const accessToken = (sess as any)?.data?.session?.access_token || null;
          const headers: any = { 'Content-Type': 'application/json' };
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

          const body: any = {
            p_company_id: ticketData.company_id,
            p_client_id: ticketData.client_id,
            p_title: ticketData.title,
            p_description: ticketData.description,
            p_stage_id: ticketData.stage_id,
            p_priority: ticketData.priority || 'normal',
            p_due_date: ticketData.due_date,
            p_estimated_hours: ticketData.estimated_hours,
            p_total_amount: ticketData.total_amount,
            p_services: normalized
          };

          const resp = await fetch(funcUrl, { method: 'POST', headers, body: JSON.stringify(body) });
          let json: any = {};
          try { json = await resp.json(); } catch { json = {}; }
          if (!resp.ok) {
            if (resp.status === 404) {
              console.warn('Edge create-ticket not deployed (404), falling back to direct insert');
            } else {
              console.error('Edge create-ticket error', json);
              throw new Error(json?.error || 'Error creando ticket');
            }
          } else {
            const r = Array.isArray(json) ? json[0] : (json?.result || json?.data || json);
            if (r && r.id) {
              return this.transformTicketData(r);
            }
          }
        } catch (edgeErr: any) {
          const msg = typeof edgeErr === 'object' && edgeErr && 'message' in edgeErr
            ? String((edgeErr as any).message)
            : String(edgeErr || '');
          if (/404/.test(msg) || /not deployed/i.test(msg)) {
            console.warn('Edge create-ticket not available, using direct insert');
          } else {
            throw edgeErr;
          }
        }
      }

      // Fallback: direct insert into tickets (bypass edge) and then replace services
      const nowIso = new Date().toISOString();
      const directTicket: any = {
        company_id: ticketData.company_id,
        client_id: ticketData.client_id,
        title: ticketData.title,
        description: ticketData.description,
        stage_id: ticketData.stage_id,
        priority: ticketData.priority || 'normal',
        due_date: ticketData.due_date || null,
        total_amount: ticketData.total_amount ?? null,
        created_at: nowIso,
        updated_at: nowIso
      };
      const { data: createdRow, error: createErr } = await this.supabase.getClient()
        .from('tickets')
        .insert(directTicket)
        .select('*')
        .single();
      if (createErr) throw createErr;
      const created = this.transformTicketData(createdRow);

      try {
        await this.replaceTicketServices(created.id, String(ticketData.company_id || ''), normalized);
      } catch (svcErr) {
        console.warn('Fallback path: failed to insert ticket_services after ticket creation', svcErr);
      }
      return created;
    } catch (err) {
      console.error('❌ Error createTicketWithServices:', err);
      throw err;
    }
  }

  async updateTicket(ticketId: string, ticketData: Partial<Ticket>): Promise<Ticket> {
    try {
      const updateData = {
        ...ticketData,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase.getClient()
        .from('tickets')
        .update(updateData)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) throw error;

      return this.transformTicketData(data);
    } catch (error) {
      console.error('❌ Error updating ticket:', error);
      throw error;
    }
  }

  async deleteTicket(ticketId: string): Promise<void> {
    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        // Soft delete: set deleted_at timestamp
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (error) throw error;
    } catch (error) {
      console.error('❌ Error deleting ticket:', error);
      throw error;
    }
  }

  // Replace all services for a ticket in ticket_services table.
  // This approach is simple and idempotent for small lists: delete existing, then insert current selection.
  async replaceTicketServices(ticketId: string, companyId: string, items: Array<{ service_id: string; quantity: number; unit_price?: number }>): Promise<void> {
    if (!ticketId) return;
    const client = this.supabase.getClient();

    // Normalize payload and compute totals
    const rows = (items || []).map(it => {
      const price = typeof it.unit_price === 'number' ? it.unit_price : 0;
      const qty = Math.max(1, Number(it.quantity || 1));
      return {
        ticket_id: ticketId,
        service_id: it.service_id,
        quantity: qty,
        price_per_unit: price,
        total_price: Number((price * qty).toFixed(2)),
        company_id: companyId
      } as any;
    });

    // Delete existing relations for this ticket
    const { error: delErr } = await client
      .from('ticket_services')
      .delete()
      .eq('ticket_id', ticketId);
    if (delErr) {
      // If delete fails (RLS, etc.), log and stop to avoid duplicates
      console.warn('replaceTicketServices: delete failed, aborting insert', delErr);
      return;
    }

    if (rows.length === 0) return; // nothing to insert

    const { error: insErr } = await client
      .from('ticket_services')
      .insert(rows);
    if (insErr) {
      const msg = (insErr && (insErr.message || '')).toString();
      // 1) company_id missing -> retry without it
      if ((insErr.code === 'PGRST204' || msg.includes("Could not find the 'company_id' column"))) {
        try {
          const rowsNoCompany = rows.map(r => {
            const { company_id, ...rest } = r as any;
            return rest;
          });
          const { error: insErr2 } = await client.from('ticket_services').insert(rowsNoCompany);
          if (!insErr2) return;
          // 2) If still failing due to price_per_unit undefined, try unit_price naming
          const msg2 = (insErr2 && (insErr2.message || '')).toString();
          const undefinedCol2 = insErr2.code === '42703' || /price_per_unit.*does not exist/i.test(msg2) || /column\s+"?price_per_unit"?/i.test(msg2);
          if (undefinedCol2) {
            const rowsUnitNoCompany = (rowsNoCompany as any[]).map(r => {
              const { price_per_unit, ...rest } = r;
              return { ...rest, unit_price: price_per_unit };
            });
            const { error: insErr3 } = await client.from('ticket_services').insert(rowsUnitNoCompany);
            if (insErr3) throw insErr3;
            return;
          }
          throw insErr2;
        } catch (e) {
          throw e;
        }
      }

      // 2) undefined_column for price_per_unit -> try with unit_price key (keeping company_id)
      const undefinedCol = insErr.code === '42703' || /price_per_unit.*does not exist/i.test(msg) || /column\s+"?price_per_unit"?/i.test(msg);
      if (undefinedCol) {
        try {
          const rowsUnit = rows.map((r: any) => {
            const { price_per_unit, ...rest } = r;
            return { ...rest, unit_price: price_per_unit };
          });
          const { error: e2 } = await client.from('ticket_services').insert(rowsUnit);
          if (!e2) return;
          // If company_id missing in this branch
          const msg2 = (e2 && (e2.message || '')).toString();
          if ((e2.code === 'PGRST204' || msg2.includes("Could not find the 'company_id' column"))) {
            const rowsUnitNoCompany = rowsUnit.map((r: any) => { const { company_id, ...rest } = r; return rest; });
            const { error: e3 } = await client.from('ticket_services').insert(rowsUnitNoCompany);
            if (e3) throw e3;
            return;
          }
          throw e2;
        } catch (e) {
          throw e;
        }
      }

      // If it's some other error, throw as before
      console.error('replaceTicketServices: insert error', insErr);
      throw insErr;
    }
  }

  async getTicketStages(companyId: string): Promise<TicketStage[]> {
    try {
      let query: any = this.supabase.getClient()
        .from('ticket_stages')
  .select('*')
  .is('deleted_at', null)
        .order('position', { ascending: true });

      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;

      if (error && error.code === '42P01') {
        return this.getMockStages(companyId);
      }

      if (error) throw error;

      return data || this.getMockStages(companyId);
    } catch (error) {
      return this.getMockStages(companyId);
    }
  }

  private getMockStages(companyId: string): TicketStage[] {
    return [
      {
        id: 'stage-001',
        name: 'Nuevo',
        color: '#6b7280',
        position: 1,
        is_active: true,
        company_id: companyId.toString(),
        created_at: '2024-12-01T10:00:00Z',
        updated_at: '2024-12-01T10:00:00Z'
      },
      {
        id: 'stage-002',
        name: 'En Diagnóstico',
        color: '#f59e0b',
        position: 2,
        is_active: true,
        company_id: companyId.toString(),
        created_at: '2024-12-01T10:00:00Z',
        updated_at: '2024-12-01T10:00:00Z'
      },
      {
        id: 'stage-003',
        name: 'En Progreso',
        color: '#3b82f6',
        position: 3,
        is_active: true,
        company_id: companyId.toString(),
        created_at: '2024-12-01T10:00:00Z',
        updated_at: '2024-12-01T10:00:00Z'
      },
      {
        id: 'stage-004',
        name: 'Esperando Cliente',
        color: '#8b5cf6',
        position: 4,
        is_active: true,
        company_id: companyId.toString(),
        created_at: '2024-12-01T10:00:00Z',
        updated_at: '2024-12-01T10:00:00Z'
      },
      {
        id: 'stage-005',
        name: 'Completado',
        color: '#10b981',
        position: 5,
        is_active: true,
        company_id: companyId.toString(),
        created_at: '2024-12-01T10:00:00Z',
        updated_at: '2024-12-01T10:00:00Z'
      }
    ];
  }

  async getTicketStats(companyId: string): Promise<TicketStats> {
    const tickets = await this.getTickets(companyId);
    
    const stats: TicketStats = {
      total: tickets.length,
      open: tickets.filter(t => t.stage?.name !== 'Completado').length,
      inProgress: tickets.filter(t => t.stage?.name === 'En Progreso').length,
      completed: tickets.filter(t => t.stage?.name === 'Completado').length,
      overdue: tickets.filter(t => t.due_date && new Date(t.due_date) < new Date()).length,
      avgResolutionTime: 2.5, // Mock data
      totalRevenue: tickets.reduce((sum, t) => sum + (t.total_amount || 0), 0),
      totalEstimatedHours: tickets.reduce((sum, t) => sum + (t.estimated_hours || 0), 0),
      totalActualHours: tickets.reduce((sum, t) => sum + (t.actual_hours || 0), 0)
    };

    return stats;
  }

  private async generateTicketNumber(companyId: string): Promise<string> {
    const companies = {
      '1': 'SAT',
      '2': 'MCH', 
      '3': 'LTC'
    };
    
    const prefix = companies[companyId as keyof typeof companies] || 'TKT';
    const timestamp = Date.now().toString().slice(-6);
    return `${prefix}-${timestamp}`;
  }

  // Métodos de utilidad
  getPriorityColor(priority: string): string {
    const colors = {
      low: '#10b981',
      normal: '#3b82f6',
      high: '#f59e0b',
      critical: '#ef4444'
    };
    return colors[priority as keyof typeof colors] || colors.normal;
  }

  getPriorityLabel(priority: string): string {
    const labels = {
      low: 'Baja',
      normal: 'Normal',
      high: 'Alta',
      critical: 'Crítica'
    };
    return labels[priority as keyof typeof labels] || 'Normal';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
