import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  FormControl,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { RouterLink } from '@angular/router';

import { BudgetNotificationSettingsService } from '../../../services/budget-notification-settings.service';
import { ToastService } from '../../../services/toast.service';
import { DevRoleService } from '../../../services/dev-role.service';
import {
  BudgetNotificationSettings,
  BudgetNotificationLocale,
} from '../../../models/recurring-budget.model';

interface CadenceOption {
  value: number;
  label: string;
  description: string;
}

@Component({
  selector: 'app-budget-notifications-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink],
  templateUrl: './budget-notifications-settings.component.html',
  styleUrl: './budget-notifications-settings.component.scss',
})
export class BudgetNotificationsSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private service = inject(BudgetNotificationSettingsService);
  public devRoleService = inject(DevRoleService);

  loading = signal(true);
  saving = signal(false);
  scanning = signal(false);
  settings = signal<BudgetNotificationSettings | null>(null);

  // Cadence options for the multi-select (chips)
  readonly REMINDER_OPTIONS: CadenceOption[] = [
    { value: 1,  label: 'T-1',  description: '1 día antes' },
    { value: 2,  label: 'T-2',  description: '2 días antes' },
    { value: 3,  label: 'T-3',  description: '3 días antes (recomendado)' },
    { value: 5,  label: 'T-5',  description: '5 días antes' },
    { value: 7,  label: 'T-7',  description: '1 semana antes' },
    { value: 14, label: 'T-14', description: '2 semanas antes' },
  ];

  readonly OVERDUE_OPTIONS: CadenceOption[] = [
    { value: 0,  label: 'Día 0',  description: 'El mismo día del vencimiento' },
    { value: 1,  label: 'D+1',    description: '1 día después' },
    { value: 3,  label: 'D+3',    description: '3 días después (recomendado)' },
    { value: 7,  label: 'D+7',    description: '1 semana después' },
    { value: 14, label: 'D+14',   description: '2 semanas después' },
    { value: 30, label: 'D+30',   description: '1 mes después' },
  ];

  readonly LOCALES: { value: BudgetNotificationLocale; label: string }[] = [
    { value: 'es', label: 'Castellano' },
    { value: 'ca', label: 'Català' },
    { value: 'en', label: 'English' },
  ];

  form: FormGroup = this.fb.group({
    email_enabled:       [true],
    inapp_on_create:     [true],
    inapp_on_reminder:   [true],
    inapp_on_overdue:    [true],
    email_on_create:     [true],
    email_on_reminder:   [true],
    email_on_overdue:    [true],
    reminder_days_before:[<number[]>[3]],
    overdue_days_after:  [<number[]>[0, 3]],
    locale:              ['es' as BudgetNotificationLocale, [Validators.required]],
  });

  // Helpers for the template
  reminderDays = computed(() => (this.form.get('reminder_days_before')?.value || []) as number[]);
  overdueDays  = computed(() => (this.form.get('overdue_days_after')?.value   || []) as number[]);

  // Counts for the preview footer
  remindersPerMonth = computed(() => this.reminderDays().length);
  overduePerMonth   = computed(() => this.overdueDays().length);

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const s = await this.service.getSettings();
      this.settings.set(s);
      this.form.patchValue({
        email_enabled:        s.email_enabled,
        inapp_on_create:      s.inapp_on_create,
        inapp_on_reminder:    s.inapp_on_reminder,
        inapp_on_overdue:     s.inapp_on_overdue,
        email_on_create:      s.email_on_create,
        email_on_reminder:    s.email_on_reminder,
        email_on_overdue:     s.email_on_overdue,
        reminder_days_before: s.reminder_days_before,
        overdue_days_after:   s.overdue_days_after,
        locale:               s.locale,
      }, { emitEvent: false });
    } catch (e) {
      console.error('Error loading settings', e);
      this.toast.error('Error', 'No se pudo cargar la configuración de notificaciones');
    } finally {
      this.loading.set(false);
    }
  }

  toggleReminderDay(day: number) {
    const current = new Set(this.reminderDays());
    if (current.has(day)) current.delete(day);
    else current.add(day);
    const sorted = Array.from(current).sort((a, b) => b - a);
    this.form.get('reminder_days_before')?.setValue(sorted);
    this.form.get('reminder_days_before')?.markAsDirty();
  }

  toggleOverdueDay(day: number) {
    const current = new Set(this.overdueDays());
    if (current.has(day)) current.delete(day);
    else current.add(day);
    const sorted = Array.from(current).sort((a, b) => a - b);
    this.form.get('overdue_days_after')?.setValue(sorted);
    this.form.get('overdue_days_after')?.markAsDirty();
  }

  isReminderSelected(day: number): boolean {
    return this.reminderDays().includes(day);
  }

  isOverdueSelected(day: number): boolean {
    return this.overdueDays().includes(day);
  }

  async save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const updated = await this.service.updateSettings(this.form.value);
      this.settings.set(updated);
    } catch (e) {
      // toast already shown by the service on error
      console.error('Error saving', e);
    } finally {
      this.saving.set(false);
    }
  }

  async triggerScan() {
    this.scanning.set(true);
    try {
      const result = await this.service.triggerReminderScan();
      this.toast.success(
        'Escaneo ejecutado',
        `Enviadas: ${result.succeeded} · Fallidas: ${result.failed} · Total: ${result.scanned}`,
      );
    } catch (e: any) {
      this.toast.error('Error al ejecutar el escaneo', e?.message || 'Error desconocido');
    } finally {
      this.scanning.set(false);
    }
  }

  reset() {
    this.form.patchValue({
      email_enabled:        true,
      inapp_on_create:      true,
      inapp_on_reminder:    true,
      inapp_on_overdue:     true,
      email_on_create:      true,
      email_on_reminder:    true,
      email_on_overdue:     true,
      reminder_days_before: [3],
      overdue_days_after:   [0, 3],
      locale:               'es',
    });
  }
}
