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
