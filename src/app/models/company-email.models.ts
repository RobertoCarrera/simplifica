export interface CompanyEmailAccount {
  id: string;
  company_id: string;
  email: string;
  display_name: string;
  provider: 'ses';
  provider_type?: 'ses_iam' | 'ses_shared' | 'google_workspace';
  ses_from_email: string;
  ses_iam_role_arn: string | null;
  iam_user_arn?: string | null;
  iam_access_key_id?: string | null;
  is_verified: boolean;
  verified_at: string | null;
  is_active: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  // SMTP / Google Workspace
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_encrypted_password?: string | null;
  // Provisioning fields for SES + Route53 auto-verification
  dkim_tokens?: string[];
  route53_zone_id?: string;
  verification_status?: 'pending' | 'verifying' | 'verified' | 'failed';
  verified_error?: string;
}

export interface CompanyEmailSetting {
  id: string;
  company_id: string;
  email_type: EmailType;
  email_account_id: string;
  is_active: boolean;
  custom_subject_template: string;
  custom_body_template: string;
  custom_header_template: string | null;
  custom_button_text: string | null;
}

export type EmailType =
  | 'booking_confirmation'
  | 'invoice'
  | 'quote'
  | 'consent'
  | 'invite'
  | 'invite_owner'
  | 'invite_admin'
  | 'invite_member'
  | 'invite_professional'
  | 'invite_agent'
  | 'invite_client'
  | 'waitlist'
  | 'inactive_notice'
  | 'generic'
  | 'booking_reminder'
  | 'booking_cancellation'
  | 'password_reset'
  | 'magic_link'
  | 'welcome'
  | 'staff_credentials';

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  booking_confirmation: 'Confirmación de reserva',
  invoice: 'Factura',
  quote: 'Presupuesto',
  consent: 'Consentimiento',
  invite: 'Invitación genérica',
  invite_owner: 'Invitación — Propietario',
  invite_admin: 'Invitación — Administrador',
  invite_member: 'Invitación — Miembro',
  invite_professional: 'Invitación — Profesional',
  invite_agent: 'Invitación — Agente',
  invite_client: 'Invitación — Cliente',
  waitlist: 'Lista de espera',
  inactive_notice: 'Aviso de inactividad',
  generic: 'Genérico',
  booking_reminder: 'Recordatorio de reserva',
  booking_cancellation: 'Cancelación de reserva',
  password_reset: 'Restablecer contraseña',
  magic_link: 'Enlace mágico',
  welcome: 'Bienvenida',
  staff_credentials: 'Credenciales de acceso',
};

export const EMAIL_TYPE_DESCRIPTIONS: Record<EmailType, string> = {
  booking_confirmation: 'Se envía automáticamente cuando un cliente confirma una reserva desde la agenda pública. Incluye fecha, hora y datos del servicio.',
  invoice: 'Se envía cuando se genera una factura para un cliente. Contiene el número de factura y un enlace para ver/descargar el PDF.',
  quote: 'Se envía cuando se crea un presupuesto para un cliente. Incluye el número de presupuesto y un enlace para verlo.',
  consent: 'Se envía cuando se necesita el consentimiento RGPD de un contacto. El destinatario debe revisar y aceptar el tratamiento de sus datos.',
  invite: 'Se envía cuando se invita a alguien a la plataforma sin especificar rol. Incluye un enlace para aceptar la invitación.',
  invite_owner: 'Se envía cuando se invita a alguien a ser propietario de la empresa. Es el primer paso para crear una empresa en Simplifica.',
  invite_admin: 'Se envía cuando se invita a alguien como administrador de la empresa. Le da acceso completo al panel de gestión.',
  invite_member: 'Se envía cuando se invita a alguien como miembro del equipo. Acceso al panel según sus permisos asignados.',
  invite_professional: 'Se envía cuando se invita a un profesional externo (peluquero, fisioterapeuta, etc.) a la plataforma.',
  invite_agent: 'Se envía cuando se invita a un agente comercial a la plataforma para gestionar clientes y reservas.',
  invite_client: 'Se envía cuando se invita a un cliente final al portal. Podrá acceder a sus reservas, facturas y documentos.',
  waitlist: 'Se envía cuando alguien se registra en la lista de espera de un servicio completo. Confirma que su plaza está reservada.',
  inactive_notice: 'Se envía periódicamente al propietario cuando hay clientes sin actividad reciente (sin reservas en los últimos 30 días).',
  generic: 'Se usa como plantilla base para cualquier email genérico que no corresponda a los tipos específicos anteriores.',
  booking_reminder: 'Se envía automáticamente 24h antes de una reserva confirmada como recordatorio para el cliente.',
  booking_cancellation: 'Se envía cuando se cancela una reserva, tanto al cliente como al profesional implicado.',
  password_reset: 'Se envía cuando un usuario solicita restablecer su contraseña. Contiene un enlace mágico de un solo uso.',
  magic_link: 'Se envía cuando un usuario inicia sesión con enlace mágico (sin contraseña). Enlace válido para un solo uso.',
  welcome: 'Se envía cuando un nuevo usuario accede por primera vez a la plataforma después de crear sus credenciales.',
  staff_credentials: 'Se envía cuando se crean nuevas credenciales de acceso para un miembro del equipo (antes de welcome).',
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
  /** Domain for sending email, e.g. "peluqueria-juan.com". ses_from_email becomes "noreply@{domain}" */
  domain: string;
  display_name: string;
  /** Provider type: 'ses_shared' (default/gratis), 'ses_iam' (AWS dedicado), 'google_workspace' (SMTP de Google) */
  provider_type?: 'ses_iam' | 'ses_shared' | 'google_workspace';
  // Google Workspace SMTP fields (required when provider_type is 'google_workspace')
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
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

export interface Route53Domain {
  name: string;
  zoneId: string;
}
