// Edge Function: create-invited-user
// Purpose: Allows finalizing an invited user's account securely using the Invitation Token.
// Use Case: User clicks "Invite User" link, lands on Portal, inputs Company Details.
//           This function validates the token and creates/activates the Auth User WITHOUT asking for a password,
//           returning a session so the user is immediately logged in (Passwordless flow).

// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
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
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        // 1. Validate Invitation Token (MUST be valid and pending)
        const { data: invitation, error: inviteErr } = await supabaseAdmin
            .from("company_invitations")
            .select("id, email, status, expires_at")
            .eq("token", invitation_token)
            .eq("status", "pending")
            .eq("email", sanitizedEmail) // Critical security check
            .single();

        if (inviteErr || !invitation) {
            console.warn("Invalid invitation attempt:", { email: sanitizedEmail, token: invitation_token });
            return new Response(JSON.stringify({ error: "Invitación inválida o expirada. Por favor solicite una nueva." }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (new Date(invitation.expires_at) < new Date()) {
            return new Response(JSON.stringify({ error: "La invitación ha caducado." }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2. Generate a secure random password for initial account creation
        // The user will never know this password. They will use Magic Link/Passkeys.
        const tempPassword = crypto.randomUUID() + "-" + crypto.randomUUID() + "A1!";

        // 3. Check if Auth User exists
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users.find(u => u.email?.toLowerCase() === sanitizedEmail);

        let userId: string;

        if (existingUser) {
            // Update exisiting user to ensure email is confirmed and set temp password so we can login
            const { data: updatedUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
                existingUser.id,
                {
                    password: tempPassword,
                    email_confirm: true,
                    user_metadata: { ...existingUser.user_metadata, invite_accepted_at: new Date().toISOString() }
                }
            );
            if (updateErr) throw updateErr;
            userId = updatedUser.user.id;
        } else {
            // Create new user
            const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email: sanitizedEmail,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { invite_accepted_at: new Date().toISOString() }
            });
            if (createErr) throw createErr;
            userId = newUser.user.id;
        }

        // 4. Perform Login to get Session Tokens
        // We use a separate client with ANON KEY because signInWithPassword is a public API method
        // strictly speaking, admin client can do it too, but better to simulate real login.
        // Actually, admin client `signInWithPassword` works fine and returns session.
        const { data: sessionData, error: loginError } = await supabaseAdmin.auth.signInWithPassword({
            email: sanitizedEmail,
            password: tempPassword
        });

        if (loginError || !sessionData.session) {
            console.error("Login after creation failed:", loginError);
            throw new Error("Invitation valid, but auto-login failed. Please use Magic Link to sign in.");
        }

        // 5. Return Session to client
        return new Response(JSON.stringify({ 
            success: true, 
            userId: userId,
            session: sessionData.session 
        }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        console.error("create-invited-user error:", error);
        return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
