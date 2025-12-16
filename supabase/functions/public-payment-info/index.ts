// @ts-nocheck
// supabase/functions/public-payment-info/index.ts
// Returns public payment information for a given payment token
// This endpoint does NOT require authentication

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Allow GET and POST
    if (req.method !== "GET" && req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get token from query params (GET) or body (POST)
    let token: string | null = null;
    
    if (req.method === "GET") {
      const url = new URL(req.url);
      token = url.searchParams.get("token");
    } else {
      // POST - get from body
      try {
        const body = await req.json();
        token = body.token || null;
      } catch {
        // If body parsing fails, try query params as fallback
        const url = new URL(req.url);
        token = url.searchParams.get("token");
      }
    }

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

    // Get company settings for local payment option
    const { data: companySettings } = await supabase
      .from("company_settings")
      .select("allow_local_payment")
      .eq("company_id", invoice.company_id)
      .maybeSingle();

    const allowLocalPayment = companySettings?.allow_local_payment ?? false;

    // Get ALL active payment integrations for this company
    const { data: integrations } = await supabase
      .from("payment_integrations")
      .select("provider, is_active, is_sandbox")
      .eq("company_id", invoice.company_id)
      .eq("is_active", true);

    // Build available payment options
    interface PaymentOption {
      provider: string;
      label: string;
      icon: string;
      iconClass: string;
      buttonClass: string;
      available: boolean;
    }
    
    const paymentOptions: PaymentOption[] = [];

    // Check for Stripe
    const stripeIntegration = integrations?.find(i => i.provider === 'stripe');
    if (stripeIntegration) {
      paymentOptions.push({
        provider: 'stripe',
        label: 'Pagar con Tarjeta (Stripe)',
        icon: 'fab fa-stripe',
        iconClass: 'text-white',
        buttonClass: 'bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white',
        available: true,
      });
    }

    // Check for PayPal
    const paypalIntegration = integrations?.find(i => i.provider === 'paypal');
    if (paypalIntegration) {
      paymentOptions.push({
        provider: 'paypal',
        label: 'Pagar con PayPal',
        icon: 'fab fa-paypal',
        iconClass: 'text-white',
        buttonClass: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white',
        available: true,
      });
    }

    // Check for local payment option
    if (allowLocalPayment) {
      paymentOptions.push({
        provider: 'local',
        label: 'Pagar en Local / Efectivo',
        icon: 'fas fa-money-bill-wave',
        iconClass: 'text-white',
        buttonClass: 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white',
        available: true,
      });
    }

    // Fallback provider for backwards compatibility
    const provider = invoice.payment_link_provider || (paypalIntegration ? "paypal" : stripeIntegration ? "stripe" : "local");

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
        payment_url: "", // Generated on demand
        expires_at: invoice.payment_link_expires_at,
        is_expired: isExpired,
      },
      payment_options: paymentOptions,
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
