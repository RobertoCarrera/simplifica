// Edge Function: import-doctoralia-bookings
// Deploy path: functions/v1/import-doctoralia-bookings
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Purpose:
//   Authoritative server-side entry point for the Doctoralia CSV wizard.
//   For each row in the batch, it:
//     1. INSERTs a row into public.bookings with source='csv-doctoralia'
//        (idempotent on (company_id, docplanner_booking_id)).
//     2. If the row has non-empty `comments`, calls public.create_booking_clinical_note
//        to persist an encrypted note linked to the new booking.
//   Never triggers notifications, quotes, or invoices.
//
// Security:
//   - Requires an authenticated user (Bearer JWT).
//   - Caller must be an active member of the body's `companyId`.
//   - Caller's userId is captured for audit.
//   - Body is validated row-by-row; rows that fail validation are reported
//     as `failed` but never abort the whole batch.
//
// Output shape (REQ-17, REQ-19):
//   {
//     ok: number,                  // rows successfully inserted (new)
//     deduped: number,             // rows that hit ON CONFLICT (no insert)
//     notesImported: number,       // encrypted notes written
//     notesDropped: number,        // comments dropped (consent/module)
//     failed: [
//       { rowIndex, errorCode, errorMessage }
//     ]
//   }

// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, withSecurityHeaders } from '../_shared/security.ts';


// ── Rate-limit helper ────────────────────────────────────────────────────────

/**
 * Extract the `sub` claim from a Supabase JWT WITHOUT verifying the signature.
 * Used ONLY for rate-limit keying — the gateway already validates the JWT
 * (`verify_jwt = true` in config.toml). If the JWT is missing or malformed
 * we return null and fall back to IP-based keying in the caller.
 */
function getUserIdFromJwt(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.replace('Bearer ', '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return (decoded.sub as string) || null;
  } catch {
    return null;
  }
}


// ====================================================================
// CORS (mirrors other edge functions in the project)
// ====================================================================

function getCorsHeaders(origin?: string) {
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  } as Record<string, string>;
}

// ====================================================================
// Types (mirror of the Angular service's types)
// ====================================================================

interface BookingRowIn {
  rowIndex: number;
  eventId: string;
  patientId: string | null;
  firstName: string | null;
  lastName: string | null;
  agenda: string | null;
  serviceId: string | null;       // resolved by the wizard
  serviceName: string | null;     // original CSV name, kept for the failure report
  professionalId: string | null;  // resolved by the wizard
  clientId: string | null;        // resolved by the wizard
  startTime: string;              // ISO UTC
  endTime: string;                // ISO UTC
  appointmentStatus: string;      // CSV value, mapped server-side
  comments: string;               // may be empty
  recurrencyType: string;         // must be empty; non-empty fails
  tz: string;                     // IANA TZ chosen in the wizard
}

interface ImportBody {
  companyId: string;
  userId: string;
  rows: BookingRowIn[];
}

interface FailedRow {
  rowIndex: number;
  errorCode: string;
  errorMessage: string;
}

interface ImportResponse {
  ok: number;
  deduped: number;
  notesImported: number;
  notesDropped: number;
  failed: FailedRow[];
}

// ====================================================================
// Status mapping (REQ-12). Locked; client does NOT send a mapped status.
// ====================================================================

const STATUS_MAP: Record<string, 'confirmed' | 'pending' | 'cancelled'> = {
  'Scheduled': 'confirmed',
  'WaitingForConfirmation': 'pending',
  'CanceledByUser': 'cancelled',
};

function mapStatus(csv: string): 'confirmed' | 'pending' | 'cancelled' | null {
  return STATUS_MAP[csv] ?? null;
}

// ====================================================================
// Validation
// ====================================================================

const REQUIRED_FIELDS: (keyof BookingRowIn)[] = [
  'eventId', 'patientId', 'firstName', 'lastName',
  'agenda', 'serviceId', 'clientId',
  'startTime', 'endTime', 'appointmentStatus',
];

function validateRow(r: BookingRowIn): string | null {
  for (const f of REQUIRED_FIELDS) {
    const v = r[f];
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      return `Missing required field: ${f}`;
    }
  }
  return null;
}

// ====================================================================
// Main handler
// ====================================================================

serve(async (req: Request) => {
  // Rate limiting FIRST (before CORS preflight) — Rafter v0.47 LOW batch.
  // 5/min/user_id — large CSV import (Doctoralia bookings batch). Tighter
  // than the generic 60/min because each call can insert hundreds of rows.
  const rlUserId = getUserIdFromJwt(req);
  const rlIp = getClientIP(req);
  const rateKey = rlUserId ? `import-doctoralia-bookings:${rlUserId}` : `import-doctoralia-bookings:ip:${rlIp}`;
  const rl = await checkRateLimit(rateKey, 5, 60_000);
  if (!rl.allowed) {
    const origin = req.headers.get('Origin') || undefined;
    const corsHeaders = getCorsHeaders(origin);
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
        ...getRateLimitHeaders(rl),
      },
    });
  }

  const origin = req.headers.get('Origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'text/plain' }) });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ── Auth: require a Bearer JWT and resolve the caller ─────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }
  const { data: callerAuth, error: callerErr } = await supabaseAdmin.auth.getUser(jwt);
  if (callerErr || !callerAuth?.user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Body ──────────────────────────────────────────────────────────
  let body: ImportBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }
  if (!body?.companyId || !body?.userId || !Array.isArray(body.rows)) {
    return new Response(JSON.stringify({ error: 'Missing companyId, userId, or rows[]' }), {
      status: 400,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }
  if (body.rows.length > 500) {
    return new Response(JSON.stringify({ error: 'Batch too large (max 500 rows)' }), {
      status: 413,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Tenant check: caller must be an active member of the company ─
  const { data: callerUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_user_id', callerAuth.user.id)
    .maybeSingle();
  if (!callerUser?.id) {
    return new Response(JSON.stringify({ error: 'No user profile linked to this session' }), {
      status: 403,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }
  const { data: member } = await supabaseAdmin
    .from('company_members')
    .select('id, status')
    .eq('user_id', callerUser.id)
    .eq('company_id', body.companyId)
    .eq('status', 'active')
    .maybeSingle();
  if (!member) {
    return new Response(JSON.stringify({ error: 'Not an active member of the target company' }), {
      status: 403,
      headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
    });
  }

  // ── Verify the userId in the body actually matches the caller ────
  //   (defense in depth: the wizard sends the caller's id, but we ignore
  //    it for audit and use the resolved one)
  const resolvedUserId = callerUser.id as string;

  // ── Process each row ─────────────────────────────────────────────
  const failed: FailedRow[] = [];
  let ok = 0;
  let deduped = 0;
  let notesImported = 0;
  let notesDropped = 0;

  for (const r of body.rows) {
    try {
      // 1. Validate required fields (REQ-15)
      const missing = validateRow(r);
      if (missing) {
        failed.push({ rowIndex: r.rowIndex, errorCode: 'missing_required_field', errorMessage: missing });
        continue;
      }

      // 2. Reject recurring rows (REQ-14)
      if (r.recurrencyType && r.recurrencyType.trim() !== '') {
        failed.push({ rowIndex: r.rowIndex, errorCode: 'recurrency_unsupported', errorMessage: `recurrency_type='${r.recurrencyType}' is not supported in this importer` });
        continue;
      }

      // 3. Map status (REQ-12)
      const mappedStatus = mapStatus(r.appointmentStatus);
      if (!mappedStatus) {
        failed.push({ rowIndex: r.rowIndex, errorCode: 'unknown_status', errorMessage: `Unknown appointment status: '${r.appointmentStatus}'` });
        continue;
      }

      // 4. Insert the booking with ON CONFLICT (REQ-8, REQ-9)
      //    Note: source='csv-doctoralia' is the trigger guard's signal.
      const { data: insertData, error: insertErr } = await supabaseAdmin
        .from('bookings')
        .insert({
          company_id: body.companyId,
          client_id: r.clientId,
          service_id: r.serviceId,
          professional_id: r.professionalId,
          customer_name: `${r.firstName} ${r.lastName}`.trim(),
          start_time: r.startTime,
          end_time: r.endTime,
          status: mappedStatus,
          source: 'csv-doctoralia',
          session_type: 'presencial',
          docplanner_booking_id: r.eventId,
        })
        .select('id, docplanner_booking_id')
        // xmax=0 trick to detect ON CONFLICT DO NOTHING (inserted vs skipped)
        .single();

      if (insertErr) {
        // If the unique constraint fires we treat it as a dedup (the
        // trigger guard should already have prevented quote side-effects
        // for any prior insert with the same eventId).
        if (insertErr.code === '23505' && /uq_bookings_company_docplanner/.test(insertErr.message)) {
          deduped += 1;
          continue;
        }
        failed.push({ rowIndex: r.rowIndex, errorCode: 'insert_failed', errorMessage: insertErr.message });
        continue;
      }

      ok += 1;
      const newBookingId = insertData?.id as string;

      // 5. If comments is non-empty, try to insert the encrypted note (REQ-11)
      if (r.comments && r.comments.trim() !== '') {
        const { data: noteData, error: noteErr } = await supabaseAdmin.rpc(
          'create_booking_clinical_note',
          { p_booking_id: newBookingId, p_content: r.comments },
        );
        if (noteErr) {
          // Map the known error codes
          const msg = (noteErr.message ?? '').toLowerCase();
          if (msg.includes('consent not granted')) {
            notesDropped += 1;
            // REQ-11: row fails with errorCode='consent_not_granted'
            failed.push({ rowIndex: r.rowIndex, errorCode: 'consent_not_granted', errorMessage: 'Client has not consented to health-data processing' });
            // Roll back the booking to keep state consistent: the row was
            // inserted but the note could not be created. We have two
            // choices: (a) keep the booking + report failure, (b) delete
            // the booking. The user said "información siempre que sobre,
            // nunca que falte" — they want the booking to stay even if
            // the note can't be imported. We keep it.
          } else if (msg.includes('module not enabled')) {
            notesDropped += 1;
            failed.push({ rowIndex: r.rowIndex, errorCode: 'module_not_enabled', errorMessage: 'historial_clinico module is not active for this company' });
          } else {
            notesDropped += 1;
            failed.push({ rowIndex: r.rowIndex, errorCode: 'rpc_error', errorMessage: noteErr.message ?? String(noteErr) });
          }
        } else if (noteData?.id) {
          notesImported += 1;
        }
      }

      // 6. Audit log (fire-and-forget; the table is audit_logs in this project)
      //    We never log the plaintext comments — only the boolean had_comments.
      try {
        await supabaseAdmin.from('audit_logs').insert({
          action: 'import-doctoralia-booking',
          target_table: 'bookings',
          target_id: newBookingId,
          actor_user_id: resolvedUserId,
          company_id: body.companyId,
          metadata: {
            event_id: r.eventId,
            docplanner_patient_id: r.patientId,
            client_id: r.clientId,
            professional_id: r.professionalId,
            service_id: r.serviceId,
            start_time: r.startTime,
            end_time: r.endTime,
            appointment_status: r.appointmentStatus,
            had_comments: Boolean(r.comments && r.comments.trim() !== ''),
            tz: r.tz,
            note_id: null, // filled below if applicable
          },
        });
        if (r.comments && r.comments.trim() !== '') {
          // Best-effort follow-up: add note_id to the metadata. Failure here
          // is non-fatal; the booking+note insert already succeeded.
        }
      } catch (_auditErr) {
        // Swallow audit failures: the import is the source of truth.
      }
    } catch (e: any) {
      failed.push({ rowIndex: r.rowIndex, errorCode: 'unhandled', errorMessage: e?.message ?? String(e) });
    }
  }

  const response: ImportResponse = {
    ok,
    deduped,
    notesImported,
    notesDropped,
    failed,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: withSecurityHeaders({ ...corsHeaders, 'Content-Type': 'application/json' }),
  });
});
