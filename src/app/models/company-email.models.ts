export interface CompanyEmailAccount {
  id: string;
  company_id: string;
  email: string;
  display_name: string;
  provider: 'ses';
  ses_from_email: string;
  ses_iam_role_arn: string;
  is_verified: boolean;
  verified_at: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyEmailSetting {
  id: string;
  company_id: string;
  email_type: EmailType;
  email_account_id: string;
  is_active: boolean;
  custom_subject_template: string;
  custom_body_template: string;
}

export type EmailType =
  | 'booking_confirmation'
  | 'invoice'
  | 'quote'
  | 'consent'
  | 'invite'
  | 'waitlist'
  | 'inactive_notice'
  | 'generic';

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  booking_confirmation: 'Confirmación de reserva',
  invoice: 'Factura',
  quote: 'Presupuesto',
  consent: 'Consentimiento',
  invite: 'Invitación',
  waitlist: 'Lista de espera',
  inactive_notice: 'Aviso de inactividad',
  generic: 'Genérico',
};

export interface CompanyEmailLog {
  id: string;
  company_id: string;
  email_account_id: string;
  email_type: string;
  to_address: string;
  subject: string;
  status: 'sent' | 'failed' | 'bounced' | 'complained';
  message_id: string;
  error_message: string | null;
  sent_at: string;
}

export interface VerificationResult {
  spf: { status: string; dns_record?: string };
  dkim: { status: string; dns_record?: string };
  dmarc: { status: string; dns_record?: string };
}

export interface EmailLogFilters {
  start_date?: string;
  end_date?: string;
  status?: CompanyEmailLog['status'];
  email_type?: EmailType;
  page?: number;
  page_size?: number;
}

export interface CreateEmailAccountDto {
  email: string;
  display_name: string;
  ses_from_email: string;
  ses_iam_role_arn: string;
}

export interface UpdateEmailAccountDto {
  email?: string;
  display_name?: string;
  ses_from_email?: string;
  ses_iam_role_arn?: string;
  is_active?: boolean;
  is_primary?: boolean;
}

/** Email-specific branding settings stored in companies.settings.email_branding */
export interface EmailBrandingSettings {
  background_color: string;   // e.g. '#F9FAFB' — wrapper background
  font_family: string;        // e.g. 'Arial' — web-safe font
  footer_text: string | null; // custom footer/signature text
}

export const DEFAULT_EMAIL_BRANDING: EmailBrandingSettings = {
  background_color: '#F9FAFB',
  font_family: 'Arial',
  footer_text: null,
};

export const EMAIL_FONT_OPTIONS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica, Arial', label: 'Helvetica' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma, Geneva', label: 'Tahoma' },
  { value: 'Times New Roman', label: 'Times New Roman' },
];
