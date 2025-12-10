// @ts-nocheck
// supabase/functions/public-payment-info/index.ts
// Returns public payment information for a given payment token
// This endpoint does NOT require authentication

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow GET
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get token from query params
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token de pago no proporcionado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role (to bypass RLS)
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
        due_date,
        payment_status,
        payment_link_token,
        payment_link_expires_at,
        payment_link_provider,
        company_id,
        client_id
      `)
      .eq("payment_link_token", token)
      .single();

    if (invoiceError || !invoice) {
      console.log("[public-payment-info] Invoice not found for token:", token);
      return new Response(
        JSON.stringify({ error: "Enlace de pago no válido o expirado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get company info
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, logo_url")
      .eq("id", invoice.company_id)
      .single();

    if (companyError || !company) {
      console.error("[public-payment-info] Company not found:", companyError);
      return new Response(
        JSON.stringify({ error: "Información de empresa no encontrada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name, email")
      .eq("id", invoice.client_id)
      .single();

    if (clientError) {
      console.warn("[public-payment-info] Client not found:", clientError);
      // Continue with minimal client info
    }

    // Check if link is expired
    const isExpired = invoice.payment_link_expires_at 
      ? new Date(invoice.payment_link_expires_at) < new Date()
      : false;

    // Get payment URL from payment integrations
    let paymentUrl = "";
    const provider = invoice.payment_link_provider || "paypal";

    // If not expired and not paid, we need to get/regenerate payment URL
    if (!isExpired && invoice.payment_status !== "paid") {
      const { data: integration, error: integrationError } = await supabase
        .from("payment_integrations")
        .select("*")
        .eq("company_id", invoice.company_id)
        .eq("provider", provider)
        .eq("is_active", true)
        .single();

      if (!integrationError && integration) {
        // For now, we store the payment URL when generating the link
        // In a real implementation, you might regenerate or verify the URL here
        // The payment URL should be stored or we regenerate it
        
        // Check if we have a cached payment URL (could be stored in a separate table or cache)
        // For simplicity, we'll construct the public payment page URL
        const publicPaymentPageUrl = `${Deno.env.get("PUBLIC_SITE_URL") || supabaseUrl.replace('.supabase.co', '.vercel.app')}/pago/${token}`;
        
        // The actual redirect URL to PayPal/Stripe should be fetched when user clicks "Pay"
        // For now, we'll regenerate it on demand
        paymentUrl = publicPaymentPageUrl; // This will be overridden by actual provider URL
      }
    }

    // Return public payment info (no sensitive data)
    const response = {
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        full_invoice_number: invoice.full_invoice_number,
        total: invoice.total,
        currency: invoice.currency || "EUR",
        due_date: invoice.due_date,
        payment_status: invoice.payment_status || "pending",
      },
      company: {
        name: company.name,
        logo_url: company.logo_url,
      },
      client: {
        name: client?.name || "Cliente",
        email: client?.email,
      },
      payment: {
        provider: provider,
        payment_url: paymentUrl,
        expires_at: invoice.payment_link_expires_at,
        is_expired: isExpired,
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[public-payment-info] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
