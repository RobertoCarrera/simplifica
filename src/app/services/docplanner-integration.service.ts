import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface DocplannerIntegration {
  id: string;
  company_id: string;
  is_active: boolean;
  facility_id?: string;
  facility_name?: string;
  sync_bookings: boolean;
  sync_patients: boolean;
  auto_sync: boolean;
  doctor_mappings: DoctorMapping[];
  last_sync_at?: string;
  last_sync_status?: 'success' | 'partial' | 'error';
  last_sync_message?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DoctorMapping {
  dp_doctor_id: string;
  dp_doctor_name: string;
  professional_id: string;
  address_id: string;
}

export interface DPFacility {
  id: string;
  name: string;
}

export interface DPDoctor {
  id: string;
  name: string;
  surname: string;
}

export interface DPAddress {
  id: string;
  name: string;
  street?: string;
}

export interface SyncResult {
  status: 'success' | 'partial' | 'error';
  synced: number;
  failed: number;
  errors: string[];
  roomConflicts?: number;
}

export interface SyncLogEntry {
  id: string;
  sync_type: 'bookings' | 'patients' | 'full' | 'webhook';
  direction: 'pull' | 'push' | 'bidirectional';
  status: 'started' | 'success' | 'partial' | 'error';
  records_synced: number;
  records_failed: number;
  error_details: string[] | null;
  created_at: string;
  completed_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class DocplannerIntegrationService {
  private supabase = inject(SupabaseClientService);
  private auth     = inject(AuthService);

  private _integration = signal<DocplannerIntegration | null>(null);
  private _loading     = signal(false);

  readonly integration = this._integration.asReadonly();
  readonly isActive    = computed(() => this._integration()?.is_active === true);
  readonly loading     = this._loading.asReadonly();

  private async extractInvokeError(error: unknown): Promise<Error> {
    if (error != null && typeof error === 'object' && 'context' in error) {
      const ctx = (error as { context: unknown }).context;
      if (ctx instanceof Response) {
        try {
          const body = await ctx.clone().json() as Record<string, unknown>;
          const msg = (body['error'] as string) ?? (body['message'] as string) ?? 'Error desconocido';
          return new Error(msg);
        } catch { /* not JSON */ }
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private async invoke(body: Record<string, unknown>): Promise<any> {
    const { data: { session } } = await this.supabase.instance.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sesión no activa. Por favor recarga la página e intenta de nuevo.');
    }

    const { data, error } = await this.supabase.instance.functions.invoke(
      'docplanner-api',
      {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      },
    );

    if (error) throw await this.extractInvokeError(error);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async loadIntegration(): Promise<void> {
    const companyId = this.auth.companyId();
    if (!companyId) return;

    this._loading.set(true);
    try {
      const { data, error } = await this.supabase.instance
        .from('docplanner_integrations')
        .select('id, company_id, is_active, facility_id, facility_name, sync_bookings, sync_patients, auto_sync, doctor_mappings, last_sync_at, last_sync_status, last_sync_message, created_at, updated_at')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        if (error.code === '42P01' || error.message?.includes('404')) {
          this._integration.set(null);
        } else {
          console.error('[DocplannerIntegrationService] loadIntegration error:', error);
          this._integration.set(null);
        }
      } else {
        this._integration.set(data);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async saveCredentials(clientId: string, clientSecret: string): Promise<void> {
    await this.invoke({
      action: 'save-credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });
    await this.loadIntegration();
  }

  async testConnection(): Promise<{ ok: boolean; facilityCount?: number; facilities?: DPFacility[]; error?: string }> {
    return await this.invoke({ action: 'test-connection' });
  }

  async disconnect(): Promise<void> {
    await this.invoke({ action: 'disconnect' });
    this._integration.set(null);
  }

  async getFacilities(): Promise<DPFacility[]> {
    const data = await this.invoke({ action: 'get-facilities' });
    return data.facilities || [];
  }

  async getDoctors(facilityId: string): Promise<DPDoctor[]> {
    const data = await this.invoke({ action: 'get-doctors', facility_id: facilityId });
    return data.doctors || [];
  }

  async getAddresses(facilityId: string, doctorId: string): Promise<DPAddress[]> {
    const data = await this.invoke({
      action: 'get-addresses',
      facility_id: facilityId,
      doctor_id: doctorId,
    });
    return data.addresses || [];
  }

  async saveConfig(config: {
    facility_id?: string;
    facility_name?: string;
    doctor_mappings?: DoctorMapping[];
    sync_bookings?: boolean;
    sync_patients?: boolean;
    auto_sync?: boolean;
  }): Promise<void> {
    await this.invoke({ action: 'save-config', ...config });
    await this.loadIntegration();
  }

  async syncBookings(): Promise<SyncResult> {
    return await this.invoke({ action: 'sync-bookings' });
  }

  async importDoctors(facilityId: string): Promise<{ imported: number; skipped: number; total: number; message: string }> {
    return await this.invoke({ action: 'import-doctors', facility_id: facilityId });
  }

  async importPatients(): Promise<{ imported: number; tagged: number; total: number; message: string; bookings_scanned?: number; skipped_mappings?: number; errors?: string[] }> {
    return await this.invoke({ action: 'import-patients' });
  }

  async getSyncLogs(limit = 20): Promise<SyncLogEntry[]> {
    const companyId = this.auth.companyId();
    if (!companyId) return [];

    const { data, error } = await this.supabase.instance
      .from('docplanner_sync_log')
      .select('id, sync_type, direction, status, records_synced, records_failed, error_details, created_at, completed_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DocplannerIntegrationService] getSyncLogs error:', error);
      return [];
    }
    return data || [];
  }

  getWebhookUrl(): string {
    const integration = this._integration();
    if (!integration?.company_id) return '';
    const supabaseUrl = (this.supabase.instance as any).supabaseUrl || '';
    return `${supabaseUrl}/functions/v1/docplanner-webhook?company_id=${integration.company_id}`;
  }
}
