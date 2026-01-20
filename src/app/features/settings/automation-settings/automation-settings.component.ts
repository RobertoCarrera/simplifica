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
      ticket_auto_assign_on_reply: [false],
      // REMINDERS & AUTOMATIONS (Dynamic)
      automation_reminder_24h_enabled: [true],
      automation_reminder_24h_offset: [24],
      automation_reminder_1h_enabled: [true],
      automation_reminder_1h_offset: [1],
      automation_review_request_enabled: [true],
      automation_review_request_offset: [2]
    });
  }

  async ngOnInit() {
    await this.loadCatalog();
    this.loadSettings();
  }

  async loadCatalog() {
    try {
      const { data } = await this.simpleSupabase.getClient()
        .from('modules_catalog')
        .select('key, name:label')
        .order('key');

      this.agentModules = [
        { key: 'dashboard', label: 'Tablero (Dashboard)' },
        { key: 'clients', label: 'Clientes' }
      ];

      if (data) {
        data.forEach((m: any) => {
          if (m.key) {
            this.agentModules.push({ key: m.key, label: m.name });
          }
        });
      }

      this.agentModules.forEach(m => {
        this.settingsForm.addControl(`perm_${m.key}`, new FormControl(true));
      });

    } catch (e) {
      console.error('Error loading module catalog', e);
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
          ticket_client_view_estimated_hours: settings.ticket_client_view_estimated_hours ?? true,
          ticket_client_can_close: settings.ticket_client_can_close ?? true,
          ticket_client_can_create_devices: settings.ticket_client_can_create_devices ?? true,
          ticket_default_internal_comment: settings.ticket_default_internal_comment ?? false,
          ticket_auto_assign_on_reply: settings.ticket_auto_assign_on_reply ?? false
        });

        // Load Automation Rules (Safely fallback)
        const auto = settings.automation || {};
        this.settingsForm.patchValue({
          // Reminder 24h
          automation_reminder_24h_enabled: auto.reminder_24h?.enabled ?? true,
          automation_reminder_24h_offset: auto.reminder_24h?.offset_hours ?? 24,
          // Reminder 1h
          automation_reminder_1h_enabled: auto.reminder_1h?.enabled ?? true,
          automation_reminder_1h_offset: auto.reminder_1h?.offset_hours ?? 1,
          // Review Request
          automation_review_request_enabled: auto.review_request?.enabled ?? true,
          automation_review_request_offset: auto.review_request?.offset_hours ?? 2
        });

        const perms = settings.agent_module_access || [];
        const permPatch: Record<string, boolean> = {};
        this.agentModules.forEach(m => {
          permPatch[`perm_${m.key}`] = perms.includes(m.key);
          if (!settings.agent_module_access) {
            permPatch[`perm_${m.key}`] = true;
          }
        });
        this.settingsForm.patchValue(permPatch);

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

      const agent_module_access: string[] = [];
      this.agentModules.forEach(m => {
        if (formValue[`perm_${m.key}`]) {
          agent_module_access.push(m.key);
        }
      });

      const { ...cleanForm } = formValue;
      this.agentModules.forEach(m => delete cleanForm[`perm_${m.key}`]);

      // Extract Automation Settings
      const automation = {
        reminder_24h: {
          enabled: cleanForm.automation_reminder_24h_enabled,
          offset_hours: cleanForm.automation_reminder_24h_offset
        },
        reminder_1h: {
          enabled: cleanForm.automation_reminder_1h_enabled,
          offset_hours: cleanForm.automation_reminder_1h_offset
        },
        review_request: {
          enabled: cleanForm.automation_review_request_enabled,
          offset_hours: cleanForm.automation_review_request_offset
        }
      };

      // Remove flat keys from payload to avoid cluttering root settings (optional, but cleaner)
      delete cleanForm.automation_reminder_24h_enabled;
      delete cleanForm.automation_reminder_24h_offset;
      delete cleanForm.automation_reminder_1h_enabled;
      delete cleanForm.automation_reminder_1h_offset;
      delete cleanForm.automation_review_request_enabled;
      delete cleanForm.automation_review_request_offset;

      const payload = {
        ...cleanForm,
        agent_module_access,
        automation // Nested JSONB
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

