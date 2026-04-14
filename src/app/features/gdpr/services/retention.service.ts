import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';

export interface RetentionSummary {
  category: string;
  table_name: string;
  retention_days: number;
  legal_basis: string;
  description: string;
  total: number;
  protected_count: number;
  expired_count: number;
}

export interface RetentionRecord {
  id: string;       // Shortened display ID (e.g. '#a1b2c3')
  uuid: string;     // Full UUID for deletion operations
  created_at: string;
  age_days: number;
  expires_at: string;
  status: 'protected' | 'expired';
  linked_entity: string; // Anonymized: "Cliente: Juan M." or "Factura #INV-001"
}

@Injectable({ providedIn: 'root' })
export class RetentionService {
  private sbClient = inject(SupabaseClientService);
  private toast = inject(ToastService);

  private _summary = signal<RetentionSummary[]>([]);
  summary = this._summary.asReadonly();

  async getSummary(): Promise<RetentionSummary[]> {
    try {
      const { data, error } = await this.sbClient.instance.rpc('retention_summary');
      if (error) throw error;
      this._summary.set(data || []);
      return data || [];
    } catch (e: any) {
      this.toast.error('Error', 'No se pudo cargar el resumen de retención');
      return [];
    }
  }

  async getRecords(
    category: string,
    filter: 'all' | 'protected' | 'expired' = 'all',
    page = 1,
    limit = 50
  ): Promise<{ records: RetentionRecord[]; total: number }> {
    try {
      const { data, error } = await this.sbClient.instance.rpc('retention_records', {
        p_category: category,
        p_filter: filter,
        p_page: page,
        p_limit: limit
      });
      if (error) throw error;
      return {
        records: data.records,
        total: data.pagination.total
      };
    } catch (e: any) {
      this.toast.error('Error', 'No se pudieron cargar los registros');
      return { records: [], total: 0 };
    }
  }

  async deleteRecord(tableName: string, recordId: string): Promise<boolean> {
    try {
      const { data, error } = await this.sbClient.instance.rpc('delete_retention_record', {
        p_table_name: tableName,
        p_record_id: recordId
      });
      if (error) throw error;
      if (!data?.success) {
        const msg = data?.error || 'No se pudo eliminar';
        if (msg === 'related_protected') {
          this.toast.error('No permitido', 'No se puede eliminar: hay registros relacionados que aún están protegidos. Elimina primero: ' + (data.protected_tables?.join(', ') || 'otros registros'));
        } else if (msg === 'protegido') {
          this.toast.error('No permitido', `No se puede eliminar: datos protegidos por requisito legal (${data.legal_basis || 'desconocido'})`);
        } else if (msg === 'not_found') {
          this.toast.error('No encontrado', 'El registro no existe');
        } else {
          this.toast.error('Error', msg);
        }
        return false;
      }
      this.toast.success('Registro eliminado', 'El registro ha sido eliminado correctamente');
      return true;
    } catch (e: any) {
      this.toast.error('Error', 'No se pudo eliminar el registro');
      return false;
    }
  }
}
