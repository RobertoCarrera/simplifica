// @ts-nocheck
// ==============================================
// Edge Function: payment-integrations/test
// ==============================================
// Tests connection to payment providers (PayPal, Stripe)
// POST /payment-integrations/test
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
import { getClientIP } from "../_shared/security.ts";

const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "";
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error("[payment-integrations-test] ENCRYPTION_KEY must be at least 32 characters");
}

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

async function decrypt(encryptedBase64: string): Promise<{ success: boolean; data: string; error?: string }> {
  try {
    if (!encryptedBase64) {
      return { success: false, data: "", error: "No encrypted data provided" };
    }
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(ENCRYPTION_KEY.slice(0, 32));
    
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
      const modeText = isSandbox ? "SANDBOX" : "PRODUCCIÓN";
      const suggestion = isSandbox 
        ? "Verifica que usas credenciales de PayPal Developer (Sandbox)."
        : "Verifica que usas credenciales de tu cuenta PayPal Business (Live).";
      console.error('[payment-integrations-test] PayPal auth failed', { status: tokenRes.status, mode: modeText });
      return { 
        success: false, 
        error: `${error.error_description || "Error de autenticación PayPal"} (Modo: ${modeText}). ${suggestion}`,
        details: { 
          status: tokenRes.status, 
          mode: modeText
        }
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
    return { success: false, error: "PayPal connection failed" };
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
    return { success: false, error: "Stripe connection failed" };
  }
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Rate limiting: 10 req/min per IP (tests live payment provider connections — could exhaust API quotas)
  const ip = getClientIP(req);
  const rl = checkRateLimit(`payment-integrations-test:${ip}`, 10, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, ...getRateLimitHeaders(rl) },
    });
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
      .select("id, company_id, app_role:app_roles(name), active")
      .eq("auth_user_id", user.id)
      .single();

    if (!me?.company_id || !me.active || !["owner", "admin"].includes((me as any).app_role?.name)) {
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
        error: "Failed to decrypt credentials"
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
        error: "Invalid credentials format"
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
    console.error('[payment-integrations-test] Unhandled error:', e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: getCorsHeaders(req.headers.get("origin")),
    });
  }
});
