// @ts-nocheck
// supabase/functions/public-payment-redirect/index.ts
// Redirects the user to the payment provider (PayPal/Stripe)
// This endpoint does NOT require authentication but validates the token

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// AES-GCM decryption helper
async function decryptCredentials(encryptedData: string, encryptionKey: string): Promise<Record<string, string>> {
  const keyData = new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// Get PayPal access token
async function getPayPalAccessToken(clientId: string, clientSecret: string, isSandbox: boolean): Promise<string> {
  const baseUrl = isSandbox 
    ? "https://api-m.sandbox.paypal.com" 
    : "https://api-m.paypal.com";

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${clientId}:${clientSecret}`),
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal auth failed: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Create PayPal order
async function createPayPalOrder(
  accessToken: string,
  isSandbox: boolean,
  invoice: any,
  returnUrl: string,
  cancelUrl: string
): Promise<string> {
  const baseUrl = isSandbox 
    ? "https://api-m.sandbox.paypal.com" 
    : "https://api-m.paypal.com";

  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: invoice.id,
      description: `Factura ${invoice.full_invoice_number || invoice.invoice_number}`,
      custom_id: `invoice_${invoice.payment_link_token}`,
      amount: {
        currency_code: invoice.currency || "EUR",
        value: invoice.total.toFixed(2),
      },
    }],
    application_context: {
      return_url: returnUrl,
      cancel_url: cancelUrl,
      brand_name: invoice.company_name || "Simplifica",
      landing_page: "BILLING",
      user_action: "PAY_NOW",
    },
  };

  const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify(orderPayload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal order creation failed: ${text}`);
  }

  const order = await response.json();
  const approveLink = order.links?.find((l: any) => l.rel === "approve")?.href;
  
  if (!approveLink) {
    throw new Error("No PayPal approval link returned");
  }

  return approveLink;
}

// Create Stripe checkout session
async function createStripeCheckoutSession(
  secretKey: string,
  invoice: any,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const params = new URLSearchParams();
  params.append("payment_method_types[0]", "card");
  params.append("mode", "payment");
  params.append("success_url", successUrl);
  params.append("cancel_url", cancelUrl);
  params.append("line_items[0][price_data][currency]", (invoice.currency || "EUR").toLowerCase());
  params.append("line_items[0][price_data][unit_amount]", Math.round(invoice.total * 100).toString());
  params.append("line_items[0][price_data][product_data][name]", `Factura ${invoice.full_invoice_number || invoice.invoice_number}`);
  params.append("line_items[0][quantity]", "1");
  params.append("metadata[invoice_id]", invoice.id);
  params.append("metadata[payment_link_token]", invoice.payment_link_token);
  params.append("client_reference_id", invoice.id);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stripe session creation failed: ${text}`);
  }

  const session = await response.json();
  return session.url;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { token, provider: requestedProvider } = body;

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token de pago no proporcionado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find invoice by payment_link_token
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        full_invoice_number,
        total,
        currency,
        payment_status,
        payment_link_token,
        payment_link_expires_at,
        payment_link_provider,
        company_id
      `)
      .eq("payment_link_token", token)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Enlace de pago no válido" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already paid
    if (invoice.payment_status === "paid") {
      return new Response(
        JSON.stringify({ error: "Esta factura ya ha sido pagada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (invoice.payment_link_expires_at && new Date(invoice.payment_link_expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "El enlace de pago ha expirado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use requested provider or fall back to invoice's configured provider
    const provider = requestedProvider || invoice.payment_link_provider || "paypal";

    // Handle local/cash payment specially
    if (provider === "local") {
      // Update invoice to indicate local payment was selected
      const { error: updateError } = await supabase
        .from("invoices")
        .update({
          payment_status: "pending_local",
          updated_at: new Date().toISOString()
        })
        .eq("id", invoice.id);

      if (updateError) {
        console.error("[public-payment-redirect] Error updating invoice for local payment:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al procesar la solicitud de pago" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return success without redirect URL for local payment
      return new Response(
        JSON.stringify({ 
          success: true,
          message: "Tu solicitud de pago en efectivo ha sido registrada. El negocio se pondrá en contacto contigo para coordinar el pago.",
          payment_method: "local"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get payment integration for online providers (PayPal, Stripe)
    const { data: integration, error: integrationError } = await supabase
      .from("payment_integrations")
      .select("*")
      .eq("company_id", invoice.company_id)
      .eq("provider", provider)
      .eq("is_active", true)
      .single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ error: "Pasarela de pago no configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decrypt credentials
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({ error: "Error de configuración del servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await decryptCredentials(integration.credentials_encrypted, encryptionKey);

    // Get company name for branding
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", invoice.company_id)
      .single();

    // Base URLs for redirects
    const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl.replace('.supabase.co', '.vercel.app');
    const returnUrl = `${publicSiteUrl}/pago/${token}/completado`;
    const cancelUrl = `${publicSiteUrl}/pago/${token}/cancelado`;

    let paymentUrl: string;

    if (provider === "paypal") {
      const { clientId, clientSecret } = credentials;
      const accessToken = await getPayPalAccessToken(clientId, clientSecret, integration.is_sandbox);
      paymentUrl = await createPayPalOrder(
        accessToken,
        integration.is_sandbox,
        { ...invoice, company_name: company?.name },
        returnUrl,
        cancelUrl
      );
    } else {
      // Stripe
      const { secretKey } = credentials;
      paymentUrl = await createStripeCheckoutSession(
        secretKey,
        invoice,
        returnUrl,
        cancelUrl
      );
    }

    return new Response(
      JSON.stringify({ payment_url: paymentUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[public-payment-redirect] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Error al procesar el pago" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
