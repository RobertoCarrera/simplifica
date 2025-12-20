import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { SupabaseSettingsService } from '../../services/supabase-settings.service';
import { firstValueFrom } from 'rxjs';
import { SupabaseTicketsService, TicketStage } from '../../services/supabase-tickets.service';
import { AuthService } from '../../services/auth.service';

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

  settingsForm: FormGroup;
  loading = signal(false);
  saving = signal(false);
  stages = signal<TicketStage[]>([]);

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

  ngOnInit() {
    this.loadSettings();
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
      await firstValueFrom(this.settingsService.updateCompanySettings(formValue));
      this.toast.success('Guardado', 'Ajustes guardados correctamente');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.toast.error('Error', 'Error al guardar los ajustes');
    } finally {
      this.saving.set(false);
    }
  }
}
