import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { SupabaseSettingsService } from '../../services/supabase-settings.service';
import { firstValueFrom } from 'rxjs';

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

  settingsForm: FormGroup;
  loading = signal(false);
  saving = signal(false);

  constructor() {
    this.settingsForm = this.fb.group({
      auto_send_quote_email: [false],
      allow_direct_contracting: [false],
      copy_features_between_variants: [false]
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
          copy_features_between_variants: settings.copy_features_between_variants ?? false
        });
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
