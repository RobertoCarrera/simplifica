// @ts-nocheck
// ==============================================
// Edge Function: payment-integrations
// ==============================================
// Manages payment provider integrations (PayPal, Stripe)
// - GET: List integrations for a company (credentials masked)
// - POST: Save/update integration
// - DELETE: Remove integration
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod";

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin);
}

// Simple encryption/decryption (in production, use proper encryption)
async function encrypt(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
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
    
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

function maskCredential(value: string): string {
  if (!value || value.length < 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
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
    const { data: me, error: meErr } = await supabaseAdmin
      .from("users")
      .select("id, company_id, role, active")
      .eq("auth_user_id", user.id)
      .single();

    if (meErr || !me?.company_id || !me.active) {
      return new Response(JSON.stringify({ error: "User not found or inactive" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Only owner/admin can manage payment integrations
    if (!["owner", "admin"].includes(me.role)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const url = new URL(req.url);

    // GET: List integrations
    if (req.method === "GET") {
      const companyId = url.searchParams.get("company_id") || me.company_id;
      
      // Verify user has access to this company
      if (companyId !== me.company_id) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: corsHeaders,
        });
      }

      const { data: integrations, error: intErr } = await supabaseAdmin
        .from("payment_integrations")
        .select("*")
        .eq("company_id", companyId);

      if (intErr) {
        return new Response(JSON.stringify({ error: intErr.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      // Mask credentials before returning
      const masked = await Promise.all((integrations || []).map(async (int) => {
        let credentials_masked = {};
        if (int.credentials_encrypted) {
          try {
            const decrypted = await decrypt(int.credentials_encrypted);
            const creds = JSON.parse(decrypted);
            if (int.provider === "paypal") {
              credentials_masked = {
                clientId: maskCredential(creds.clientId || ""),
              };
            } else if (int.provider === "stripe") {
              credentials_masked = {
                publishableKey: maskCredential(creds.publishableKey || ""),
              };
            }
          } catch {
            credentials_masked = {};
          }
        }
        return {
          id: int.id,
          company_id: int.company_id,
          provider: int.provider,
          is_active: int.is_active,
          is_sandbox: int.is_sandbox,
          credentials_masked,
          webhook_url: int.webhook_url,
          last_verified_at: int.last_verified_at,
          verification_status: int.verification_status,
          created_at: int.created_at,
          updated_at: int.updated_at,
        };
      }));

      return new Response(JSON.stringify({ integrations: masked }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // POST: Save/update integration
    if (req.method === "POST") {
      const body = await req.json();
      const { company_id, provider, credentials, webhook_secret, is_sandbox, is_active } = body;

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

      if (!["paypal", "stripe"].includes(provider)) {
        return new Response(JSON.stringify({ error: "Invalid provider" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Check if integration exists
      const { data: existing } = await supabaseAdmin
        .from("payment_integrations")
        .select("id, credentials_encrypted")
        .eq("company_id", company_id)
        .eq("provider", provider)
        .single();

      let credentials_encrypted = existing?.credentials_encrypted;
      
      // If new credentials provided, encrypt them
      if (credentials && Object.keys(credentials).length > 0) {
        // Clean whitespace from all credential values
        const cleanedCreds: Record<string, string> = {};
        for (const [k, v] of Object.entries(credentials)) {
          if (typeof v === 'string') {
            cleanedCreds[k] = v.trim();
          }
        }

        // Merge with existing if partial update
        let mergedCreds = cleanedCreds;
        if (existing?.credentials_encrypted) {
          try {
            const existingCreds = JSON.parse(await decrypt(existing.credentials_encrypted));
            mergedCreds = { ...existingCreds, ...cleanedCreds };
          } catch {
            // Use new credentials only
          }
        }
        
        // Validate required fields for PayPal
        if (provider === "paypal") {
          if (!mergedCreds.clientId || !mergedCreds.clientSecret) {
            return new Response(JSON.stringify({ 
              error: "PayPal requiere Client ID y Client Secret" 
            }), {
              status: 400,
              headers: corsHeaders,
            });
          }
        }
        
        // Validate required fields for Stripe
        if (provider === "stripe") {
          if (!mergedCreds.secretKey) {
            return new Response(JSON.stringify({ 
              error: "Stripe requiere Secret Key" 
            }), {
              status: 400,
              headers: corsHeaders,
            });
          }
        }
        
        credentials_encrypted = await encrypt(JSON.stringify(mergedCreds));
      }

      let webhook_secret_encrypted = null;
      if (webhook_secret) {
        webhook_secret_encrypted = await encrypt(webhook_secret);
      }

      const payload: any = {
        company_id,
        provider,
        updated_at: new Date().toISOString(),
      };

      if (credentials_encrypted) payload.credentials_encrypted = credentials_encrypted;
      if (webhook_secret_encrypted) payload.webhook_secret_encrypted = webhook_secret_encrypted;
      if (typeof is_sandbox === "boolean") payload.is_sandbox = is_sandbox;
      if (typeof is_active === "boolean") payload.is_active = is_active;

      if (existing) {
        // Update
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from("payment_integrations")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();

        if (updateErr) {
          return new Response(JSON.stringify({ error: updateErr.message }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        return new Response(JSON.stringify({ integration: { ...updated, credentials_encrypted: undefined } }), {
          status: 200,
          headers: corsHeaders,
        });
      } else {
        // Insert - require credentials for new integrations
        if (!credentials_encrypted) {
          return new Response(JSON.stringify({ 
            error: "Las credenciales son requeridas para crear una nueva integración" 
          }), {
            status: 400,
            headers: corsHeaders,
          });
        }
        payload.created_at = new Date().toISOString();
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from("payment_integrations")
          .insert(payload)
          .select()
          .single();

        if (insertErr) {
          return new Response(JSON.stringify({ error: insertErr.message }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        return new Response(JSON.stringify({ integration: { ...inserted, credentials_encrypted: undefined } }), {
          status: 201,
          headers: corsHeaders,
        });
      }
    }

    // DELETE: Remove integration
    if (req.method === "DELETE") {
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

      const { error: deleteErr } = await supabaseAdmin
        .from("payment_integrations")
        .delete()
        .eq("company_id", company_id)
        .eq("provider", provider);

      if (deleteErr) {
        return new Response(JSON.stringify({ error: deleteErr.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error", details: e?.message }), {
      status: 500,
      headers: getCorsHeaders(req.headers.get("origin")),
    });
  }
});
