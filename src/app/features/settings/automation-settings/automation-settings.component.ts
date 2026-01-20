import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../../services/toast.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { firstValueFrom } from 'rxjs';
import { SupabaseTicketsService, TicketStage } from '../../../services/supabase-tickets.service';
import { AuthService } from '../../../services/auth.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';

@Component({
  selector: 'app-automation-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './automation-settings.component.html'
})
export class AutomationSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private settingsService = inject(SupabaseSettingsService);
  private ticketsService = inject(SupabaseTicketsService);
  private authService = inject(AuthService);
  private simpleSupabase = inject(SimpleSupabaseService);

  settingsForm: FormGroup;
  loading = signal(false);
  saving = signal(false);
  stages = signal<TicketStage[]>([]);

  // Agent Permission Modules (Loaded dynamically)
  agentModules: { key: string; label: string }[] = [];

  constructor() {
    this.settingsForm = this.fb.group({
      auto_send_quote_email: [false],
      allow_direct_contracting: [false],
      copy_features_between_variants: [false],
      ticket_stage_on_delete: [null],
      ticket_stage_on_staff_reply: [null],
      ticket_stage_on_client_reply: [null],
      // Advanced Configs
      ticket_client_view_estimated_hours: [true],
      ticket_client_can_close: [true],
      ticket_client_can_create_devices: [true],
      ticket_default_internal_comment: [false],
      ticket_auto_assign_on_reply: [false]
    });
  }

  async ngOnInit() {
    await this.loadCatalog();
    this.loadSettings();
  }

  async loadCatalog() {
    try {
      // FIX: 'modules' table does not exist. Use 'modules_catalog'.
      const { data } = await this.simpleSupabase.getClient()
        .from('modules_catalog')
        .select('key, name:label')
        //.eq('is_active', true)
        .order('key');

      this.agentModules = [
        { key: 'dashboard', label: 'Tablero (Dashboard)' },
        { key: 'clients', label: 'Clientes' }
      ];

      if (data) {
        data.forEach((m: any) => {
          // Ignore if it's already in static list (unlikely based on naming)
          // Remove 'calendar' if present as requested (but it's not in DB list provided)
          if (m.key) {
            this.agentModules.push({ key: m.key, label: m.name });
          }
        });
      }

      // Add controls to form
      this.agentModules.forEach(m => {
        this.settingsForm.addControl(`perm_${m.key}`, new FormControl(true));
      });

    } catch (e) {
      console.error('Error loading module catalog', e);
      // Fallback controls?
    }
  }

  async loadSettings() {
    this.loading.set(true);
    try {
      const settings = await firstValueFrom(this.settingsService.getCompanySettings());
      if (settings) {
        this.settingsForm.patchValue({
          auto_send_quote_email: settings.auto_send_quote_email ?? false,
          allow_direct_contracting: settings.allow_direct_contracting ?? false,
          copy_features_between_variants: settings.copy_features_between_variants ?? false,
          ticket_stage_on_delete: settings.ticket_stage_on_delete ?? null,
          ticket_stage_on_staff_reply: settings.ticket_stage_on_staff_reply ?? null,
          ticket_stage_on_client_reply: settings.ticket_stage_on_client_reply ?? null,
          // Advanced Configs
          ticket_client_view_estimated_hours: settings.ticket_client_view_estimated_hours ?? true,
          ticket_client_can_close: settings.ticket_client_can_close ?? true,
          ticket_client_can_create_devices: settings.ticket_client_can_create_devices ?? true,
          ticket_default_internal_comment: settings.ticket_default_internal_comment ?? false,
          ticket_auto_assign_on_reply: settings.ticket_auto_assign_on_reply ?? false
        });

        // Load Agent Permissions
        const perms = settings.agent_module_access || [];
        // If empty/null and not previously saved? Rely on migrated defaults or settings service defaults.
        // Assuming migrated default 'tickets' etc.
        // If settings.agent_module_access is array, patch values.
        const permPatch: Record<string, boolean> = {};
        this.agentModules.forEach(m => {
          // If array is populated, use it. If array is empty (which shouldn't happen if default set), assume logic?
          // Actually, if migration ran, it has defaults.
          // If perms is empty array, it means NO permissions? Or legacy?
          // Safest: if perms.length > 0 check inclusion. If 0 check if it's explicitly empty?
          // Let's assume perms array is authoritative.
          permPatch[`perm_${m.key}`] = perms.includes(m.key);
          // Special case: if perms is totally null/undefined (legacy row), default all true?
          if (!settings.agent_module_access) {
            permPatch[`perm_${m.key}`] = true; // Enable all by default for existing companies before migration
          }
        });
        this.settingsForm.patchValue(permPatch);

        // Load stages
        const cid = this.authService.companyId();
        if (cid) {
          const stages = await this.ticketsService.getTicketStages(cid);
          this.stages.set(stages);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.toast.error('Error', 'Error al cargar los ajustes');
    } finally {
      this.loading.set(false);
    }
  }

  async saveSettings() {
    if (this.settingsForm.invalid) return;

    this.saving.set(true);
    try {
      const formValue = this.settingsForm.value;

      // Reconstruct agent_module_access array
      const agent_module_access: string[] = [];
      this.agentModules.forEach(m => {
        if (formValue[`perm_${m.key}`]) {
          agent_module_access.push(m.key);
        }
      });

      const { ...cleanForm } = formValue;
      // Remove perm keys
      this.agentModules.forEach(m => delete cleanForm[`perm_${m.key}`]);

      const payload = {
        ...cleanForm,
        agent_module_access
      };

      await firstValueFrom(this.settingsService.updateCompanySettings(payload));
      this.toast.success('Guardado', 'Ajustes guardados correctamente');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.toast.error('Error', 'Error al guardar los ajustes');
    } finally {
      this.saving.set(false);
    }
  }
}
