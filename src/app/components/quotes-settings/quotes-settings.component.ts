import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../services/toast.service';
import { SupabaseSettingsService, AppSettings, CompanySettings, ConvertPolicy } from '../../services/supabase-settings.service';
import { DevRoleService } from '../../services/dev-role.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-quotes-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './quotes-settings.component.html',
  styleUrl: './quotes-settings.component.scss'
})
export class QuotesSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private settingsService = inject(SupabaseSettingsService);
  public devRoleService = inject(DevRoleService);

  // Forms
  appSettingsForm: FormGroup;
  companySettingsForm: FormGroup;

  // State
  loading = signal(false);
  savingApp = signal(false);
  savingCompany = signal(false);

  // Policy options for dropdown
  policyOptions = [
    { value: 'manual', label: 'Manual (solo bajo demanda)', description: 'El usuario convierte manualmente cada presupuesto aceptado en factura' },
    { value: 'automatic', label: 'Automática al aceptar', description: 'Al aceptar un presupuesto, se convierte automáticamente en factura' },
    { value: 'scheduled', label: 'Programada (en fecha/plazo)', description: 'La factura se generará automáticamente en la fecha indicada' }
  ];

  constructor() {
    // App settings form (global - only for devs)
    this.appSettingsForm = this.fb.group({
      default_convert_policy: ['manual', [Validators.required]],
      enforce_globally: [false],
      default_invoice_delay_days: [null],
      default_auto_send_quote_email: [false], // New setting
      // Global tax defaults
      default_prices_include_tax: [false],
      default_iva_enabled: [true],
      default_iva_rate: [21, [Validators.min(0), Validators.max(100)]],
      default_irpf_enabled: [false],
      default_irpf_rate: [15, [Validators.min(0), Validators.max(100)]]
    });

    // Company settings form
    this.companySettingsForm = this.fb.group({
      convert_policy: [null],
      enforce_company_defaults: [false],
      default_invoice_delay_days: [null],
      auto_send_quote_email: [null], // New setting
      invoice_on_date: [null],
      deposit_percentage: [null, [Validators.min(0), Validators.max(100)]],
      // Company tax overrides
      prices_include_tax: [null],
      iva_enabled: [null],
      iva_rate: [null, [Validators.min(0), Validators.max(100)]],
      irpf_enabled: [null],
      irpf_rate: [null, [Validators.min(0), Validators.max(100)]]
    });
  }

  ngOnInit() {
    this.loadSettings();
  }

  async loadSettings() {
    this.loading.set(true);
    try {
      const [appSettings, companySettings] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings())
      ]);

      if (appSettings) {
        this.appSettingsForm.patchValue({
          default_convert_policy: appSettings.default_convert_policy || 'manual',
          enforce_globally: appSettings.enforce_globally ?? false,
          default_invoice_delay_days: appSettings.default_invoice_delay_days ?? null,
          default_auto_send_quote_email: appSettings.default_auto_send_quote_email ?? false,
          default_prices_include_tax: appSettings.default_prices_include_tax ?? false,
          default_iva_enabled: appSettings.default_iva_enabled ?? true,
          default_iva_rate: appSettings.default_iva_rate ?? 21,
          default_irpf_enabled: appSettings.default_irpf_enabled ?? false,
          default_irpf_rate: appSettings.default_irpf_rate ?? 15
        });
      }

      if (companySettings) {
        this.companySettingsForm.patchValue({
          convert_policy: companySettings.convert_policy ?? null,
          enforce_company_defaults: companySettings.enforce_company_defaults ?? false,
          default_invoice_delay_days: companySettings.default_invoice_delay_days ?? null,
          auto_send_quote_email: companySettings.auto_send_quote_email ?? null,
          invoice_on_date: companySettings.invoice_on_date ?? null,
          deposit_percentage: companySettings.deposit_percentage ?? null,
          prices_include_tax: companySettings.prices_include_tax ?? null,
          iva_enabled: companySettings.iva_enabled ?? null,
          iva_rate: companySettings.iva_rate ?? null,
          irpf_enabled: companySettings.irpf_enabled ?? null,
          irpf_rate: companySettings.irpf_rate ?? null
        });
      }
    } catch (err: any) {
      console.error('Error loading settings:', err);
      this.toast.error('Error', 'No se pudieron cargar los ajustes');
    } finally {
      this.loading.set(false);
    }
  }

  async saveAppSettings() {
    if (this.appSettingsForm.invalid) return;
    this.savingApp.set(true);
    try {
      await firstValueFrom(this.settingsService.upsertAppSettings(this.appSettingsForm.value));
      this.toast.success('Guardado', 'Ajustes globales actualizados');
    } catch (err: any) {
      console.error('Error saving app settings:', err);
      this.toast.error('Error', err?.message || 'No se pudieron guardar los ajustes globales');
    } finally {
      this.savingApp.set(false);
    }
  }

  async saveCompanySettings() {
    if (this.companySettingsForm.invalid) return;
    this.savingCompany.set(true);
    try {
      await firstValueFrom(this.settingsService.upsertCompanySettings(this.companySettingsForm.value));
      this.toast.success('Guardado', 'Ajustes de empresa actualizados');
    } catch (err: any) {
      console.error('Error saving company settings:', err);
      this.toast.error('Error', err?.message || 'No se pudieron guardar los ajustes de empresa');
    } finally {
      this.savingCompany.set(false);
    }
  }

  getPolicyDescription(value: string | null): string {
    if (!value) return 'Se usará la configuración global';
    const opt = this.policyOptions.find(p => p.value === value);
    return opt?.description || '';
  }
}
