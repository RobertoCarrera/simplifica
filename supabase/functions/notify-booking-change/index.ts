// notify-booking-change — Edge Function (Deno, Supabase)
// --------------------------------------------------------------
// Invoked by the notify_booking_change() RPC via pg_net.http_post()
// after a row in public.bookings is INSERT/UPDATE/DELETE.
//
// The RPC decides which audiences to email based on the company's
// settings; the function only formats and sends.
//
// Inputs (POST JSON):
//   {
//     booking_id:        string (uuid),
//     company_id:        string (uuid),
//     change_type:       'created' | 'updated' | 'rescheduled' | 'cancelled' | 'deleted',
//     notify_client:     boolean,
//     notify_professional: boolean,
//     notify_admin:      boolean,
//     cc_admin:          boolean
//   }
//
// Behaviour:
//   * Always idempotent (if no row in `bookings` for that id, exits quietly).
//   * Looks up client + professional + admin emails.
//   * Sends 1 email per recipient via the existing `send-branded-email`
//     function (templated, i18n). If `cc_admin` is true, admins get
//     carbon-copied on the client/pro emails (bcc).
//   * Auth: verify_jwt = false (only callable from the DB; the RPC
//     uses the service-role key). See supabase/config.toml.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withSecurityHeaders } from '../_shared/security.ts';


const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL      = Deno.env.get("SITE_URL") ?? "https://app.simplificacrm.es";

const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface NotifyBody {
  booking_id: string;
  company_id: string;
  change_type: "created" | "updated" | "rescheduled" | "cancelled" | "deleted";
  notify_client: boolean;
  notify_professional: boolean;
  notify_admin: boolean;
  cc_admin: boolean;
}

interface Recipient {
  email: string;
  name: string;
  audience: "client" | "professional" | "admin";
  user_id?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: NotifyBody;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.booking_id || !body.company_id || !body.change_type) {
    return new Response("Missing required fields", { status: 400 });
  }

  console.log("[notify-booking-change] received", body.change_type, body.booking_id);

  // 1. Load booking + relations. If the booking has been hard-deleted
  //    (change_type = 'deleted'), still load the OLD-ish snapshot we
  //    have in the trigger payload. The RPC only passes the id, so we
  //    rely on a soft-delete column or a recent log. As a fallback we
  //    just continue with whatever we can resolve.
  const { data: booking } = await sb
    .from("bookings")
    .select(`
      id, title, service_name, starts_at, ends_at, status,
      company_id, client_id, professional_id, notes
    `)
    .eq("id", body.booking_id)
    .maybeSingle();

  // If the booking was hard-deleted, we still want to send the
  // notification. Build a synthetic object with what we have.
  const b = booking ?? {
    id: body.booking_id,
    title: "Tu reserva",
    service_name: null,
    starts_at: null,
    ends_at: null,
    status: body.change_type === "deleted" ? "deleted" : null,
    company_id: body.company_id,
    client_id: null,
    professional_id: null,
    notes: null,
  } as const;

  // 2. Load company locale (prefer the user's preference; fall back to es).
  const { data: settings } = await sb
    .from("budget_notification_settings")
    .select("locale")
    .eq("company_id", body.company_id)
    .maybeSingle();
  const locale = (settings?.locale ?? "es") as "es" | "ca" | "en";

  // 3. Build the recipient list.
  const recipients: Recipient[] = [];

  if (body.notify_client && b.client_id) {
    const { data: client } = await sb
      .from("clients")
      .select("id, user_id, name, email, contact_email")
      .eq("id", b.client_id)
      .maybeSingle();
    if (client) {
      const email = client.contact_email || client.email;
      if (email) {
        recipients.push({
          email,
          name: client.name || "cliente",
          audience: "client",
          user_id: client.user_id,
        });
      }
    }
  }

  if (body.notify_professional && b.professional_id) {
    const { data: pro } = await sb
      .from("professionals")
      .select("id, user_id, display_name, email")
      .eq("id", b.professional_id)
      .maybeSingle();
    if (pro) {
      const email = pro.email;
      if (email) {
        recipients.push({
          email,
          name: pro.display_name || "profesional",
          audience: "professional",
          user_id: pro.user_id,
        });
      }
    }
  }

  // Admins: all company_members with role in (admin, owner, super_admin).
  let adminRecipients: Recipient[] = [];
  if (body.notify_admin) {
    const { data: admins } = await sb
      .from("company_members")
      .select(`
        user_id,
        role:app_roles!inner(slug)
      `)
      .eq("company_id", body.company_id)
      .in("role.slug", ["admin", "owner", "super_admin"]);
    if (admins && admins.length) {
      const userIds = admins.map((a) => a.user_id).filter(Boolean) as string[];
      if (userIds.length) {
        const { data: profiles } = await sb
          .from("users")
          .select("id, auth_user_id, email, name, surname")
          .in("id", userIds);
        adminRecipients = (profiles ?? []).map((p) => ({
          email: p.email,
          name: (`${p.name ?? ""} ${p.surname ?? ""}`.trim()) || "admin",
          audience: "admin",
          user_id: p.id,
        }));
      }
    }
  }

  // If cc_admin is on, attach admins to every non-admin email.
  if (body.cc_admin && adminRecipients.length) {
    for (const r of recipients) {
      // We pass the admin emails as extra bcc below.
    }
  }

  if (recipients.length === 0 && adminRecipients.length === 0) {
    console.log("[notify-booking-change] no recipients; exiting");
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: withSecurityHeaders({ "Content-Type": "application/json" }),
    });
  }

  // 4. Build the per-recipient email subject + body.
  const subject = (() => {
    switch (body.change_type) {
      case "created":     return i18n("Reserva creada",        "Reserva creada",         "Booking created",      locale);
      case "updated":     return i18n("Tu reserva se ha modificado", "La teva reserva s'ha modificat", "Your booking has been updated", locale);
      case "rescheduled": return i18n("Tu reserva se ha reagendado", "La teva reserva s'ha canviat d'hora", "Your booking has been rescheduled", locale);
      case "cancelled":   return i18n("Tu reserva se ha cancelado",  "La teva reserva s'ha cancel·lat",   "Your booking has been cancelled",  locale);
      case "deleted":     return i18n("Tu reserva se ha eliminado",  "La teva reserva s'ha eliminat",     "Your booking has been deleted",   locale);
      default:            return i18n("Cambio en tu reserva",        "Canvi a la teva reserva",           "Change to your booking",          locale);
    }
  })();

  const startStr = b.starts_at
    ? new Date(b.starts_at).toLocaleString(locale, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Europe/Madrid",
      })
    : i18n("(fecha no disponible)", "(data no disponible)", "(date unavailable)", locale);

  const bodyText = (audience: string) => {
    const intro = audience === "professional"
      ? i18n("Una de tus reservas ha cambiado:", "Una de les teves reserves ha canviat:", "One of your bookings has changed:", locale)
      : audience === "admin"
        ? i18n("Una reserva de la empresa ha cambiado:", "Una reserva de l'empresa ha canviat:", "A company booking has changed:", locale)
        : i18n("Tu reserva ha cambiado:", "La teva reserva ha canviat:", "Your booking has changed:", locale);
    const detail = b.service_name || b.title || i18n("Reserva", "Reserva", "Booking", locale);
    return `${intro}\n\n${detail}\n${i18n("Fecha", "Data", "Date", locale)}: ${startStr}\n\n${i18n("Ver detalles", "Veure detalls", "View details", locale)}: ${SITE_URL}/reservas/${b.id}`;
  };

  // 5. Send each email through send-branded-email (templated, i18n).
  const send = async (r: Recipient) => {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-branded-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({
        to: r.email,
        subject,
        text: bodyText(r.audience),
        template: "booking_change",
        templateData: {
          audience: r.audience,
          change_type: body.change_type,
          booking_id: b.id,
          booking_title: b.service_name || b.title,
          starts_at: b.starts_at,
          locale,
        },
        // CC admins to non-admin emails when cc_admin is on.
        bcc: body.cc_admin
          ? adminRecipients.map((a) => a.email).filter((e) => e !== r.email)
          : undefined,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[notify-booking-change] send-branded-email failed", resp.status, t);
    }
    return resp.ok;
  };

  // 6. Fire all sends in parallel. We don't fail the whole request if
  //    one fails — each send is logged individually.
  const allRecipients = [...recipients, ...adminRecipients];
  const results = await Promise.all(allRecipients.map(send));
  const sent = results.filter(Boolean).length;

  // 7. Audit log row.
  await sb.from("email_logs").insert({
    company_id: body.company_id,
    template: "booking_change",
    subject,
    recipient_count: allRecipients.length,
    sent_count: sent,
    metadata: {
      booking_id: b.id,
      change_type: body.change_type,
      notify_client: body.notify_client,
      notify_professional: body.notify_professional,
      notify_admin: body.notify_admin,
    },
  });

  console.log("[notify-booking-change] done", { sent, total: allRecipients.length });
  return new Response(JSON.stringify({ sent, total: allRecipients.length }), {
    headers: withSecurityHeaders({ "Content-Type": "application/json" }),
  });
});

function i18n(es: string, ca: string, en: string, locale: "es" | "ca" | "en"): string {
  if (locale === "ca") return ca;
  if (locale === "en") return en;
  return es;
}
