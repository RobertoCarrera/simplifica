import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  repair_notes?: string[];
  
  // Relaciones
  client?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
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

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  // ================================
  // CRUD BÁSICO DE DISPOSITIVOS
  // ================================

  async getDevices(companyId: string): Promise<Device[]> {
    try {
      const { data, error } = await this.supabase
        .from('devices')
        .select(`
          *,
          client:clients(id, name, email, phone)
        `)
        .eq('company_id', companyId)
        .order('received_at', { ascending: false });

      if (error) {
        console.error('Error fetching devices:', error);
        throw error;
      }

      return data || [];
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
          client:clients(id, name, email, phone)
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
      const { data, error } = await this.supabase
        .from('devices')
        .insert([device])
        .select(`
          *,
          client:clients(id, name, email, phone)
        `)
        .single();

      if (error) {
        console.error('Error creating device:', error);
        throw error;
      }

      return data;
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
          client:clients(id, name, email, phone)
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

  async uploadDeviceImage(deviceId: string, file: File, context: DeviceMedia['media_context'], description?: string): Promise<DeviceMedia> {
    try {
      // Subir archivo a Supabase Storage
      const fileName = `${deviceId}/${Date.now()}_${file.name}`;
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
      const { data, error } = await this.supabase
        .from('device_media')
        .insert([{
          device_id: deviceId,
          media_type: 'image',
          file_url: publicUrl,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          media_context: context,
          description: description
        }])
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

  async linkDeviceToTicket(ticketId: string, deviceId: string, relationType: string = 'repair'): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ticket_devices')
        .insert([{
          ticket_id: ticketId,
          device_id: deviceId,
          relation_type: relationType
        }]);

      if (error) {
        console.error('Error linking device to ticket:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in linkDeviceToTicket:', error);
      throw error;
    }
  }

  async getTicketDevices(ticketId: string): Promise<Device[]> {
    try {
      const { data, error } = await this.supabase
        .from('ticket_devices')
        .select(`
          device:devices(
            *,
            client:clients(id, name, email, phone)
          )
        `)
        .eq('ticket_id', ticketId);

      if (error) {
        console.error('Error fetching ticket devices:', error);
        throw error;
      }

      return (data?.map((item: any) => item.device).filter(Boolean) || []) as Device[];
    } catch (error) {
      console.error('Error in getTicketDevices:', error);
      throw error;
    }
  }
}
