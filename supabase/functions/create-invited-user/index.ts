// Edge Function: create-invited-user
// Purpose: Allows finalizing an invited user's account securely using the Invitation Token.
// Use Case: User clicks "Invite User" link, lands on Portal, inputs Company Details.
//           This function validates the token and creates/activates the Auth User WITHOUT asking for a password,
//           returning a session so the user is immediately logged in (Passwordless flow).

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
import { getClientIP, SECURITY_HEADERS } from "../_shared/security.ts";

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req);
    const optionsResponse = handleCorsOptions(req);
    if (optionsResponse) return optionsResponse;

    // Rate limiting: 10 req/min per IP (creates user accounts — very sensitive)
    const ip = getClientIP(req);
    const rateLimit = checkRateLimit(`create-invited:${ip}`, 10, 60000);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json", ...getRateLimitHeaders(rateLimit) },
      });
    }

    // Only allow POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
      });
    }

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
        const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; // Admin privileges
        const PROJ_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || ""; // For public login attempt

        if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
            throw new Error("Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        const body = await req.json().catch(() => ({}));
        const { email, invitation_token } = body;

        // Validate inputs
        if (!email || !invitation_token) {
            return new Response(JSON.stringify({ error: "Missing required fields: email, invitation_token" }), {
                status: 400,
                headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
            });
        }

        // SECURITY: Validate token format (must be a UUID) before touching the DB
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof invitation_token !== 'string' || !UUID_RE.test(invitation_token)) {
            return new Response(JSON.stringify({ error: "Token de invitación inválido." }), {
                status: 400,
                headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
            });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        // 1. Validate Invitation Token (MUST be valid and pending)
        const { data: invitation, error: inviteErr } = await supabaseAdmin
            .from("company_invitations")
            .select("id, email, status, expires_at, company_id")
            .eq("token", invitation_token)
            .eq("status", "pending")
            .eq("email", sanitizedEmail) // Critical security check
            .single();

        if (inviteErr || !invitation) {
            console.warn("Invalid invitation attempt (email redacted)");
            return new Response(JSON.stringify({ error: "Invitación inválida o expirada. Por favor solicite una nueva." }), {
                status: 400,
                headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
            });
        }

        if (new Date(invitation.expires_at) < new Date()) {
            return new Response(JSON.stringify({ error: "La invitación ha caducado." }), {
                status: 400,
                headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
            });
        }

        // 2. Generate a secure random password for initial account creation
        // The user will never know this password. They will use Magic Link/Passkeys.
        const pwdBytes = crypto.getRandomValues(new Uint8Array(32));
        const tempPassword = Array.from(pwdBytes, b => b.toString(16).padStart(2, '0')).join('') + 'A1!';

        // 3. Check if Auth User exists
        let existingUser: any = null;
        try {
            const { data: { user: foundUser }, error: getUserErr } = await supabaseAdmin.auth.admin.getUserByEmail(sanitizedEmail);
            if (!getUserErr && foundUser) {
                existingUser = foundUser;
            }
        } catch (_) { /* ignore */ }

        let userId: string;
        let sessionData: any;

        if (existingUser) {
            // SECURITY: Don't overwrite password of existing confirmed users.
            // Instead, generate a magic link token to create a session safely.
            userId = existingUser.id;

            const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
                type: 'magiclink',
                email: sanitizedEmail,
            });

            if (linkErr || !linkData) {
                throw new Error("Could not generate login link for existing user");
            }

            // Use the OTP token from the generated link to verify and create session
            const { data: otpSession, error: otpErr } = await supabaseAdmin.auth.verifyOtp({
                email: sanitizedEmail,
                token: linkData.properties.hashed_token,
                type: 'email',
            });

            if (otpErr || !otpSession?.session) {
                throw new Error("Auto-login failed for existing user. Please use Magic Link to sign in.");
            }
            sessionData = otpSession;
        } else {
            // Create new user with temp password
            const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email: sanitizedEmail,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { invite_accepted_at: new Date().toISOString() }
            });
            if (createErr) throw createErr;
            userId = newUser.user.id;

            // Sign in the new user
            const { data: loginData, error: loginError } = await supabaseAdmin.auth.signInWithPassword({
                email: sanitizedEmail,
                password: tempPassword,
            });

            if (loginError || !loginData.session) {
                throw new Error("Invitation valid, but auto-login failed. Please use Magic Link to sign in.");
            }
            sessionData = loginData;
        }

        // 4.5. Mark invitation as accepted (prevent token reuse)
        await supabaseAdmin
            .from("company_invitations")
            .update({ status: "accepted" })
            .eq("id", invitation.id)
            .eq("status", "pending");

        // 5. Return Session to client (do not expose internal userId)
        return new Response(JSON.stringify({ 
            success: true, 
            session: sessionData.session 
        }), {
            status: 200,
            headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("create-invited-user error:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { ...corsHeaders, ...SECURITY_HEADERS, "Content-Type": "application/json" },
        });
    }
});
