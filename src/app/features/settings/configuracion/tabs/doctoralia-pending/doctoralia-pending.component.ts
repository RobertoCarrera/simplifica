import { Component, Input, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../../../services/supabase-client.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';
import { GlobalTagsService } from '../../../../../core/services/global-tags.service';
import { SupabaseClient } from '@supabase/supabase-js';

interface PendingDoctoraliaClient {
  id: string;
  name: string;
  surname: string;
  phone: string | null;
  email: string | null;
  docplanner_patient_id: string | null;
  created_at: string;
  metadata: Record<string, any>;
  // Editable copies for inline editing
  editPhone: string;
  editEmail: string;
}

@Component({
  selector: 'app-doctoralia-pending',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './doctoralia-pending.component.html',
  styleUrls: ['./doctoralia-pending.component.scss']
})
export class DoctoraliaPendingComponent implements OnInit {
  @Input() companyId: string | null | undefined = null;

  loading = signal(false);
  saving = signal(false);
  clients = signal<PendingDoctoraliaClient[]>([]);
  error = signal<string | null>(null);

  // Bulk selection
  selectedIds = signal<Set<string>>(new Set());
  bulkImporting = signal(false);

  private supabase: SupabaseClient;

  constructor(
    private sbClient: SupabaseClientService,
    private authService: AuthService,
    private toast: ToastService,
    private tagsService: GlobalTagsService
  ) {
    this.supabase = this.sbClient.instance;
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    if (!this.companyId) {
      this.error.set('No se encontró la empresa');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error: err } = await this.supabase
        .from('clients')
        .select('id, name, surname, phone, email, docplanner_patient_id, created_at, metadata')
        .eq('company_id', this.companyId)
        .eq('is_active', false)
        .not('docplanner_patient_id', 'is', null)
        .order('created_at', { ascending: false });

      if (err) throw err;

      const clients: PendingDoctoraliaClient[] = (data || []).map(c => ({
        ...c,
        editPhone: c.phone || '',
        editEmail: c.email || ''
      }));

      this.clients.set(clients);
    } catch (err: any) {
      console.error('Error loading Doctoralia pending clients:', err);
      this.error.set(err?.message || 'Error al cargar clientes pendientes');
    } finally {
      this.loading.set(false);
    }
  }

  isAllSelected(): boolean {
    const list = this.clients();
    return list.length > 0 && list.every(c => this.selectedIds().has(c.id));
  }

  toggleAll(): void {
    if (this.isAllSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.clients().map(c => c.id)));
    }
  }

  toggleClient(id: string): void {
    this.selectedIds.update(set => {
      const newSet = new Set(set);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  get selectedCount(): number {
    return this.selectedIds().size;
  }

  get hasSelection(): boolean {
    return this.selectedCount > 0;
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  async importClient(client: PendingDoctoraliaClient): Promise<void> {
    const phone = client.editPhone.trim();
    const email = client.editEmail.trim();

    // Validate phone OR email is filled
    if (!phone && !email) {
      this.toast.error('Datos requeridos', 'Completá teléfono o email para importar el cliente.');
      return;
    }

    this.saving.set(true);

    try {
      // 1. Deduplication check: look for existing active client with same phone or email
      let existingClient: { id: string } | null = null;

      if (phone || email) {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (phone) {
          conditions.push(`phone = $${paramIndex++}`);
          values.push(phone);
        }
        if (email) {
          conditions.push(`email = $${paramIndex++}`);
          values.push(email);
        }

        const { data: dupData, error: dupErr } = await this.supabase
          .from('clients')
          .select('id')
          .eq('company_id', this.companyId)
          .eq('is_active', true)
          .or(conditions.join(','))
          .limit(1);

        if (dupErr) throw dupErr;

        if (dupData && dupData.length > 0) {
          existingClient = dupData[0];
        }
      }

      if (existingClient) {
        // 2a. Merge flow: ask user and update existing + delete pending
        const confirmed = confirm(
          `Se encontró un cliente con el mismo teléfono o email. ¿Deseás fusionar los datos?\n\n` +
          `El cliente pendiente será eliminado y sus datos se transferirán al cliente existente.`
        );

        if (!confirmed) {
          this.saving.set(false);
          return;
        }

        // Update existing client with pending client's data (preserve name/surname at minimum)
        const updates: Partial<PendingDoctoraliaClient> = {};
        if (!existingClient) throw new Error('No existing client');

        if (phone && !existingClient) {
          // Only update if no existing
        }
        // Merge: update existing with pending client's data
        const { error: updateErr } = await this.supabase
          .from('clients')
          .update({
            phone: phone || undefined,
            email: email || undefined,
            metadata: {
              ...(client.metadata || {}),
              docplanner_patient_id: client.docplanner_patient_id,
              imported_from_docplanner: true,
              docplanner_imported_at: new Date().toISOString()
            }
          })
          .eq('id', existingClient.id);

        if (updateErr) throw updateErr;

        // Delete pending client
        const { error: deleteErr } = await this.supabase
          .from('clients')
          .delete()
          .eq('id', client.id);

        if (deleteErr) throw deleteErr;

        // Add "Doctoralia" tag if not already present
        await this.addDoctoraliaTag(existingClient.id);

        this.toast.success('Cliente fusionado', 'Los datos se fusionaron con el cliente existente.');

      } else {
        // 2b. No match: activate client
        const { error: updateErr } = await this.supabase
          .from('clients')
          .update({
            is_active: true,
            phone: phone || null,
            email: email || null,
            metadata: {
              ...(client.metadata || {}),
              pending_docplanner_import: false,
              imported_from_docplanner: true,
              docplanner_imported_at: new Date().toISOString()
            }
          })
          .eq('id', client.id);

        if (updateErr) throw updateErr;

        // Add "Doctoralia" tag
        await this.addDoctoraliaTag(client.id);

        this.toast.success('Cliente importado', 'El cliente ya está activo en el sistema.');
      }

      // Refresh list
      this.selectedIds.update(set => {
        const newSet = new Set(set);
        newSet.delete(client.id);
        return newSet;
      });
      await this.load();

    } catch (err: any) {
      console.error('Error importing client:', err);
      this.toast.error('Error al importar', err?.message || 'Intentá de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  async bulkImport(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    this.bulkImporting.set(true);

    let successCount = 0;
    let failCount = 0;

    try {
      for (const id of ids) {
        const client = this.clients().find(c => c.id === id);
        if (!client) continue;

        const phone = client.editPhone.trim();
        const email = client.editEmail.trim();

        if (!phone && !email) {
          failCount++;
          continue;
        }

        // Deduplication check
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (phone) {
          conditions.push(`phone = $${paramIndex++}`);
          values.push(phone);
        }
        if (email) {
          conditions.push(`email = $${paramIndex++}`);
          values.push(email);
        }

        const { data: dupData, error: dupErr } = await this.supabase
          .from('clients')
          .select('id')
          .eq('company_id', this.companyId)
          .eq('is_active', true)
          .or(conditions.join(','))
          .limit(1);

        if (dupErr || !dupData || dupData.length === 0) {
          // No existing client - activate
          const { error: updateErr } = await this.supabase
            .from('clients')
            .update({
              is_active: true,
              phone: phone || null,
              email: email || null,
              metadata: {
                ...(client.metadata || {}),
                pending_docplanner_import: false,
                imported_from_docplanner: true,
                docplanner_imported_at: new Date().toISOString()
              }
            })
            .eq('id', id);

          if (!updateErr) {
            await this.addDoctoraliaTag(id);
            successCount++;
          } else {
            failCount++;
          }
        } else {
          // Merge with existing
          const existingId = dupData[0].id;
          const { error: updateErr } = await this.supabase
            .from('clients')
            .update({
              phone: phone || undefined,
              email: email || undefined,
              metadata: {
                ...((dupData as any)?.metadata || {}),
                docplanner_patient_id: client.docplanner_patient_id,
                imported_from_docplanner: true,
                docplanner_imported_at: new Date().toISOString()
              }
            })
            .eq('id', existingId);

          if (!updateErr) {
            await this.addDoctoraliaTag(existingId);
            // Delete pending
            await this.supabase.from('clients').delete().eq('id', id);
            successCount++;
          } else {
            failCount++;
          }
        }
      }

      if (successCount > 0) {
        this.toast.success(
          'Importación completada',
          `${successCount} cliente${successCount !== 1 ? 's' : ''} importado${successCount !== 1 ? 's' : ''}.`
        );
      }
      if (failCount > 0) {
        this.toast.error(
          'Algunos clientes no se pudieron importar',
          `${failCount} cliente${failCount !== 1 ? 's' : ''} requerían teléfono o email.`
        );
      }

      this.selectedIds.set(new Set());
      await this.load();

    } catch (err: any) {
      console.error('Error in bulk import:', err);
      this.toast.error('Error en importación masiva', err?.message || 'Intentá de nuevo.');
    } finally {
      this.bulkImporting.set(false);
    }
  }

  async deleteClient(client: PendingDoctoraliaClient): Promise<void> {
    const confirmed = confirm(
      `¿Estás seguro de eliminar este cliente pendiente?\n\n` +
      `${client.name} ${client.surname}\n` +
      `ID Docplanner: ${client.docplanner_patient_id || '—'}`
    );

    if (!confirmed) return;

    this.saving.set(true);

    try {
      const { error: deleteErr } = await this.supabase
        .from('clients')
        .delete()
        .eq('id', client.id);

      if (deleteErr) throw deleteErr;

      this.selectedIds.update(set => {
        const newSet = new Set(set);
        newSet.delete(client.id);
        return newSet;
      });

      await this.load();
      this.toast.success('Cliente eliminado', 'El cliente pendiente fue eliminado.');
    } catch (err: any) {
      console.error('Error deleting client:', err);
      this.toast.error('Error al eliminar', err?.message || 'No se pudo eliminar.');
    } finally {
      this.saving.set(false);
    }
  }

  private async addDoctoraliaTag(clientId: string): Promise<void> {
    // Look up Doctoralia tag (idempotent - uses global_tags system)
    const tagId = await this.findOrCreateTag('Doctoralia', 'Integración', '#00b8a9', 'clients');
    if (!tagId) return;

    try {
      await this.tagsService.assignTag('clients', clientId, tagId).toPromise();
    } catch (err) {
      // Unique constraint violation means already assigned - that's fine
      console.warn('Doctoralia tag assignment result:', err);
    }
  }

  private async findOrCreateTag(name: string, category: string, color: string, scope: string): Promise<string | null> {
    try {
      // Try to find existing tag
      const { data } = await this.supabase
        .from('global_tags')
        .select('id')
        .eq('name', name)
        .limit(1)
        .single();

      if (data?.id) return data.id;

      // Create if doesn't exist
      const { data: newTag, error } = await this.supabase
        .from('global_tags')
        .insert({ name, category, color, scope: [scope] })
        .select('id')
        .single();

      if (error) {
        console.warn('Could not create tag:', error);
        return null;
      }
      return newTag?.id || null;
    } catch (err) {
      console.warn('Error in findOrCreateTag:', err);
      return null;
    }
  }
}