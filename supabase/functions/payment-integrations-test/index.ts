// @ts-nocheck
// ==============================================
// Edge Function: payment-integrations/test
// ==============================================
// Tests connection to payment providers (PayPal, Stripe)
// POST /payment-integrations/test
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod";

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (origin) {
    if (ALLOW_ALL_ORIGINS) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    } else if (ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }
  return headers;
}

async function decrypt(encryptedBase64: string): Promise<{ success: boolean; data: string; error?: string }> {
  try {
    if (!encryptedBase64) {
      return { success: false, data: "", error: "No encrypted data provided" };
    }
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    
    return { success: true, data: new TextDecoder().decode(decrypted) };
  } catch (e: any) {
    return { success: false, data: "", error: e?.message || "Decryption failed" };
  }
}

async function testPayPal(credentials: { clientId: string; clientSecret: string }, isSandbox: boolean): Promise<{ success: boolean; error?: string; details?: any }> {
  const baseUrl = isSandbox 
    ? "https://api-m.sandbox.paypal.com" 
    : "https://api-m.paypal.com";

  try {
    // Get access token
    const auth = btoa(`${credentials.clientId}:${credentials.clientSecret}`);
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      const error = await tokenRes.json();
      return { 
        success: false, 
        error: error.error_description || "Failed to authenticate with PayPal",
        details: { status: tokenRes.status }
      };
    }

    const tokenData = await tokenRes.json();
    
    return { 
      success: true, 
      details: { 
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        appId: tokenData.app_id,
        scope: tokenData.scope?.split(" ").slice(0, 3).join(", ") + "...",
      } 
    };
  } catch (e: any) {
    return { success: false, error: e.message || "Connection failed" };
  }
}

async function testStripe(credentials: { secretKey: string }, isSandbox: boolean): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    // Verify key format
    const expectedPrefix = isSandbox ? "sk_test_" : "sk_live_";
    if (!credentials.secretKey.startsWith(expectedPrefix)) {
      return { 
        success: false, 
        error: `La clave secreta debe empezar con ${expectedPrefix} para modo ${isSandbox ? 'test' : 'producción'}` 
      };
    }

    // Test API connection by fetching account info
    const res = await fetch("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${credentials.secretKey}`,
      },
    });

    if (!res.ok) {
      const error = await res.json();
      return { 
        success: false, 
        error: error.error?.message || "Failed to authenticate with Stripe",
        details: { status: res.status }
      };
    }

    const account = await res.json();
    
    return { 
      success: true, 
      details: { 
        businessName: account.business_profile?.name || account.email,
        country: account.country,
        currency: account.default_currency,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      } 
    };
  } catch (e: any) {
    return { success: false, error: e.message || "Connection failed" };
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: corsHeaders,
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Verify user
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Get user profile
    const { data: me } = await supabaseAdmin
      .from("users")
      .select("id, company_id, role, active")
      .eq("auth_user_id", user.id)
      .single();

    if (!me?.company_id || !me.active || !["owner", "admin"].includes(me.role)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const body = await req.json();
    const { company_id, provider } = body;

    if (!company_id || !provider) {
      return new Response(JSON.stringify({ error: "company_id and provider required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (company_id !== me.company_id) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Get integration
    const { data: integration, error: intErr } = await supabaseAdmin
      .from("payment_integrations")
      .select("*")
      .eq("company_id", company_id)
      .eq("provider", provider)
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: "Integration not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (!integration.credentials_encrypted) {
      return new Response(JSON.stringify({ error: "No credentials configured" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Decrypt credentials
    const decryptResult = await decrypt(integration.credentials_encrypted);
    if (!decryptResult.success) {
      return new Response(JSON.stringify({ 
        error: "Failed to decrypt credentials", 
        details: decryptResult.error 
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    let credentials;
    try {
      credentials = JSON.parse(decryptResult.data);
    } catch (parseErr: any) {
      return new Response(JSON.stringify({ 
        error: "Invalid credentials format", 
        details: parseErr?.message 
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Validate PayPal credentials before testing
    if (provider === "paypal") {
      if (!credentials.clientId || !credentials.clientSecret) {
        return new Response(JSON.stringify({ 
          error: "Credenciales PayPal incompletas. Asegúrate de haber guardado Client ID y Client Secret.",
          details: { 
            hasClientId: !!credentials.clientId, 
            hasClientSecret: !!credentials.clientSecret 
          }
        }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    let result;

    if (provider === "paypal") {
      result = await testPayPal(credentials, integration.is_sandbox);
    } else if (provider === "stripe") {
      result = await testStripe(credentials, integration.is_sandbox);
    } else {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Update verification status
    await supabaseAdmin
      .from("payment_integrations")
      .update({
        last_verified_at: new Date().toISOString(),
        verification_status: result.success ? "verified" : "failed",
      })
      .eq("id", integration.id);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), {
      status: 500,
      headers: getCorsHeaders(req.headers.get("origin")),
    });
  }
});
