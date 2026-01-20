// Edge Function: create-invited-user
// Purpose: Allows finalizing an invited user's account (setting password) by validating a custom invitation token.
// Use Case: User clicks "Invite User" link, lands on Portal, inputs Password + Company Details.
//           If the user is not logged in (session lost/magic link not consumed), this function 
//           enables "creating" or "updating" the auth user securely using the Invitation Token as proof of authorization.

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
        const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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
        const { email, password, invitation_token } = body;

        // Validate inputs
        if (!email || !password || !invitation_token) {
            return new Response(JSON.stringify({ error: "Missing required fields: email, password, invitation_token" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        // 1. Validate Invitation Token
        // We must ensure this token corresponds to this email and is valid (pending).
        const { data: invitation, error: inviteErr } = await supabaseAdmin
            .from("company_invitations")
            .select("id, email, status, expires_at")
            .eq("token", invitation_token)
            .eq("status", "pending")
            .eq("email", sanitizedEmail) // Critical security check: Token must belong to this email
            .single();

        if (inviteErr || !invitation) {
            console.warn("Invalid invitation attempt:", { email: sanitizedEmail, token: invitation_token });
            return new Response(JSON.stringify({ error: "Invitación inválida o expirada. Por favor solicite una nueva." }), {
                status: 400, // 400 Bad Request prevents client retries thinking it's auth issue
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Check expiration
        if (new Date(invitation.expires_at) < new Date()) {
            return new Response(JSON.stringify({ error: "La invitación ha caducado." }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // 2. Check if Auth User exists
        // We use listUsers because getUserByEmail doesn't exist on admin in all versions, or specific ID is unknown.
        // Actually admin.listUsers is reliable.
        const { data: { users }, error: listErr } = await supabaseAdmin.auth.admin.listUsers();

        // Filter locally because listUsers search isn't always exact match
        const existingUser = users.find(u => u.email?.toLowerCase() === sanitizedEmail);

        let userId: string;

        if (existingUser) {
            // 3a. Update existing user (Set Password, Confirm Email)
            const { data: updatedUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
                existingUser.id,
                {
                    password: password,
                    email_confirm: true, // Ensure confirmed
                    user_metadata: { ...existingUser.user_metadata, invite_accepted_at: new Date().toISOString() }
                }
            );

            if (updateErr) {
                console.error("Failed to update user:", updateErr);
                throw updateErr;
            }
            userId = updatedUser.user.id;
        } else {
            // 3b. Create new user (should invoke creation if invite didn't create it, though invite usually does)
            const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email: sanitizedEmail,
                password: password,
                email_confirm: true,
                user_metadata: { invite_accepted_at: new Date().toISOString() }
            });

            if (createErr) {
                console.error("Failed to create user:", createErr);
                throw createErr;
            }
            userId = newUser.user.id;
        }

        // 4. Return Success
        return new Response(JSON.stringify({ success: true, userId: userId }), {
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
