import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export interface Device {
  id: string;
  company_id: string;
  client_id: string;

  // Información básica
  brand: string;
  model: string;
  device_type: string;
  serial_number?: string;
  imei?: string;

  // Estado y condición
  status: 'received' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
  condition_on_arrival?: string;
  reported_issue: string;

  // Información técnica
  operating_system?: string;
  storage_capacity?: string;
  color?: string;
  purchase_date?: string;
  warranty_status?: 'in_warranty' | 'out_of_warranty' | 'unknown';

  // Gestión interna
  priority: 'low' | 'normal' | 'high' | 'urgent';
  estimated_repair_time?: number;
  actual_repair_time?: number;

  // Fechas
  received_at: string;
  started_repair_at?: string;
  completed_at?: string;
  delivered_at?: string;

  // Costos
  estimated_cost?: number;
  final_cost?: number;

  // Metadata
  created_at: string;
  updated_at: string;
  created_by?: string;

  // IA y multimedia
  ai_diagnosis?: any;
  ai_confidence_score?: number;
  device_images?: string[];
  media?: DeviceMedia[];
  repair_notes?: string[];

  // Relaciones
  client?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  deleted_at?: string;
  deletion_reason?: string;
}

export interface DeviceStatusHistory {
  id: string;
  device_id: string;
  previous_status?: string;
  new_status: string;
  changed_by?: string;
  changed_at: string;
  notes?: string;
  location?: string;
  technician_notes?: string;
}

export interface DeviceComponent {
  id: string;
  device_id: string;
  component_name: string;
  component_status: 'working' | 'damaged' | 'replaced' | 'not_checked';
  replacement_needed: boolean;
  replacement_cost?: number;
  supplier?: string;
  part_number?: string;
  installed_at?: string;
  warranty_months: number;
  notes?: string;
}

export interface DeviceMedia {
  id: string;
  device_id: string;
  media_type: 'image' | 'video' | 'document';
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  media_context: 'arrival' | 'damage' | 'repair_process' | 'before_delivery' | 'other';
  description?: string;
  taken_by?: string;
  taken_at: string;
  ai_analysis?: any;
}

export interface DeviceStats {
  total_devices: number;
  received_count: number;
  in_progress_count: number;
  completed_count: number;
  delivered_count: number;
  avg_repair_time: number;
}

export interface DeviceWithClientInfo {
  device_id: string;
  brand: string;
  model: string;
  device_type: string;
  status: string;
  client_name: string;
  client_email: string;
  received_at: string;
  estimated_cost: number;
  progress_days: number;
}

@Injectable({
  providedIn: 'root'
})
export class DevicesService {
  private supabase: SupabaseClient;

  private isValidUuid(id: string | null | undefined): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  constructor(private sbClient: SupabaseClientService) {
    this.supabase = this.sbClient.instance;
  }

  // ================================
  // CRUD BÁSICO DE DISPOSITIVOS
  // ================================

  async getDevices(companyId: string, showDeleted: boolean = false, clientId?: string): Promise<Device[]> {
    try {
      console.log('[DevicesService] getDevices companyId =', companyId, 'showDeleted =', showDeleted);

      // Primary query with embed
      let query: any = this.supabase
        .from('devices')
        .select(`
          *,
          client:clients!devices_client_id_fkey(id, name, email, phone)
        `)
        .order('received_at', { ascending: false });

      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      } else if (companyId) {
        console.warn('DevicesService.getDevices: ignoring non-UUID companyId:', companyId);
      }

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      if (!showDeleted) {
        query = query.is('deleted_at', null);
      } else {
        // If showing deleted, maybe we want ONLY deleted? Or ALL?
        // User request: "list deleted devices if desired".
        // Usually "Show Deleted" toggles between "Active Only" and "Active + Deleted" or "Deleted Only".
        // Let's assume this flag means "Include Deleted" or "Show Deleted Only"?
        // Let's implement as "Include Deleted" essentially disables the filter.
        // Or if we want separate list, we might need a status filter.
        // For now, let's treat `showDeleted` as "Include everything".
        // Wait, typical pattern is separate lists.
        // Let's stick to: default = active only. If true = all (or just deleted?).
        // Let's make it efficient: if true, we don't filter.
        // Actually, let's make it a filter mode? 'active' | 'deleted' | 'all'.
        // But for simplicity of signature, let's stick to boolean.
        // If showDeleted is true, we ONLY show deleted? Or we show ALL?
        // Let's make it `includeDeleted`.
        // But I can't change signature easily without refactoring callers.
        // Let's check callers. Only TicketDetail calls it.
        // I will change it to `includeDeleted: boolean = false`.
        // If true, we remove the .is('deleted_at', null) filter.
        // Actually, better to be explicit.
      }
      // If we want to only show deleted, we would add .not('deleted_at', 'is', null).
      // Let's assume true = show ALL (active + deleted).

      let { data, error } = await query;

      // Fallback: some setups might fail on embed alias; try plain select
      if (error) {
        console.warn('[DevicesService] getDevices with embed failed, retrying with plain select:', error?.message || error);
        let q2: any = this.supabase
          .from('devices')
          .select('*')
          .order('received_at', { ascending: false });
        if (this.isValidUuid(companyId)) q2 = q2.eq('company_id', companyId);
        if (!showDeleted) q2 = q2.is('deleted_at', null);

        const res2 = await q2;
        data = res2.data;
        error = res2.error;
      }

      if (error) {
        console.error('[DevicesService] Error fetching devices (after fallback):', error);
        throw error;
      }

      let arr: any[] = data || [];
      console.log('[DevicesService] getDevices result count =', Array.isArray(arr) ? arr.length : 0);

      // If result is empty but we have a valid company, try Edge Function fallback (bypasses RLS while enforcing membership)
      if ((arr?.length || 0) === 0 && this.isValidUuid(companyId)) {
        try {
          const sess = await this.supabase.auth.getSession();
          const accessToken = (sess as any)?.data?.session?.access_token || null;
          const base = (environment as any).edgeFunctionsBaseUrl || '';
          if (base && accessToken) {
            const funcUrl = base.replace(/\/+$/, '') + '/list-company-devices';
            const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` };
            const resp = await fetch(funcUrl, { method: 'POST', headers, body: JSON.stringify({ p_company_id: companyId }) });
            let json: any = {};
            try { json = await resp.json(); } catch { json = {}; }
            if (resp.ok) {
              const r = Array.isArray(json) ? json : (json?.result || []);
              if (Array.isArray(r) && r.length > 0) {
                console.log('[DevicesService] Edge fallback returned', r.length, 'devices');
                arr = r;
              } else {
                console.warn('[DevicesService] Edge fallback returned empty list');
              }
            } else {
              console.warn('[DevicesService] Edge fallback error', json);
            }
          }
        } catch (e) {
          console.warn('[DevicesService] Edge fallback failed', e);
        }
      }

      return arr as Device[];
    } catch (error) {
      console.error('Error in getDevices:', error);
      throw error;
    }
  }

  async getDeviceById(deviceId: string): Promise<Device | null> {
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .select(`
          *,
          client:clients!devices_client_id_fkey(id, name, email, phone)
        `)
        .eq('id', deviceId)
        .single();

      if (error) {
        console.error('Error fetching device:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getDeviceById:', error);
      throw error;
    }
  }

  async createDevice(device: Partial<Device>): Promise<Device> {
    try {
      // Prefer Edge Function to bypass RLS safely and validate membership
      const base = (environment as any).edgeFunctionsBaseUrl || '';
      if (base) {
        try {
          const funcUrl = base.replace(/\/+$/, '') + '/create-device';
          const sess = await this.supabase.auth.getSession();
          const accessToken = (sess as any)?.data?.session?.access_token || null;
          const headers: any = { 'Content-Type': 'application/json' };
          if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

          const body = {
            p_company_id: (device as any).company_id,
            p_client_id: (device as any).client_id,
            p_brand: (device as any).brand,
            p_model: (device as any).model,
            p_device_type: (device as any).device_type,
            p_reported_issue: (device as any).reported_issue,
            p_priority: (device as any).priority,
            p_received_at: (device as any).received_at,
            p_serial_number: (device as any).serial_number,
            p_imei: (device as any).imei,
            p_color: (device as any).color,
            p_condition_on_arrival: (device as any).condition_on_arrival,
            p_operating_system: (device as any).operating_system,
            p_storage_capacity: (device as any).storage_capacity,
            p_estimated_cost: (device as any).estimated_cost,
            p_final_cost: (device as any).final_cost
          };

          const resp = await fetch(funcUrl, { method: 'POST', headers, body: JSON.stringify(body) });
          let json: any = {};
          try { json = await resp.json(); } catch { json = {}; }
          if (!resp.ok) {
            // Only fallback to direct insert if function is missing; on 403, propagate the error
            if (resp.status === 404) {
              console.warn('Edge create-device not deployed (404), falling back to direct insert');
            } else if (resp.status === 403) {
              console.error('Edge create-device forbidden (membership or CORS):', json);
              throw json;
            } else {
              console.error('Edge create-device error', json);
              throw json;
            }
          } else {
            const r = Array.isArray(json) ? json[0] : (json?.result || json?.data || json);
            if (r && r.id) {
              return r as Device;
            }
          }
        } catch (edgeErr) {
          console.warn('Edge create-device call failed, falling back to direct insert', edgeErr);
        }
      }

      // Fallback: direct insert (will respect RLS; may fail with 42501 without proper policies)
      const { data, error } = await this.supabase
        .from('devices')
        .insert([device])
        .select(`
          *,
          client:clients!devices_client_id_fkey(id, name, email, phone)
        `)
        .single();

      if (error) {
        console.error('Error creating device:', error);
        throw error;
      }

      return data as unknown as Device;
    } catch (error) {
      console.error('Error in createDevice:', error);
      throw error;
    }
  }

  async updateDevice(deviceId: string, updates: Partial<Device>): Promise<Device> {
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .update(updates)
        .eq('id', deviceId)
        .select(`
          *,
          client:clients!devices_client_id_fkey(id, name, email, phone)
        `)
        .single();

      if (error) {
        console.error('Error updating device:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in updateDevice:', error);
      throw error;
    }
  }

  async deleteDevice(deviceId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('devices')
        .delete()
        .eq('id', deviceId);

      if (error) {
        console.error('Error deleting device:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in deleteDevice:', error);
      throw error;
    }
  }

  async softDeleteDevice(deviceId: string, reason: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('devices')
        .update({
          deleted_at: new Date().toISOString(),
          deletion_reason: reason
        })
        .eq('id', deviceId);

      if (error) {
        console.error('Error soft deleting device:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in softDeleteDevice:', error);
      throw error;
    }
  }

  async restoreDevice(deviceId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('devices')
        .update({
          deleted_at: null,
          deletion_reason: null
        })
        .eq('id', deviceId);

      if (error) {
        console.error('Error restoring device:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in restoreDevice:', error);
      throw error;
    }
  }

  // ================================
  // GESTIÓN DE ESTADOS
  // ================================

  async updateDeviceStatus(deviceId: string, newStatus: Device['status'], notes?: string): Promise<Device> {
    try {
      const updates: Partial<Device> = { status: newStatus };

      // Actualizar fechas automáticamente según el estado
      const now = new Date().toISOString();
      switch (newStatus) {
        case 'in_progress':
          updates.started_repair_at = now;
          break;
        case 'completed':
          updates.completed_at = now;
          break;
        case 'delivered':
          updates.delivered_at = now;
          break;
      }

      const device = await this.updateDevice(deviceId, updates);

      // Registrar en el historial si hay notas adicionales
      if (notes) {
        await this.addStatusHistoryEntry(deviceId, newStatus, notes);
      }

      return device;
    } catch (error) {
      console.error('Error updating device status:', error);
      throw error;
    }
  }

  async getDeviceStatusHistory(deviceId: string): Promise<DeviceStatusHistory[]> {
    try {
      const { data, error } = await this.supabase
        .from('device_status_history')
        .select('*')
        .eq('device_id', deviceId)
        .order('changed_at', { ascending: false });

      if (error) {
        console.error('Error fetching device status history:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getDeviceStatusHistory:', error);
      throw error;
    }
  }

  private async addStatusHistoryEntry(deviceId: string, status: string, notes: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('device_status_history')
        .insert([{
          device_id: deviceId,
          new_status: status,
          notes: notes
        }]);

      if (error) {
        console.error('Error adding status history entry:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in addStatusHistoryEntry:', error);
      throw error;
    }
  }

  // ================================
  // GESTIÓN DE COMPONENTES
  // ================================

  async getDeviceComponents(deviceId: string): Promise<DeviceComponent[]> {
    try {
      const { data, error } = await this.supabase
        .from('device_components')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching device components:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getDeviceComponents:', error);
      throw error;
    }
  }

  async addDeviceComponent(component: Partial<DeviceComponent>): Promise<DeviceComponent> {
    try {
      const { data, error } = await this.supabase
        .from('device_components')
        .insert([component])
        .select('*')
        .single();

      if (error) {
        console.error('Error adding device component:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in addDeviceComponent:', error);
      throw error;
    }
  }

  async updateDeviceComponent(componentId: string, updates: Partial<DeviceComponent>): Promise<DeviceComponent> {
    try {
      const { data, error } = await this.supabase
        .from('device_components')
        .update(updates)
        .eq('id', componentId)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating device component:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in updateDeviceComponent:', error);
      throw error;
    }
  }

  // ================================
  // GESTIÓN DE MULTIMEDIA
  // ================================

  async getDeviceMedia(deviceId: string): Promise<DeviceMedia[]> {
    try {
      const { data, error } = await this.supabase
        .from('device_media')
        .select('*')
        .eq('device_id', deviceId)
        .order('taken_at', { ascending: false });

      if (error) {
        console.error('Error fetching device media:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getDeviceMedia:', error);
      throw error;
    }
  }

  async getTicketDeviceMedia(ticketDeviceId: string): Promise<DeviceMedia[]> {
    try {
      const { data, error } = await this.supabase
        .from('device_media')
        .select('*')
        .eq('ticket_device_id', ticketDeviceId)
        .order('taken_at', { ascending: false });

      if (error) {
        console.error('Error fetching ticket device media:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getTicketDeviceMedia:', error);
      throw error;
    }
  }

  async uploadDeviceImage(
    deviceId: string,
    file: File,
    context: DeviceMedia['media_context'],
    description?: string,
    ticketDeviceId?: string,
    ticketId?: string,
    deviceInfo?: { brand?: string; model?: string }
  ): Promise<DeviceMedia> {
    try {
      // Generate descriptive filename
      const ext = file.name.split('.').pop() || 'jpg';
      const sanitize = (s?: string) => (s || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
      const brand = sanitize(deviceInfo?.brand) || 'device';
      const model = sanitize(deviceInfo?.model) || '';
      const contextLabel = context || 'img';
      const ts = Date.now();
      const baseName = model ? `${brand}_${model}_${contextLabel}_${ts}.${ext}` : `${brand}_${contextLabel}_${ts}.${ext}`;

      let fileName = `${deviceId}/${baseName}`;

      // Si tenemos ticketId, usar estructura ordenada por año/mes
      if (ticketId) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        fileName = `${year}/${month}/${ticketId}/${baseName}`;
      }

      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from('device-images')
        .upload(fileName, file);

      if (uploadError) {
        console.error('Error uploading file:', uploadError);
        throw uploadError;
      }

      // Obtener URL pública
      const { data: { publicUrl } } = this.supabase.storage
        .from('device-images')
        .getPublicUrl(fileName);

      // Registrar en la base de datos
      const insertPayload: any = {
        device_id: deviceId,
        media_type: 'image',
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        media_context: context,
        description: description
      };

      // Link to ticket-device relationship if provided
      if (ticketDeviceId) {
        insertPayload.ticket_device_id = ticketDeviceId;
      }

      const { data, error } = await this.supabase
        .from('device_media')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) {
        console.error('Error saving media record:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in uploadDeviceImage:', error);
      throw error;
    }
  }

  // ================================
  // ESTADÍSTICAS Y REPORTES
  // ================================

  async getDeviceStats(companyId: string): Promise<DeviceStats> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_devices_stats', { company_uuid: companyId });

      if (error) {
        console.error('Error fetching device stats:', error);
        throw error;
      }

      return data[0] || {
        total_devices: 0,
        received_count: 0,
        in_progress_count: 0,
        completed_count: 0,
        delivered_count: 0,
        avg_repair_time: 0
      };
    } catch (error) {
      console.error('Error in getDeviceStats:', error);
      throw error;
    }
  }

  async getDevicesWithClientInfo(companyId: string): Promise<DeviceWithClientInfo[]> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_devices_with_client_info', { company_uuid: companyId });

      if (error) {
        console.error('Error fetching devices with client info:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getDevicesWithClientInfo:', error);
      throw error;
    }
  }

  // ================================
  // BÚSQUEDA Y FILTROS
  // ================================

  async searchDevices(companyId: string, searchTerm: string, filters?: {
    status?: Device['status'];
    device_type?: string;
    priority?: Device['priority'];
    date_from?: string;
    date_to?: string;
  }): Promise<Device[]> {
    try {
      let query = this.supabase
        .from('devices')
        .select(`
          *,
          client:clients(id, name, email, phone)
        `)
        .eq('company_id', companyId);

      // Aplicar filtros
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.device_type) {
        query = query.eq('device_type', filters.device_type);
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters?.date_from) {
        query = query.gte('received_at', filters.date_from);
      }
      if (filters?.date_to) {
        query = query.lte('received_at', filters.date_to);
      }

      // Aplicar búsqueda de texto
      if (searchTerm.trim()) {
        query = query.or(`
          brand.ilike.%${searchTerm}%,
          model.ilike.%${searchTerm}%,
          serial_number.ilike.%${searchTerm}%,
          reported_issue.ilike.%${searchTerm}%
        `);
      }

      const { data, error } = await query.order('received_at', { ascending: false });

      if (error) {
        console.error('Error searching devices:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in searchDevices:', error);
      throw error;
    }
  }

  // ================================
  // INTEGRACIÓN CON TICKETS
  // ================================

  async linkDeviceToTicket(ticketId: string, deviceId: string, relationType: string = 'repair'): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .from('ticket_devices')
        .insert([{
          ticket_id: ticketId,
          device_id: deviceId,
          relation_type: relationType
        }])
        .select('id')
        .single();

      if (error) {
        console.error('Error linking device to ticket:', error);
        throw error;
      }

      return data.id;
    } catch (error) {
      console.error('Error in linkDeviceToTicket:', error);
      throw error;
    }
  }

  async getTicketDevices(ticketId: string, includeDeleted: boolean = false): Promise<Device[]> {
    try {
      const { data, error } = await this.supabase
        .from('ticket_devices')
        .select(`
          device:devices(
            *,
            client:clients!devices_client_id_fkey(id, name, email, phone),
            media:device_media(*)
          )
        `)
        .eq('ticket_id', ticketId);

      if (error) {
        console.error('Error fetching ticket devices:', error);
        throw error;
      }

      // Map results - media is now nested inside device
      let devices = (data?.map((item: any) => {
        const device = item.device;
        return device;
      }).filter(Boolean) || []) as Device[];

      if (!includeDeleted) {
        devices = devices.filter(d => !d.deleted_at);
      }

      return devices;
    } catch (error) {
      console.error('Error in getTicketDevices:', error);
      throw error;
    }
  }

  async getDeviceTickets(deviceId: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('ticket_devices')
        .select(`
          relation_type,
          created_at,
          ticket:tickets(
            id,
            ticket_number,
            title,
            status:ticket_stages(name),
            priority,
            created_at,
            total_amount
          )
        `)
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching device tickets:', error);
        throw error;
      }

      return data?.map((item: any) => ({
        ...item.ticket,
        relation_type: item.relation_type,
        linked_at: item.created_at
      })) || [];
    } catch (error) {
      console.error('Error in getDeviceTickets:', error);
      throw error;
    }
  }

  async linkDevicesToTicket(ticketId: string, deviceIds: string[]): Promise<void> {
    try {
      if (!deviceIds.length) return;

      const records = deviceIds.map(deviceId => ({
        ticket_id: ticketId,
        device_id: deviceId
      }));

      const { error } = await this.supabase
        .from('ticket_devices')
        .insert(records);

      if (error) {
        console.error('Error linking devices to ticket:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in linkDevicesToTicket:', error);
      throw error;
    }
  }
}
