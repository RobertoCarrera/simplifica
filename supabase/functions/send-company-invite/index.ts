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
      return new Response(JSON.stringify({ error: "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
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
    const { data: currentUser, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, company_id, role, active")
      .eq("auth_user_id", (await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""))).data.user?.id || "")
      .single();

    if (userErr || !currentUser?.active || !["owner", "admin"].includes(currentUser.role)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create invitation via RPC
    const { data: inviteRes, error: inviteErr } = await supabaseAdmin.rpc("invite_user_to_company", {
      p_company_id: currentUser.company_id,
      p_email: email,
      p_role: role,
      p_message: message,
    });

    if (inviteErr || !inviteRes?.success) {
      return new Response(JSON.stringify({ error: inviteErr?.message || inviteRes?.error || "Invite RPC failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const invitationId = inviteRes.invitation_id as string;
    if (!invitationId) {
      return new Response(JSON.stringify({ error: "Missing invitation_id from RPC" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get token for redirect
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin.rpc("get_company_invitation_token", { p_invitation_id: invitationId });
    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: tokenErr?.message || "Could not retrieve invitation token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = tokenRow as string;

    // Send invite email using Supabase Auth
    const { data: adminInvite, error: adminErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/invite?token=${encodeURIComponent(token)}`,
    });
    if (adminErr) {
      return new Response(JSON.stringify({ error: adminErr.message || "Failed to send email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, invitation_id: invitationId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
