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
    return new Response(JSON.stringify({ error: "Origin not allowed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed", allowed: ["POST", "OPTIONS"] }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const APP_URL = Deno.env.get("APP_URL") || "";
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !APP_URL) {
      console.error("send-company-invite: missing env vars", { hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_ROLE_KEY, hasAppUrl: !!APP_URL });
      return new Response(JSON.stringify({ error: "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      console.warn("send-company-invite: missing bearer token header");
      return new Response(JSON.stringify({ error: "Authorization Bearer token required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "member").trim();
    const message = body?.message != null ? String(body.message) : null;
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Determine company_id of requester and check role owner/admin
    const token = authHeader.replace("Bearer ", "");
    const { data: userFromToken, error: tokenErr } = await supabaseAdmin.auth.getUser(token);
    if (tokenErr || !userFromToken?.user?.id) {
      console.warn("send-company-invite: invalid token or user not found", tokenErr);
      return new Response(JSON.stringify({ error: "Invalid auth token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authUserId = userFromToken.user.id;
    const { data: currentUser, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, company_id, role, active")
      .eq("auth_user_id", authUserId)
      .single();

    if (userErr || !currentUser?.active || !["owner", "admin"].includes(currentUser.role)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create invitation via RPC (try new signature with named params). Fallback to legacy signature.
    let invitationId: string | null = null;
    let inviteJson: any = null;
    let inviteFirstErr: any = null;
    {
      const { data: inviteRes, error: inviteErr } = await supabaseAdmin.rpc("invite_user_to_company", {
        p_company_id: currentUser.company_id,
        p_email: email,
        p_role: role,
        p_message: message,
      });
      if (!inviteErr && inviteRes?.success) {
        inviteJson = inviteRes;
        invitationId = (inviteRes as any).invitation_id ?? null;
      } else {
        inviteFirstErr = inviteErr?.message || inviteRes?.error || "Invite RPC failed";
      }
    }

    if (!invitationId && !inviteJson) {
      // Fallback to legacy signature public.invite_user_to_company(user_email, user_name, user_role)
      const guessedName = email.split("@")[0];
      const { data: fallbackRes, error: fallbackErr } = await supabaseAdmin.rpc("invite_user_to_company", {
        user_email: email,
        user_name: guessedName,
        user_role: role,
      });
      if (fallbackErr || !fallbackRes) {
        console.error("send-company-invite: both invite RPC calls failed", { inviteFirstErr, fallbackErr: fallbackErr?.message });
        return new Response(JSON.stringify({ error: inviteFirstErr || fallbackErr?.message || "Invite RPC failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      inviteJson = fallbackRes;
    }

    // Obtain token for redirect; try company_invitations first, then legacy invitations table
    let inviteToken: string | null = null;
    if (invitationId) {
      const { data: tokenRow, error: tokErr } = await supabaseAdmin.rpc("get_company_invitation_token", { p_invitation_id: invitationId });
      if (!tokErr && tokenRow) inviteToken = tokenRow as string;
    }
    if (!inviteToken) {
      // Query latest company_invitations row
      const { data: ci, error: ciErr } = await supabaseAdmin
        .from("company_invitations")
        .select("token")
        .eq("company_id", currentUser.company_id)
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ciErr && ci?.token) inviteToken = ci.token as string;
    }
    if (!inviteToken) {
      // Fallback to legacy invitations table
      const { data: legacy, error: legErr } = await supabaseAdmin
        .from("invitations")
        .select("token")
        .eq("company_id", currentUser.company_id)
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!legErr && legacy?.token) inviteToken = legacy.token as string;
    }
    if (!inviteToken) {
      console.error("send-company-invite: could not retrieve invitation token for", { email, company_id: currentUser.company_id });
      return new Response(JSON.stringify({ error: "Could not retrieve invitation token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Send invite email using Supabase Auth
    const { data: adminInvite, error: adminErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/invite?token=${encodeURIComponent(inviteToken)}`,
    });
    if (adminErr) {
      // If the user already exists in Auth, we still consider the invitation created successfully.
      const status: any = (adminErr as any)?.status;
      const code: any = (adminErr as any)?.code;
      const name: any = (adminErr as any)?.name;
      if (status === 422 || code === "email_exists" || name === "AuthApiError") {
        console.warn("send-company-invite: inviteUserByEmail email_exists, returning success with token for manual sharing");
        return new Response(
          JSON.stringify({ success: true, invitation_id: invitationId || null, info: "email_exists", token: inviteToken }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.error("send-company-invite: inviteUserByEmail failed", adminErr);
      return new Response(JSON.stringify({ error: adminErr.message || "Failed to send email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, invitation_id: invitationId || null, token: inviteToken }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("send-company-invite: unhandled error", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
