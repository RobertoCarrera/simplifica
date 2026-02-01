// @ts-nocheck
// ==============================================
// Edge Function: create-payment-link
// ==============================================
// Creates a payment link for an invoice (PayPal or Stripe checkout)
// POST /create-payment-link
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod";
const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://app.simplificacrm.es";

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

function generateToken(): string {
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// Create PayPal Order
async function createPayPalOrder(
  credentials: { clientId: string; clientSecret: string },
  isSandbox: boolean,
  invoice: any,
  paymentToken: string,
  returnUrl: string,
  cancelUrl: string
): Promise<{ orderId: string; approvalUrl: string } | { error: string }> {
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
      return { error: "Error autenticando con PayPal" };
    }

    const { access_token } = await tokenRes.json();

    // Create order
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: invoice.id,
          custom_id: `invoice_${paymentToken}`,
          description: `Factura ${invoice.invoice_number}`,
          amount: {
            currency_code: "EUR",
            value: invoice.total.toFixed(2),
          },
        }],
        application_context: {
          brand_name: invoice.company_name || "Simplifica",
          locale: "es-ES",
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.json();
      console.error("[create-payment-link] PayPal order error:", err);
      return { error: "Error creando orden en PayPal" };
    }

    const order = await orderRes.json();
    const approvalUrl = order.links?.find((l: any) => l.rel === "approve")?.href;

    return { orderId: order.id, approvalUrl };
  } catch (e: any) {
    console.error("[create-payment-link] PayPal error:", e);
    return { error: e.message || "Error con PayPal" };
  }
}

// Create Stripe Checkout Session
async function createStripeCheckout(
  credentials: { secretKey: string; publishableKey?: string },
  isSandbox: boolean,
  invoice: any,
  paymentToken: string,
  returnUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; checkoutUrl: string } | { error: string }> {
  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "payment",
        "success_url": returnUrl,
        "cancel_url": cancelUrl,
        "line_items[0][price_data][currency]": "eur",
        "line_items[0][price_data][product_data][name]": `Factura ${invoice.invoice_number}`,
        "line_items[0][price_data][product_data][description]": invoice.client_name || "Pago de factura",
        "line_items[0][price_data][unit_amount]": Math.round(invoice.total * 100).toString(),
        "line_items[0][quantity]": "1",
        "metadata[payment_link_token]": paymentToken,
        "metadata[invoice_id]": invoice.id,
        "customer_email": invoice.client_email || "",
        "locale": "es",
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("[create-payment-link] Stripe error:", err);
      return { error: err.error?.message || "Error creando sesión en Stripe" };
    }

    const session = await response.json();
    return { sessionId: session.id, checkoutUrl: session.url };
  } catch (e: any) {
    console.error("[create-payment-link] Stripe error:", e);
    return { error: e.message || "Error con Stripe" };
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
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Verify user
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Get user profile
    const { data: me } = await supabase
      .from("users")
      .select("id, company_id, active")
      .eq("auth_user_id", user.id)
      .single();

    if (!me?.company_id || !me.active) {
      return new Response(JSON.stringify({ error: "User not found or inactive" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const body = await req.json();
    const { invoice_id, provider, expires_in_days = 7 } = body;

    if (!invoice_id || !provider) {
      return new Response(JSON.stringify({ error: "invoice_id and provider required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!["paypal", "stripe"].includes(provider)) {
      return new Response(JSON.stringify({ error: "Invalid provider" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, total, payment_status, payment_link_token,
        company_id, client_id,
        clients!inner(name, email),
        companies!inner(name)
      `)
      .eq("id", invoice_id)
      .eq("company_id", me.company_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (invoice.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "Invoice already paid" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get payment integration
    const { data: integration, error: intErr } = await supabase
      .from("payment_integrations")
      .select("*")
      .eq("company_id", me.company_id)
      .eq("provider", provider)
      .eq("is_active", true)
      .single();

    if (intErr || !integration) {
      return new Response(JSON.stringify({ error: `No hay integración activa de ${provider}` }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Decrypt credentials
    const credentials = JSON.parse(await decrypt(integration.credentials_encrypted));

    // Generate or reuse payment token
    let paymentToken = invoice.payment_link_token;
    if (!paymentToken) {
      paymentToken = generateToken();
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expires_in_days);

    // Prepare invoice data for providers
    const invoiceData = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      total: invoice.total,
      client_name: invoice.clients?.name,
      client_email: invoice.clients?.email,
      company_name: invoice.companies?.name,
    };

    // URLs for redirect after payment
    const returnUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=success`;
    const cancelUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=cancelled`;

    let result;

    if (provider === "paypal") {
      result = await createPayPalOrder(
        credentials,
        integration.is_sandbox,
        invoiceData,
        paymentToken,
        returnUrl,
        cancelUrl
      );
    } else {
      result = await createStripeCheckout(
        credentials,
        integration.is_sandbox,
        invoiceData,
        paymentToken,
        returnUrl,
        cancelUrl
      );
    }

    if ("error" in result) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Update invoice with payment link token and provider
    await supabase.from("invoices").update({
      payment_link_token: paymentToken,
      payment_link_expires_at: expiresAt.toISOString(),
      payment_link_provider: provider,
    }).eq("id", invoice.id);

    // Return appropriate URL based on provider
    const paymentUrl = provider === "paypal" 
      ? (result as any).approvalUrl 
      : (result as any).checkoutUrl;

    // Also return a generic link that can be shared
    const shareableLink = `${PUBLIC_SITE_URL}/pago/${paymentToken}`;

    return new Response(JSON.stringify({
      success: true,
      payment_url: paymentUrl,
      shareable_link: shareableLink,
      token: paymentToken,
      expires_at: expiresAt.toISOString(),
      provider,
    }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (e: any) {
    console.error("[create-payment-link] Error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), {
      status: 500,
      headers: getCorsHeaders(req.headers.get("origin")),
    });
  }
});
