/**
 * Catalog of `{{var}}` interpolation tokens available per email type.
 *
 * The variables listed here mirror the renderers in
 * `supabase/functions/_shared/email-templates.ts` — the `RENDERERS`
 * registry there composes one HTML template per `EmailType` from the
 * fields on `TemplateData`. Each `{{var}}` token that an end user is
 * allowed to author in a custom body / button URL must appear in this
 * catalog so the Variables panel in the block editor can expose it.
 *
 * Why a hand-maintained TypeScript file (not a JSON mirror)?
 *   - The `Record<AllEmailType, readonly EmailVariable[]>` shape forces
 *     the compiler to fail if a new email type is added without an
 *     entry. Same exhaustiveness guarantee as `EMAIL_SAMPLES`.
 *   - Spanish-language descriptions travel inline with the catalog so
 *     the panel UI and the catalog never drift (the panel just reads
 *     `description` and `example` fields).
 *   - No build step / no codegen — adding a token is a 3-line edit.
 *
 * Drift detection: this catalog is consumed by the variables panel
 * rendered in the block editor. The RPC preview pipeline
 * (`previewTemplate`) receives the same `{{var}}` literals that the
 * panel produces — when a renderer references a `data.X` field that
 * is NOT in this catalog, the user can still author it, but the panel
 * won't suggest it. The opposite (catalog has a token the renderer
 * never uses) means the panel would show a ghost; harden against that
 * by cross-checking against `renderTemplate` per type.
 *
 * The keys use `AllEmailType` (the 26-entry union from
 * `src/app/email-samples.ts`) rather than `EmailType` (the 20-entry
 * union in `src/app/models/company-email.models.ts`). This is the
 * same pattern email-settings.component.ts uses — it lets the catalog
 * cover every renderer without forcing a model expansion.
 */
import type { AllEmailType } from '../../../../../email-samples';

/** A single `{{var}}` token the panel can insert at the cursor. */
export interface EmailVariable {
  /** The token name WITHOUT the surrounding `{{` / `}}` braces.
   *  Example: 'invite_url' (NOT '{{invite_url}}'). */
  readonly name: string;
  /** Human-facing description in Spanish (primary app language).
   *  Surfaces in the variables panel below the token name. */
  readonly description: string;
  /** Optional illustrative value, shown muted under the description.
   *  Used to teach the user what kind of value the token holds. */
  readonly example?: string;
}

/**
 * Per-type catalog. `Record<AllEmailType, ...>` is the exhaustiveness
 * guarantee — adding a new member to `AllEmailType` without an entry
 * here is a compile-time error.
 *
 * Source of truth: each entry lists every `{{var}}` token its renderer
 * interpolates from `TemplateData`. Cross-reference:
 *   - booking_confirmation → renderBookingConfirmation (servicio, fecha, hora, empresa)
 *   - invoice              → renderInvoice (numero_factura, invoice_url)
 *   - quote                → renderQuote (numero_presupuesto, quote_url)
 *   - consent              → renderConsent (consent_url)
 *   - invite               → renderInviteInternal / renderInviteGeneric
 *   - invite_owner         → renderInviteInternal / renderInviteOwner
 *   - invite_admin, invite_member, invite_professional, invite_agent,
 *     invite_marketer, invite_client → renderInviteRoleInternal
 *   - waitlist             → renderWaitlist (heading, body_text, waitlist_url)
 *   - inactive_notice      → renderInactiveNotice (client_names)
 *   - generic              → renderGeneric (message)
 *   - google_review        → renderGoogleReview (client_name, review_url)
 *   - booking_reminder, booking_cancellation, password_reset, magic_link,
 *     welcome, staff_credentials → renderGeneric (message)
 *   - budget_created       → renderBudgetInternal (intro, period_label, total_formatted, payment_url, cta_text)
 *   - budget_reminder      → renderBudgetInternal (+ due_date_formatted)
 *   - budget_overdue       → renderBudgetInternal (+ due_date_formatted)
 *   - booking_change       → renderBookingChange (service_name, starts_at, booking_url)
 */
export const EMAIL_VARIABLES: Readonly<Record<AllEmailType, readonly EmailVariable[]>> = {
  booking_confirmation: [
    { name: 'servicio', description: 'Nombre del servicio reservado', example: 'Fisioterapia deportiva' },
    { name: 'fecha',    description: 'Fecha de la reserva', example: '2026-07-10' },
    { name: 'hora',     description: 'Hora de la reserva', example: '16:30' },
    { name: 'empresa',  description: 'Nombre de la empresa que ofrece el servicio', example: 'Clínica Norte' },
  ],

  invoice: [
    { name: 'numero_factura', description: 'Número de factura', example: 'F-2026-0042' },
    { name: 'invoice_url',    description: 'URL para ver/descargar la factura', example: 'https://app.simplificacrm.es/invoices/abc' },
  ],

  quote: [
    { name: 'numero_presupuesto', description: 'Número de presupuesto', example: 'P-2026-0001' },
    { name: 'quote_url',          description: 'URL para ver/aceptar el presupuesto' },
  ],

  consent: [
    { name: 'consent_url', description: 'URL donde el cliente revisa y firma el consentimiento RGPD' },
  ],

  invite: [
    { name: 'invite_url',   description: 'URL que el invitado debe abrir para aceptar', example: 'https://app.simplificacrm.es/invite/abc' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación', example: 'Roberto' },
    { name: 'message',      description: 'Mensaje personal opcional del invitador' },
  ],

  invite_owner: [
    { name: 'invite_url',   description: 'URL que el destinatario debe abrir para crear la empresa' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'invited_name', description: 'Nombre del invitado' },
  ],

  invite_admin: [
    { name: 'invite_url',   description: 'URL para aceptar la invitación como administrador' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'message',      description: 'Mensaje personal opcional' },
  ],

  invite_member: [
    { name: 'invite_url',   description: 'URL para aceptar la invitación como miembro' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'message',      description: 'Mensaje personal opcional' },
  ],

  invite_professional: [
    { name: 'invite_url',   description: 'URL para aceptar la invitación como profesional' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'message',      description: 'Mensaje personal opcional' },
  ],

  invite_agent: [
    { name: 'invite_url',   description: 'URL para aceptar la invitación como agente' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'message',      description: 'Mensaje personal opcional' },
  ],

  invite_marketer: [
    { name: 'invite_url',   description: 'URL para aceptar la invitación como marketing' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'message',      description: 'Mensaje personal opcional' },
  ],

  invite_client: [
    { name: 'invite_url',   description: 'URL para aceptar la invitación como cliente' },
    { name: 'inviter_name', description: 'Nombre de quien envía la invitación' },
    { name: 'message',      description: 'Mensaje personal opcional' },
  ],

  waitlist: [
    { name: 'heading',      description: 'Título de la notificación de lista de espera' },
    { name: 'body_text',    description: 'Cuerpo del mensaje de lista de espera' },
    { name: 'waitlist_url', description: 'URL para que el cliente reserve cuando esté disponible' },
  ],

  inactive_notice: [
    { name: 'client_names', description: 'Lista de nombres de clientes inactivos (array)' },
  ],

  generic: [
    { name: 'message', description: 'Cuerpo del mensaje personalizado' },
  ],

  google_review: [
    { name: 'client_name', description: 'Nombre del cliente que dejó la reseña', example: 'Ada Lovelace' },
    { name: 'review_url',  description: 'URL donde el cliente deja la reseña en Google' },
  ],

  booking_reminder: [
    { name: 'message', description: 'Mensaje del recordatorio de cita' },
  ],

  booking_cancellation: [
    { name: 'message', description: 'Mensaje de la cancelación de cita' },
  ],

  password_reset: [
    { name: 'message', description: 'Mensaje del reseteo de contraseña' },
  ],

  magic_link: [
    { name: 'message', description: 'Mensaje del magic link' },
  ],

  welcome: [
    { name: 'message', description: 'Mensaje de bienvenida' },
  ],

  staff_credentials: [
    { name: 'message', description: 'Mensaje de credenciales' },
  ],

  budget_created: [
    { name: 'intro',             description: 'Introducción del email de presupuesto creado' },
    { name: 'period_label',      description: 'Etiqueta del periodo (ej. "Julio 2026")' },
    { name: 'total_formatted',   description: 'Total formateado con moneda', example: '125,00 €' },
    { name: 'payment_url',       description: 'URL para que el cliente pague' },
    { name: 'cta_text',          description: 'Texto del botón de acción' },
  ],

  budget_reminder: [
    { name: 'intro',              description: 'Introducción del recordatorio' },
    { name: 'period_label',       description: 'Etiqueta del periodo' },
    { name: 'due_date_formatted', description: 'Fecha de vencimiento formateada', example: '15 de julio' },
    { name: 'total_formatted',    description: 'Total formateado con moneda' },
    { name: 'payment_url',        description: 'URL de pago' },
    { name: 'cta_text',           description: 'Texto del botón de acción' },
  ],

  budget_overdue: [
    { name: 'intro',              description: 'Introducción del aviso de vencimiento' },
    { name: 'period_label',       description: 'Periodo vencido' },
    { name: 'due_date_formatted', description: 'Fecha de vencimiento' },
    { name: 'total_formatted',    description: 'Total vencido' },
    { name: 'payment_url',        description: 'URL de pago' },
    { name: 'cta_text',           description: 'Texto del botón' },
  ],

  booking_change: [
    { name: 'service_name', description: 'Nombre del servicio cuya reserva cambió', example: 'Fisioterapia' },
    { name: 'starts_at',    description: 'Nueva fecha/hora de la reserva', example: '2026-07-10 16:30' },
    { name: 'booking_url',  description: 'URL para ver los detalles de la reserva' },
  ],
};
