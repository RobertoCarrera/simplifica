import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CompanyEmailService } from '../../../services/company-email.service';
import { ToastService } from '../../../services/toast.service';
import {
  CompanyEmailAccount,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
} from '../../../models/company-email.models';

@Component({
  selector: 'app-email-account-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './email-account-form.component.html',
  styleUrls: ['./email-account-form.component.scss'],
})
export class EmailAccountFormComponent implements OnInit {
  @Input() account: CompanyEmailAccount | null = null;
  @Input() companyId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<CompanyEmailAccount>();

  private emailService = inject(CompanyEmailService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  form!: FormGroup;
  saving = false;
  isEditing = false;

  ngOnInit() {
    this.isEditing = !!this.account;

    this.form = this.fb.group({
      email: [
        this.account?.email || '',
        [Validators.required, Validators.email],
      ],
      display_name: [
        this.account?.display_name || '',
        [Validators.required, Validators.maxLength(100)],
      ],
      ses_from_email: [
        this.account?.ses_from_email || '',
        [Validators.required, Validators.email],
      ],
      ses_iam_role_arn: [
        this.account?.ses_iam_role_arn || '',
        [Validators.required],
      ],
    });
  }

  async onSubmit() {
    if (!this.form.valid || !this.companyId) return;

    this.saving = true;
    try {
      const formValue = this.form.value;

      if (this.isEditing && this.account) {
        // Update existing account
        const updates: UpdateEmailAccountDto = {
          email: formValue.email,
          display_name: formValue.display_name,
          ses_from_email: formValue.ses_from_email,
          ses_iam_role_arn: formValue.ses_iam_role_arn,
        };

        const updated = await firstValueFrom(
          this.emailService.updateAccount(this.account.id, updates)
        );
        this.toast.success('Éxito', 'Cuenta actualizada correctamente');
        this.saved.emit(updated);
      } else {
        // Create new account
        const newAccount: CreateEmailAccountDto = {
          email: formValue.email,
          display_name: formValue.display_name,
          ses_from_email: formValue.ses_from_email,
          ses_iam_role_arn: formValue.ses_iam_role_arn,
        };

        const created = await firstValueFrom(
          this.emailService.createAccount(newAccount)
        );
        this.toast.success('Éxito', 'Cuenta creada correctamente');
        this.saved.emit(created);
      }
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo guardar la cuenta');
      console.error(err);
    } finally {
      this.saving = false;
    }
  }

  onClose() {
    this.close.emit();
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }
}
