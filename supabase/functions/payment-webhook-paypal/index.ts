// @ts-nocheck
// ==============================================
// Edge Function: payment-webhook-paypal
// ==============================================
// Receives PayPal webhook notifications for payment events
// POST /payment-webhook-paypal
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "";
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error("[paypal-webhook] ENCRYPTION_KEY must be at least 32 characters");
}

// PayPal webhook event types we care about
const PAYMENT_COMPLETED_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
];

const PAYMENT_FAILED_EVENTS = [
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.DECLINED",
];

const REFUND_EVENTS = [
  "PAYMENT.CAPTURE.REFUNDED",
];

async function decrypt(encryptedBase64: string): Promise<string> {
  try {
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
    
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

// Verify PayPal webhook signature
async function verifyPayPalWebhook(
  req: Request,
  body: string,
  webhookId: string,
  clientId: string,
  clientSecret: string,
  isSandbox: boolean
): Promise<boolean> {
  const baseUrl = isSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  try {
    // Get access token
    const auth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      console.error("[paypal-webhook] Failed to get access token");
      return false;
    }

    const { access_token } = await tokenRes.json();

    // Verify webhook signature
    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: req.headers.get("paypal-auth-algo"),
        cert_url: req.headers.get("paypal-cert-url"),
        transmission_id: req.headers.get("paypal-transmission-id"),
        transmission_sig: req.headers.get("paypal-transmission-sig"),
        transmission_time: req.headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      }),
    });

    if (!verifyRes.ok) {
      console.error("[paypal-webhook] Signature verification failed");
      return false;
    }

    const verifyData = await verifyRes.json();
    return verifyData.verification_status === "SUCCESS";
  } catch (e) {
    console.error("[paypal-webhook] Verification error:", e);
    return false;
  }
}

/**
 * Check if company has Verifactu enabled and emit invoice to AEAT
 */
async function tryEmitToVerifactu(supabase: any, invoiceId: string, companyId: string): Promise<void> {
  try {
    // Check if company has Verifactu enabled
    const { data: settings } = await supabase
      .from("verifactu_settings")
      .select("is_active, auto_emit")
      .eq("company_id", companyId)
      .single();

    if (!settings?.is_active || !settings?.auto_emit) {
      console.log("[paypal-webhook] Verifactu not enabled or auto_emit off for company:", companyId);
      return;
    }

    // Check if invoice already has verifactu event
    const { data: existingEvent } = await supabase
      .from("verifactu.events")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("event_type", "alta")
      .single();

    if (existingEvent) {
      console.log("[paypal-webhook] Verifactu event already exists for invoice:", invoiceId);
      return;
    }

    // Get invoice data for verifactu
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error("[paypal-webhook] Error getting invoice for verifactu:", invoiceError);
      return;
    }

    // Check if invoice state allows emission
    if (invoice.state !== 'final') {
      await supabase.from("invoices").update({ state: 'final' }).eq("id", invoiceId);
    }

    // Call finalize_invoice to create verifactu event
    const { error: finalizeError } = await supabase.rpc('finalize_invoice', {
      p_invoice_id: invoiceId,
      p_series: invoice.series || 'F',
      p_device_id: null,
      p_software_id: null
    });

    if (finalizeError) {
      console.error("[paypal-webhook] Error finalizing invoice for verifactu:", finalizeError);
      return;
    }

    console.log("[paypal-webhook] Verifactu event created for invoice:", invoiceId);
  } catch (e) {
    console.error("[paypal-webhook] Error in tryEmitToVerifactu:", e);
  }
}

serve(async (req) => {
  // PayPal webhooks don't need CORS - they come from PayPal servers
  const headers = { "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  try {
    const body = await req.text();
    const event = JSON.parse(body);

    console.log("[paypal-webhook] Received event:", event.event_type);

    // Extract invoice token from custom_id or resource metadata
    const resource = event.resource || {};
    const customId = resource.custom_id || 
                     resource.purchase_units?.[0]?.custom_id ||
                     resource.supplementary_data?.related_ids?.order_id;
    
    if (!customId) {
      console.log("[paypal-webhook] No custom_id found, ignoring event");
      return new Response(JSON.stringify({ received: true }), { status: 200, headers });
    }

    // custom_id format: "invoice_{payment_link_token}"
    const paymentLinkToken = customId.replace("invoice_", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Find invoice by payment_link_token
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, company_id, total, payment_status")
      .eq("payment_link_token", paymentLinkToken)
      .single();

    if (invErr || !invoice) {
      console.error("[paypal-webhook] Invoice not found for token:", paymentLinkToken?.slice(0, 8) + '...');
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers });
    }

    // Get PayPal integration for this company to verify webhook
    const { data: integration } = await supabase
      .from("payment_integrations")
      .select("*")
      .eq("company_id", invoice.company_id)
      .eq("provider", "paypal")
      .eq("is_active", true)
      .single();

    if (!integration?.webhook_secret_encrypted || !integration?.credentials_encrypted) {
      console.error("[paypal-webhook] Missing webhook secret or credentials for company:", invoice.company_id);
      return new Response(JSON.stringify({ error: "Webhook verification not configured" }), { status: 403, headers });
    }

    {
      // Verify webhook signature
      const webhookSecret = await decrypt(integration.webhook_secret_encrypted);
      const credentials = JSON.parse(await decrypt(integration.credentials_encrypted));
      
      const isValid = await verifyPayPalWebhook(
        req, 
        body, 
        webhookSecret, 
        credentials.clientId, 
        credentials.clientSecret,
        integration.is_sandbox
      );

      if (!isValid) {
        console.error("[paypal-webhook] Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers });
      }
    }

    // Process based on event type
    if (PAYMENT_COMPLETED_EVENTS.includes(event.event_type)) {
      const amount = parseFloat(resource.amount?.value || resource.purchase_units?.[0]?.amount?.value || "0");
      const externalId = resource.id || event.id;

      // SECURITY: Reject NaN/Infinity/negative amounts
      if (!Number.isFinite(amount) || amount <= 0) {
        console.error(`[paypal-webhook] Invalid amount value: ${amount}`);
        return new Response(JSON.stringify({ error: "Invalid payment amount" }), { status: 400, headers });
      }

      // SECURITY: Verify payment amount matches invoice total (tolerance: 1 cent)
      if (invoice.total != null && Math.abs(amount - invoice.total) > 0.01) {
        console.error(`[paypal-webhook] Amount mismatch: received ${amount}, expected ${invoice.total} for invoice ${invoice.id}`);
        return new Response(JSON.stringify({ error: "Payment amount does not match invoice total" }), { status: 400, headers });
      }

      // Idempotency: skip if this external_id was already processed
      const { data: existingTx } = await supabase
        .from("payment_transactions")
        .select("id")
        .eq("external_id", externalId)
        .eq("provider", "paypal")
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();
      if (existingTx) {
        console.log("[paypal-webhook] Duplicate event, already processed:", externalId);
        return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers });
      }

      // Record transaction (upsert for idempotency against race conditions)
      const { error: txErr } = await supabase.from("payment_transactions").upsert({
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        provider: "paypal",
        external_id: externalId,
        amount,
        currency: resource.amount?.currency_code || "EUR",
        status: "completed",
        provider_response: event,
      }, { onConflict: 'external_id,provider', ignoreDuplicates: true });
      if (txErr) console.warn('[paypal-webhook] tx upsert warning:', txErr.message);

      // Update invoice payment status (guard: only if not already paid)
      await supabase.from("invoices").update({
        payment_status: "paid",
        payment_method: "paypal",
        payment_date: new Date().toISOString(),
        payment_reference: externalId,
      }).eq("id", invoice.id).neq("payment_status", "paid");

      console.log("[paypal-webhook] Payment completed for invoice:", invoice.id);

      // Check if company has Verifactu enabled and emit invoice
      await tryEmitToVerifactu(supabase, invoice.id, invoice.company_id);

    } else if (PAYMENT_FAILED_EVENTS.includes(event.event_type)) {
      await supabase.from("payment_transactions").upsert({
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        provider: "paypal",
        external_id: resource.id || event.id,
        amount: parseFloat(resource.amount?.value || "0"),
        currency: resource.amount?.currency_code || "EUR",
        status: "failed",
        provider_response: event,
      }, { onConflict: 'external_id,provider', ignoreDuplicates: true });

      console.log("[paypal-webhook] Payment failed for invoice:", invoice.id);

    } else if (REFUND_EVENTS.includes(event.event_type)) {
      await supabase.from("payment_transactions").upsert({
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        provider: "paypal",
        external_id: resource.id || event.id,
        amount: -parseFloat(resource.amount?.value || "0"),
        currency: resource.amount?.currency_code || "EUR",
        status: "refunded",
        provider_response: event,
      }, { onConflict: 'external_id,provider', ignoreDuplicates: true });

      await supabase.from("invoices").update({
        payment_status: "refunded",
      }).eq("id", invoice.id).neq("payment_status", "refunded");

      console.log("[paypal-webhook] Refund processed for invoice:", invoice.id);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers });

  } catch (e: any) {
    console.error("[paypal-webhook] Error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
