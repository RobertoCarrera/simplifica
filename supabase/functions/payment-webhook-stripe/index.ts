// @ts-nocheck
// ==============================================
// Edge Function: payment-webhook-stripe
// ==============================================
// Receives Stripe webhook notifications for payment events
// POST /payment-webhook-stripe
// ==============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY");
if (!ENCRYPTION_KEY) {
  throw new Error("Missing ENCRYPTION_KEY");
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

// Verify Stripe webhook signature
async function verifyStripeWebhook(
  payload: string,
  signature: string,
  webhookSecret: string
): Promise<boolean> {
  try {
    const parts = signature.split(",");
    const timestamp = parts.find(p => p.startsWith("t="))?.slice(2);
    const sig = parts.find(p => p.startsWith("v1="))?.slice(3);

    if (!timestamp || !sig) return false;

    // Check timestamp is not too old (5 minutes tolerance)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp)) > 300) {
      console.error("[stripe-webhook] Timestamp too old");
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return sig === expectedSig;
  } catch (e) {
    console.error("[stripe-webhook] Verification error:", e);
    return false;
  }
}

/**
 * Check if company has Verifactu enabled and emit invoice to AEAT
 * This only creates the verifactu event if not already created
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
      console.log("[stripe-webhook] Verifactu not enabled or auto_emit off for company:", companyId);
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
      console.log("[stripe-webhook] Verifactu event already exists for invoice:", invoiceId);
      return;
    }

    // Get invoice data for verifactu
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error("[stripe-webhook] Error getting invoice for verifactu:", invoiceError);
      return;
    }

    // Check if invoice state allows emission (should be 'final' or we set it)
    if (invoice.state !== 'final') {
      // Update invoice to final state
      await supabase.from("invoices").update({ state: 'final' }).eq("id", invoiceId);
    }

    // Call finalize_invoice to create verifactu event properly
    const { error: finalizeError } = await supabase.rpc('finalize_invoice', {
      p_invoice_id: invoiceId,
      p_series: invoice.series || 'F',
      p_device_id: null,
      p_software_id: null
    });

    if (finalizeError) {
      console.error("[stripe-webhook] Error finalizing invoice for verifactu:", finalizeError);
      return;
    }

    console.log("[stripe-webhook] Verifactu event created for invoice:", invoiceId);
  } catch (e) {
    console.error("[stripe-webhook] Error in tryEmitToVerifactu:", e);
  }
}

serve(async (req) => {
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
    const stripeSignature = req.headers.get("stripe-signature");

    console.log("[stripe-webhook] Received event:", event.type);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Extract payment_link_token from metadata
    const paymentLinkToken = event.data?.object?.metadata?.payment_link_token;

    if (!paymentLinkToken) {
      console.log("[stripe-webhook] No payment_link_token in metadata, ignoring");
      return new Response(JSON.stringify({ received: true }), { status: 200, headers });
    }

    // Find invoice
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, company_id, total, payment_status")
      .eq("payment_link_token", paymentLinkToken)
      .single();

    if (invErr || !invoice) {
      console.error("[stripe-webhook] Invoice not found for token:", paymentLinkToken);
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers });
    }

    // Get Stripe integration for this company to verify webhook
    const { data: integration } = await supabase
      .from("payment_integrations")
      .select("*")
      .eq("company_id", invoice.company_id)
      .eq("provider", "stripe")
      .eq("is_active", true)
      .single();

    // FAIL CLOSED: Strict Signature Verification
    if (!integration || !integration.webhook_secret_encrypted) {
      console.error("[stripe-webhook] Missing integration or webhook secret for company:", invoice.company_id);
      return new Response(JSON.stringify({ error: "Configuration Error" }), { status: 500, headers });
    }

    if (!stripeSignature) {
      console.error("[stripe-webhook] Missing Stripe-Signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), { status: 401, headers });
    }

    const webhookSecret = await decrypt(integration.webhook_secret_encrypted);
    const isValid = await verifyStripeWebhook(body, stripeSignature, webhookSecret);

    if (!isValid) {
      console.error("[stripe-webhook] Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers });
    }

    const obj = event.data.object;

    // Process based on event type
    switch (event.type) {
      case "checkout.session.completed":
      case "payment_intent.succeeded": {
        const amount = (obj.amount_total || obj.amount || 0) / 100; // Stripe uses cents
        const externalId = obj.payment_intent || obj.id;

        // Record transaction
        await supabase.from("payment_transactions").insert({
          invoice_id: invoice.id,
          company_id: invoice.company_id,
          provider: "stripe",
          external_id: externalId,
          amount,
          currency: (obj.currency || "eur").toUpperCase(),
          status: "completed",
          provider_response: event,
        });

        // Update invoice payment status
        await supabase.from("invoices").update({
          payment_status: "paid",
          payment_method: "stripe",
          payment_date: new Date().toISOString(),
          payment_reference: externalId,
        }).eq("id", invoice.id);

        console.log("[stripe-webhook] Payment completed for invoice:", invoice.id);

        // Check if company has Verifactu enabled and invoice should be emitted
        await tryEmitToVerifactu(supabase, invoice.id, invoice.company_id);
        
        break;
      }

      case "payment_intent.payment_failed": {
        await supabase.from("payment_transactions").insert({
          invoice_id: invoice.id,
          company_id: invoice.company_id,
          provider: "stripe",
          external_id: obj.id,
          amount: (obj.amount || 0) / 100,
          currency: (obj.currency || "eur").toUpperCase(),
          status: "failed",
          provider_response: event,
        });

        console.log("[stripe-webhook] Payment failed for invoice:", invoice.id);
        break;
      }

      case "charge.refunded": {
        const refundAmount = (obj.amount_refunded || 0) / 100;

        await supabase.from("payment_transactions").insert({
          invoice_id: invoice.id,
          company_id: invoice.company_id,
          provider: "stripe",
          external_id: obj.id,
          amount: -refundAmount,
          currency: (obj.currency || "eur").toUpperCase(),
          status: "refunded",
          provider_response: event,
        });

        await supabase.from("invoices").update({
          payment_status: "refunded",
        }).eq("id", invoice.id);

        console.log("[stripe-webhook] Refund processed for invoice:", invoice.id);
        break;
      }

      default:
        console.log("[stripe-webhook] Unhandled event type:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200, headers });

  } catch (e: any) {
    console.error("[stripe-webhook] Error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers });
  }
});
