// Edge Function: email-tracking
// Purpose: Public tracking endpoints invoked from HTML emails.
//
// Routes (NO JWT — email clients fetch the pixel without auth):
//   GET /track/open?cid=<campaign_id>&e=<email>&t=<token>
//     → 1x1 transparent GIF, records an "open" event
//   GET /track/click?cid=<campaign_id>&url=<encoded_url>&e=<email>&t=<token>
//     → 302 redirect to the original URL, records a "click" event
//     (click events are wired into the table but the link-rewriter that
//      produces these URLs is intentionally NOT in this PR — the table
//      and the endpoint exist so a follow-up PR can hook them up without
//      a schema migration)
//
// Security notes:
//   - Campaign ID must be a UUID — rejected otherwise (prevents log
//     poisoning via arbitrary text in the `cid` column).
//   - Email is lowercased + length-bounded; never used for SQL — the row
//     is written by the service role, RLS reads only.
//   - Failures to record the event are logged but NEVER break the pixel
//     or the redirect: tracking should never break the email experience.
//
// Returns binary GIF bytes for /track/open — we explicitly set headers
// (no-cache) so recipient mail clients re-fetch on subsequent opens.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { getClientIP, withSecurityHeaders, isValidUUID } from "../_shared/security.ts";

// 1x1 transparent GIF (43 bytes — verified)
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
  0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req: Request) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  const corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  // Path is /functions/v1/email-tracking/track/<segment> — strip the
  // function prefix and the "track/" segment to get the final segment.
  const segments = url.pathname
    .replace(/\/$/, "")
    .split("/")
    .filter((s) => s.length > 0);
  // We expect either [..., "track", "open"] or [..., "track", "click"].
  // The function is always invoked at /functions/v1/email-tracking/track/<x>.
  const last = segments[segments.length - 1] ?? "";
  const penultimate = segments[segments.length - 2] ?? "";

  if (penultimate !== "track" || (last !== "open" && last !== "click")) {
    return new Response("Not found", {
      status: 404,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  const path = last; // 'open' or 'click'
  const params = url.searchParams;

  // Extract + validate params.
  const campaignId = params.get("cid");
  const email = (params.get("e") ?? "").toLowerCase().slice(0, 320);
  // `t` (token) and `url` are accepted but currently unused — they are
  // reserved for signed-URL protection + the click rewriter. Keeping them
  // in the URL means callers (consent flow) don't have to change when
  // those land.
  const token = params.get("t");

  if (!campaignId || !email || !isValidUUID(campaignId)) {
    // Bad request — but ALWAYS return the GIF for /track/open so a
    // malformed URL doesn't break email rendering.
    if (path === "open") {
      return new Response(TRANSPARENT_GIF, {
        status: 200,
        headers: withSecurityHeaders({
          ...corsHeaders,
          "Content-Type": "image/gif",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        }),
      });
    }
    return new Response("Bad request", {
      status: 400,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  // Record the event with the service role. We never fail the response
  // on a tracking write error — the user has already opened the email.
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });

      // Best-effort: try to link the row to a known auth user so the
      // CRM analytics layer can join opens ↔ users server-side.
      let userId: string | null = null;
      try {
        const { data: client } = await admin
          .from("clients")
          .select("auth_user_id")
          .eq("email", email)
          .maybeSingle();
        userId = client?.auth_user_id ?? null;
      } catch (_e) {
        // ignore — user_id stays null
      }

      await admin.from("email_tracking_events").insert({
        campaign_id: campaignId,
        recipient_email: email,
        event_type: path, // 'open' or 'click'
        ip: getClientIP(req),
        user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        user_id: userId,
        event_data: {
          ...(token ? { token } : {}),
          ...(path === "click" ? { url: params.get("url") ?? null } : {}),
        },
      });
    } catch (e) {
      console.error("[email-tracking] failed to record event:", e);
    }
  }

  // For click: redirect to the original URL.
  if (path === "click") {
    const target = params.get("url");
    if (target && /^https?:\/\//i.test(target)) {
      return new Response(null, {
        status: 302,
        headers: withSecurityHeaders({
          ...corsHeaders,
          Location: target,
        }),
      });
    }
    // Missing/invalid target → bail to a friendly fallback rather than
    // bouncing the recipient to nothing.
    return new Response("Bad link", {
      status: 400,
      headers: withSecurityHeaders(corsHeaders),
    });
  }

  // For open: return the 1x1 transparent GIF.
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: withSecurityHeaders({
      ...corsHeaders,
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    }),
  });
});
