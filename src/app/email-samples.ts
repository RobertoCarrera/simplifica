/**
 * TypeScript mirror of `supabase/email-samples.json` — the 26-entry sample-data
 * fixture matrix used by the editor dialog's live preview and by the snapshot
 * harness for the SQL renderer.
 *
 * Source of truth for sample values:
 *   - Deno tests  : `supabase/functions/_shared/email-templates.test.ts`
 *   - SQL snapshot: `supabase/tests/snapshot_email_render.sql`
 *   - JSON fixture: `supabase/email-samples.json`
 *
 * Drift between the TS renderer (Deno) and the PL/pgSQL `email_render_template`
 * is detected by asserting identical `expected_substrings` per type.
 *
 * Why a hand-maintained mirror (not a generated artifact)?
 *   Zero HTTP round-trip at dialog open, no CLI tool to add to `package.json`,
 *   no `ngx-build-plus` config. Trade-off: drift risk vs JSON. The
 *   `Record<AllEmailType, ...>` exhaustiveness check below catches missing
 *   keys at compile time.
 *
 * TODO(PR3+): auto-generate from `supabase/email-samples.json` via build step.
 */
import { EmailType } from './models/company-email.models';

/**
 * The PR2a `EmailType` union (`company-email.models.ts`) carries the 20
 * stable EmailType members. The fixture matrix ships 6 additional entries
 * (`invite_marketer`, `google_review`, `budget_created`, `budget_reminder`,
 * `budget_overdue`, `booking_change`) — PR2b (T2b.3) expands the union to
 * all 26. Until that lands, this local widening captures the full key set
 * without touching the models module from PR2a.
 */
export type AllEmailType =
  | EmailType
  | 'invite_marketer'
  | 'google_review'
  | 'budget_created'
  | 'budget_reminder'
  | 'budget_overdue'
  | 'booking_change';

/** Per-type fixture entry. Mirrors the JSON `*.sample_data` / `expected_substrings`. */
export interface EmailSampleEntry {
  readonly sample_data: Readonly<Record<string, unknown>>;
  readonly expected_substrings: readonly string[];
}

/**
 * 26-entry matrix. The `Record<AllEmailType, EmailSampleEntry>` shape lets
 * TypeScript fail compilation if a new `AllEmailType` member is added
 * without a matching sample entry.
 */
export const EMAIL_SAMPLES: Readonly<Record<AllEmailType, EmailSampleEntry>> = {
  booking_confirmation: {
    sample_data: {
      servicio: 'Fisioterapia deportiva',
      fecha: '2026-07-10',
      hora: '16:30',
      empresa: 'Clínica Norte',
    },
    expected_substrings: [
      'Reserva confirmada',
      'Fisioterapia deportiva',
      '2026-07-10',
      '16:30',
      'política de privacidad',
      'Darse de baja',
    ],
  },
  invoice: {
    sample_data: {
      numero_factura: 'F-2026-0042',
      invoice_url: 'https://app.simplificacrm.es/invoices/abc123',
    },
    expected_substrings: [
      'Factura F-2026-0042',
      'Ver factura PDF',
      'https://app.simplificacrm.es/invoices/abc123',
      'política de privacidad',
    ],
  },
  quote: {
    sample_data: {
      numero_presupuesto: 'P-2026-0017',
      quote_url: 'https://app.simplificacrm.es/quotes/xyz789',
    },
    expected_substrings: [
      'Presupuesto P-2026-0017',
      'Ver presupuesto',
      'https://app.simplificacrm.es/quotes/xyz789',
      'política de privacidad',
    ],
  },
  consent: {
    sample_data: {
      consent_url: 'https://app.simplificacrm.es/consent/tk-9',
    },
    expected_substrings: [
      'Solicitud de consentimiento RGPD',
      'Revisar y validar datos',
      'https://app.simplificacrm.es/consent/tk-9',
      'política de privacidad',
    ],
  },
  invite: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/abc',
      inviter_name: 'Roberto',
      invited_name: 'Ada',
    },
    expected_substrings: [
      'Te han invitado a',
      'Roberto',
      'https://app.simplificacrm.es/invite/abc',
      'política de privacidad',
    ],
  },
  invite_owner: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/owner-1',
      inviter_name: 'Roberto',
      invited_name: 'Ada Lovelace',
      message: 'Bienvenida al equipo',
    },
    expected_substrings: [
      'Invitación para crear tu empresa',
      'Aceptar e introducir datos de empresa',
      'Roberto',
      'Bienvenida al equipo',
      'política de privacidad',
    ],
  },
  invite_admin: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/admin-1',
      inviter_name: 'Roberto',
      invited_name: 'Ada',
      role_label: 'Administrador',
    },
    expected_substrings: [
      'Te han invitado a',
      'Administrador',
      'Aceptar invitación',
      'https://app.simplificacrm.es/invite/admin-1',
      'política de privacidad',
    ],
  },
  invite_member: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/member-1',
      inviter_name: 'Roberto',
      invited_name: 'Ada',
    },
    expected_substrings: [
      'Te han invitado a',
      'Miembro',
      'Aceptar invitación',
      'https://app.simplificacrm.es/invite/member-1',
    ],
  },
  invite_professional: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/pro-1',
      inviter_name: 'Roberto',
      invited_name: 'Dra. Smith',
    },
    expected_substrings: [
      'Te han invitado a',
      'Profesional',
      'Aceptar invitación',
    ],
  },
  invite_agent: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/agent-1',
      inviter_name: 'Roberto',
      invited_name: 'Marcos',
    },
    expected_substrings: [
      'Te han invitado a',
      'Agente',
      'Aceptar invitación',
    ],
  },
  invite_marketer: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/mkt-1',
      inviter_name: 'Roberto',
      invited_name: 'Lucía',
    },
    expected_substrings: [
      'Te han invitado a',
      'Marketing',
      'Aceptar invitación',
    ],
  },
  invite_client: {
    sample_data: {
      invite_url: 'https://app.simplificacrm.es/invite/client-1',
      inviter_name: 'Roberto',
      invited_name: 'Cliente Demo',
    },
    expected_substrings: [
      'Te han invitado a',
      'portal de clientes',
      'Aceptar invitación',
      'https://app.simplificacrm.es/invite/client-1',
    ],
  },
  waitlist: {
    sample_data: {
      heading: '¡Estás en la lista!',
      body_text: 'Te avisaremos cuando puedas reservar.',
      waitlist_url: 'https://app.simplificacrm.es/waitlist/join',
    },
    expected_substrings: [
      'Estás en la lista',
      'Te avisaremos cuando puedas reservar',
      'Reservar ahora',
      'https://app.simplificacrm.es/waitlist/join',
    ],
  },
  inactive_notice: {
    sample_data: {
      client_names: ['Ana García', 'Luis Pérez', 'Marta Ruiz'],
    },
    expected_substrings: [
      'Clientes inactivos',
      'Ana García',
      'Luis Pérez',
      'Marta Ruiz',
      'Este es un mensaje automático',
    ],
  },
  generic: {
    sample_data: {
      message: 'Mensaje informativo para el cliente',
    },
    expected_substrings: [
      'Mensaje informativo para el cliente',
    ],
  },
  google_review: {
    sample_data: {
      client_name: 'Ana García',
      review_url: 'https://g.page/r/test/reviews',
    },
    expected_substrings: [
      'Gracias por tu visita, Ana García',
      'Dejar Google Review',
      'https://g.page/r/test/reviews',
    ],
  },
  booking_reminder: {
    sample_data: {
      message: 'Recordatorio de tu cita mañana',
    },
    expected_substrings: [
      'Recordatorio de tu cita mañana',
    ],
  },
  booking_cancellation: {
    sample_data: {
      message: 'Tu cita ha sido cancelada',
    },
    expected_substrings: [
      'Tu cita ha sido cancelada',
    ],
  },
  password_reset: {
    sample_data: {
      message: 'Restablece tu contraseña en https://app.simplificacrm.es/reset/abc-token',
    },
    expected_substrings: [
      'Restablece tu contraseña',
      'https://app.simplificacrm.es/reset/abc-token',
    ],
  },
  magic_link: {
    sample_data: {
      message: 'Tu enlace mágico: https://app.simplificacrm.es/magic/token-xyz',
    },
    expected_substrings: [
      'Tu enlace mágico',
      'https://app.simplificacrm.es/magic/token-xyz',
    ],
  },
  welcome: {
    sample_data: {
      user_name: 'Ada Lovelace',
      message: 'Bienvenida a Simplifica',
    },
    expected_substrings: [
      'Bienvenida a Simplifica',
    ],
  },
  staff_credentials: {
    sample_data: {
      user_name: 'Roberto',
      temp_password: 'Tmp#2026-xyz',
      message: 'Tus credenciales temporales',
    },
    expected_substrings: [
      'Tus credenciales temporales',
    ],
  },
  budget_created: {
    sample_data: {
      period_label: 'Julio 2026',
      total_formatted: '1.250,00 €',
      client_name: 'Ana García',
      payment_url: 'https://app.simplificacrm.es/pay/b-1',
      cta_text: 'Ver presupuesto',
    },
    expected_substrings: [
      'Nuevo presupuesto',
      'Julio 2026',
      '1.250,00',
      'Ana García',
      'https://app.simplificacrm.es/pay/b-1',
    ],
  },
  budget_reminder: {
    sample_data: {
      period_label: 'Julio 2026',
      total_formatted: '1.250,00 €',
      client_name: 'Ana García',
      payment_url: 'https://app.simplificacrm.es/pay/b-2',
      due_date_formatted: '15/07/2026',
      days_to_due: 3,
      intro: 'Tu presupuesto vence pronto.',
    },
    expected_substrings: [
      'Tu presupuesto vence pronto',
      '1.250,00',
      '15/07/2026',
      'Vence en 3 días',
      'https://app.simplificacrm.es/pay/b-2',
    ],
  },
  budget_overdue: {
    sample_data: {
      period_label: 'Junio 2026',
      total_formatted: '980,00 €',
      client_name: 'Luis Pérez',
      payment_url: 'https://app.simplificacrm.es/pay/b-3',
      due_date_formatted: '01/07/2026',
      days_to_due: -5,
      intro: 'Tu presupuesto ha vencido y aún no hemos recibido el pago.',
    },
    expected_substrings: [
      'Presupuesto vencido',
      '980,00',
      '01/07/2026',
      'Vencido hace 5 días',
      'https://app.simplificacrm.es/pay/b-3',
    ],
  },
  booking_change: {
    sample_data: {
      change_type: 'rescheduled',
      audience: 'client',
      audience_name: 'Ana García',
      service_name: 'Fisioterapia deportiva',
      starts_at: '2026-07-10 16:30',
      previous_starts_at: '2026-07-09 10:00',
      booking_url: 'https://app.simplificacrm.es/bookings/bk-1',
    },
    expected_substrings: [
      'reserva se ha reprogramado',
      'Fisioterapia deportiva',
      'Ana García',
      'Anterior: 2026-07-09 10:00',
      'https://app.simplificacrm.es/bookings/bk-1',
    ],
  },
};
