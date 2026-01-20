// Edge Function: send-company-invite
// Purpose: Owner/Admin triggers company invitation email using Supabase Auth SMTP (SES configured)
// Flow:
// 1) Validate requester (JWT) and parse body { email, role?, message? }
// 2) Call RPC invite_user_to_company(p_company_id?, p_email, p_role, p_message) or your variant
// 3) Fetch token via get_company_invitation_token(invitation_id)
// 4) Call supabase.auth.admin.inviteUserByEmail(email, { redirectTo: `${APP_URL}/invite?token=${token}` })
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, ALLOW_ALL_ORIGINS/ALLOWED_ORIGINS

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getCorsHeaders(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    "Access-Control-Allow-Origin": isAllowed && origin ? origin : (allowAll ? "*" : ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  } as Record<string, string>;
}

function isAllowedOrigin(origin?: string) {
  const allowAll = (Deno.env.get("ALLOW_ALL_ORIGINS") || "false").toLowerCase() === "true";
  if (allowAll) return true;
  if (!origin) return true; // server-to-server
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || undefined;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders, "Content-Type": "text/plain" } });
  }

  if (!isAllowedOrigin(origin)) {
    console.warn("send-company-invite: Origin not allowed:", origin);
    // Return 200 with structured error to avoid noisy client Function errors
    return new Response(JSON.stringify({ success: false, error: "origin_not_allowed", message: "Origin not allowed", origin }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: ["POST", "OPTIONS"] }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const APP_URL = Deno.env.get("APP_URL") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("send-company-invite: missing env vars", { hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_ROLE_KEY, hasAppUrl: !!APP_URL });
      return new Response(JSON.stringify({ success: false, error: "missing_env", message: "Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Allow missing APP_URL by falling back to request origin
    // Prioritize origin to support local development/staging environments if allowed
    const redirectBase = origin || APP_URL || '';

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      console.warn("send-company-invite: missing bearer token header");
      return new Response(JSON.stringify({ success: false, error: "unauthorized", message: "Authorization Bearer token required" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "member").trim();
    const message = body?.message != null ? String(body.message) : null;
    const forceEmail = body?.force_email === true; // Flag to ALWAYS send email
    if (!email) {
      return new Response(JSON.stringify({ success: false, error: "invalid_request", message: "email is required" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Determine company_id of requester and check role owner/admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userFromToken, error: tokenErr } = await supabaseAdmin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user?.id) {
      console.warn("send-company-invite: invalid token or user not found", tokenErr);
      return new Response(JSON.stringify({ success: false, error: "unauthorized", message: "Invalid auth token" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authUserId = userFromToken.user.id;

    // FETCH USER AND ACTIVE MEMBERSHIP
    // Since users.company_id is deprecated, we must fetch from company_members.
    // We assume the user is "active" (status='active') in at least one company with role 'owner' or 'admin'.
    // If multiple, we might need to know WHICH company context they are in.
    // For now, we take the first "owner"/"admin" active membership.
    // Ideally, the client should pass the `company_id` context, but to stay secure we verify membership.

    // 1. Get User ID
    const { data: userData, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, active")
      .eq("auth_user_id", authUserId)
      .single();

    if (userErr || !userData?.active) {
      return new Response(JSON.stringify({ success: false, error: "forbidden", message: "User not found or inactive" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Get Active Membership (Owner/Admin)
    // We prioritize the company_id passed in the body if available (to support multi-company switching context)
    // Otherwise fallback to any owner/admin membership.
    const requestedCompanyId = body?.company_id;

    let membershipQuery = supabaseAdmin
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", userData.id)
      .eq("status", "active")
      .in("role", ["owner", "admin"]);

    if (requestedCompanyId) {
      membershipQuery = membershipQuery.eq("company_id", requestedCompanyId);
    }

    const { data: memberships, error: memberErr } = await membershipQuery;

    if (memberErr || !memberships || memberships.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "forbidden", message: "User is not an admin/owner of any active company (or the requested one)" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use the first valid membership found
    const activeMembership = memberships[0];

    const currentUser = {
      id: userData.id,
      company_id: activeMembership.company_id,
      role: activeMembership.role
    };

    // Create invitation directly
    let invitationId: string | null = null;
    let inviteToken: string | null = null;

    // Generate token
    const generatedToken = (globalThis as any).crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // Set expiration (7 days)
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: created, error: createErr } = await supabaseAdmin
      .from("company_invitations")
      .insert({
        company_id: currentUser.company_id,
        email,
        role,
        status: "pending",
        token: generatedToken,
        expires_at: expiresAt,
        invited_by_user_id: currentUser.id,
        message: message // Include message!
      })
      .select("id, token")
      .single();

    if (createErr) {
      // Handle unique violation (resend)
      if ((createErr as any).code === '23505') {
        const { data: existing } = await supabaseAdmin
          .from("company_invitations")
          .select("id, token")
          .eq("company_id", currentUser.company_id)
          .eq("email", email)
          .maybeSingle();

        if (existing) {
          // Update existing
          const { data: updated, error: updErr } = await supabaseAdmin
            .from("company_invitations")
            .update({
              status: "pending",
              token: generatedToken,
              expires_at: expiresAt,
              invited_by_user_id: currentUser.id,
              message: message
            })
            .eq("id", existing.id)
            .select("id, token")
            .single();

          if (!updErr && updated) {
            invitationId = updated.id;
            inviteToken = updated.token;
          } else {
            return new Response(JSON.stringify({ success: false, error: "update_failed", message: updErr?.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      } else {
        console.error("send-company-invite: create failed", createErr);
        return new Response(JSON.stringify({ success: false, error: "create_failed", message: createErr.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      invitationId = created.id;
      inviteToken = created.token;
    }

    // Simplified logic: We already created/updated the invitation at the start.
    // If that failed, we returned early.
    // So invitationId and inviteToken SHOULD be set.

    if (!invitationId || !inviteToken) {
      // This should technically be unreachable if the initial insert/update succeeded,
      // but as a fallback, generate one last token.
      inviteToken = (globalThis as any).crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      console.warn("send-company-invite: invitationId/token missing after initial ops, using generated token without DB persistence (risky)", { email });
    }

    // We do NOT need to upsert again. The initial block handles uniqueness on (company_id, email)
    // Note: For Super Admins (company_id is null), uniqueness on (company_id, email) might fail in Postgres (multiple nulls allowed).
    // We should handle that by ensuring we cleaning up previous pending invites for this email/role if needed, 
    // or just accept that multiple might exist but we use the latest token.
    // Ideally we should have a unique index on email where company_id is null? 
    // For now, removing the redundant block avoids creating a *second* row in the same execution.

    // Send invite email using Supabase Auth
    // Try inviteUserByEmail first (triggers "Invite User" template)
    let emailSent = false;
    let emailError = null;

    try {
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${redirectBase}/invite?token=${encodeURIComponent(inviteToken)}`,
        data: { message: message }
      });

      if (inviteErr) {
        // Check if error is "email_exists" (or similar 422)
        if (inviteErr.status === 422 || inviteErr.message?.includes('registered') || inviteErr.code === 'email_exists') {
          console.log("send-company-invite: User exists (422), falling back to Magic Link (signInWithOtp)");

          // Fallback to Magic Link
          const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
            email,
            options: {
              emailRedirectTo: `${redirectBase}/invite?token=${encodeURIComponent(inviteToken)}`,
              shouldCreateUser: false, // User already exists
              data: { message: message }
            }
          });

          if (otpErr) throw otpErr;
          console.log("send-company-invite: Magic Link sent successfully");
          emailSent = true;
          // You might want to indicator to client that it was an existing user
        } else {
          console.error("send-company-invite: inviteUserByEmail failed with unexpected error", inviteErr);
          throw inviteErr;
        }
      } else {
        console.log("send-company-invite: Invite User email sent successfully");
        emailSent = true;
      }
    } catch (err) {
      console.error("send-company-invite: invite/otp failed logic", err);
      emailError = err;
    }

    if (!emailSent) {
      if (forceEmail) {
        return new Response(
          JSON.stringify({ success: false, error: "email_send_failed", message: "No se pudo enviar el email: " + (emailError?.message || 'Unknown error'), token: inviteToken }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "email_send_failed", message: "Error enviando email (pero la invitación se guardó): " + (emailError?.message || 'Unknown error') }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({
      success: true,
      invitation_id: invitationId || null,
      token: inviteToken,
      mode: emailError ? 'failed' : (inviteErr ? 'existing_user' : 'new_user')
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("send-company-invite: unhandled error", e);
    // Last-resort: avoid surfacing 500 to client to prevent function-layer retries/loops
    return new Response(JSON.stringify({ success: false, error: "unhandled", message: e?.message || String(e) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
