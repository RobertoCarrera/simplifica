import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://simplifica.digitalizamostupyme.es"
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY") || "default-dev-key-change-in-prod"

// Decrypt payment credentials
async function decrypt(encryptedBase64: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const keyData = encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32))
    
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    )
    
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    )
    
    return new TextDecoder().decode(decrypted)
  } catch {
    return ""
  }
}

function generateToken(): string {
  const array = new Uint8Array(24)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("")
}

// Create PayPal Order
async function createPayPalOrder(
  credentials: { clientId: string; clientSecret: string },
  isSandbox: boolean,
  invoice: any,
  paymentToken: string
): Promise<{ approvalUrl: string } | { error: string }> {
  const baseUrl = isSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com"

  const returnUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=success`
  const cancelUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=cancelled`

  try {
    const auth = btoa(`${credentials.clientId}:${credentials.clientSecret}`)
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })

    if (!tokenRes.ok) {
      return { error: "Error autenticando con PayPal" }
    }

    const { access_token } = await tokenRes.json()

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
    })

    if (!orderRes.ok) {
      console.error("[client-request-service] PayPal order error")
      return { error: "Error creando orden en PayPal" }
    }

    const order = await orderRes.json()
    const approvalUrl = order.links?.find((l: any) => l.rel === "approve")?.href

    return { approvalUrl }
  } catch (e: any) {
    console.error("[client-request-service] PayPal error:", e)
    return { error: e.message || "Error con PayPal" }
  }
}

// Create Stripe Checkout Session
async function createStripeCheckout(
  credentials: { secretKey: string },
  invoice: any,
  paymentToken: string
): Promise<{ checkoutUrl: string } | { error: string }> {
  const returnUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=success`
  const cancelUrl = `${PUBLIC_SITE_URL}/pago/${paymentToken}?status=cancelled`

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
        "line_items[0][price_data][unit_amount]": Math.round(invoice.total * 100).toString(),
        "line_items[0][quantity]": "1",
        "metadata[payment_link_token]": paymentToken,
        "metadata[invoice_id]": invoice.id,
        "customer_email": invoice.client_email || "",
        "locale": "es",
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      console.error("[client-request-service] Stripe error:", err)
      return { error: err.error?.message || "Error creando sesión en Stripe" }
    }

    const session = await response.json()
    return { checkoutUrl: session.url }
  } catch (e: any) {
    console.error("[client-request-service] Stripe error:", e)
    return { error: e.message || "Error con Stripe" }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }
    
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { serviceId, variantId, action } = await req.json()

    if (!serviceId || !['request', 'contract'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get client_id and company_id from clients table using auth_user_id
    const { data: client } = await supabase
      .from('clients')
      .select('id, company_id, name, email')
      .eq('auth_user_id', user.id)
      .single()

    if (!client?.id || !client?.company_id) {
      return new Response(
        JSON.stringify({ error: 'User has no associated client profile or company' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const clientId = client.id
    const companyId = client.company_id

    // Get company settings for tax configuration
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('default_tax_rate, default_irpf_rate, prices_include_tax')
      .eq('company_id', companyId)
      .single()

    // Get company name
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    const taxRate = companySettings?.default_tax_rate ?? 21
    const irpfRate = companySettings?.default_irpf_rate ?? 0
    const pricesIncludeTax = companySettings?.prices_include_tax ?? false

    // Get service
    const { data: service } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single()

    if (!service) {
      return new Response(
        JSON.stringify({ error: 'Service not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle Variant - check if variantId was actually provided
    let basePrice = service.base_price || 0
    let variantName: string | null = null
    let title = service.name
    let description = service.description || service.name

    // Only look for variant if variantId is provided and not empty
    if (variantId && variantId !== 'undefined' && variantId !== 'null') {
      const { data: variant } = await supabase
        .from('service_variants')
        .select('*')
        .eq('id', variantId)
        .eq('service_id', serviceId)
        .single()
      
      if (variant) {
        basePrice = variant.price
        variantName = variant.name
        title = `${service.name} - ${variant.name}`
        description = variant.description || `${service.description || service.name} (${variant.name})`
      }
    }

    // Calculate prices based on tax configuration
    let unitPrice: number
    let subtotal: number
    let taxAmount: number
    let irpfAmount: number
    let total: number

    if (pricesIncludeTax) {
      // Price includes tax - we need to extract the base
      total = basePrice
      subtotal = basePrice / (1 + taxRate / 100)
      taxAmount = total - subtotal
      irpfAmount = subtotal * (irpfRate / 100)
      unitPrice = subtotal // Unit price is always base price
    } else {
      // Price is base price
      subtotal = basePrice
      unitPrice = basePrice
      taxAmount = subtotal * (taxRate / 100)
      irpfAmount = subtotal * (irpfRate / 100)
      total = subtotal + taxAmount - irpfAmount
    }

    // Round to 2 decimals
    subtotal = Math.round(subtotal * 100) / 100
    taxAmount = Math.round(taxAmount * 100) / 100
    irpfAmount = Math.round(irpfAmount * 100) / 100
    total = Math.round(total * 100) / 100
    unitPrice = Math.round(unitPrice * 100) / 100

    // Check settings for contract
    if (action === 'contract') {
      if (!service.allow_direct_contracting) {
        return new Response(
          JSON.stringify({ error: 'Direct contracting is not enabled for this service' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const quoteStatus = action === 'contract' ? 'accepted' : 'request'
    
    // Determine recurrence
    let recurrenceType = 'none'
    let recurrenceInterval = 1
    
    if (service.billing_period) {
      if (service.billing_period === 'monthly') recurrenceType = 'monthly'
      if (service.billing_period === 'annually') recurrenceType = 'yearly'
    }

    // Get current year for quote number
    const quoteDate = new Date().toISOString().split('T')[0]
    const year = new Date().getFullYear()

    // Get next sequence number using RPC
    const { data: nextNumber, error: seqError } = await supabase
      .rpc('get_next_quote_number', {
        p_company_id: companyId,
        p_year: year
      })

    if (seqError) {
      console.error('Error getting next quote number:', seqError)
      throw new Error('Failed to generate quote number')
    }

    // Generate quote number in format: YYYY-P-NNNNN
    const quoteNumber = `${year}-P-${String(nextNumber).padStart(5, '0')}`

    // Calculate valid_until (30 days from now)
    const validUntil = (() => {
      const date = new Date()
      date.setDate(date.getDate() + 30)
      return date.toISOString().split('T')[0]
    })()

    const quoteData = {
      company_id: companyId,
      client_id: clientId,
      year: year,
      sequence_number: nextNumber,
      quote_number: quoteNumber,
      title: title,
      description: description,
      status: quoteStatus,
      quote_date: quoteDate,
      valid_until: validUntil,
      currency: 'EUR',
      language: 'es',
      discount_percent: 0,
      subtotal: subtotal,
      tax_amount: taxAmount,
      irpf_amount: irpfAmount,
      total_amount: total,
      recurrence_type: recurrenceType,
      recurrence_interval: recurrenceInterval,
      created_by: user.id
    }

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert(quoteData)
      .select()
      .single()

    if (quoteError) {
      console.error('Error creating quote:', quoteError)
      throw quoteError
    }

    // Insert Quote Item
    const { error: itemError } = await supabase
      .from('quote_items')
      .insert({
        quote_id: quote.id,
        company_id: companyId,
        line_number: 1,
        description: description,
        quantity: 1,
        unit_price: unitPrice,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        subtotal: subtotal,
        total: total,
        discount_percent: 0,
        service_id: serviceId,
        variant_id: (variantId && variantId !== 'undefined' && variantId !== 'null') ? variantId : null
      })

    if (itemError) {
      console.error('Error inserting quote item:', itemError)
    }

    // For 'request' action, we're done
    if (action === 'request') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'request',
          data: { 
            quote,
            message: 'Tu solicitud ha sido enviada. Te contactaremos pronto.'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For 'contract' action: Convert to invoice and create payment link
    // Step 1: Convert quote to invoice using the SQL function
    const { data: invoiceId, error: convertError } = await supabase
      .rpc('convert_quote_to_invoice', {
        p_quote_id: quote.id
      })

    if (convertError) {
      console.error('Error converting quote to invoice:', convertError)
      // Fallback: return quote with contact info
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          fallback: true,
          data: { 
            quote,
            message: 'El presupuesto ha sido aceptado. Nos pondremos en contacto contigo para completar el pago.'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Get the created invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, company_id')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      console.error('Error fetching invoice:', invoiceError)
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          fallback: true,
          data: { 
            quote,
            message: 'El presupuesto ha sido aceptado y la factura generada. Nos pondremos en contacto contigo para el pago.'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 3: Check for payment integrations
    const { data: paymentIntegrations } = await supabase
      .from('payment_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (!paymentIntegrations || paymentIntegrations.length === 0) {
      // No payment integrations configured - fallback
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          fallback: true,
          data: { 
            quote,
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            message: 'Factura generada correctamente. Nos pondremos en contacto contigo para coordinar el pago.'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 4: Try to create payment link (prefer Stripe, fallback to PayPal)
    const stripeIntegration = paymentIntegrations.find((p: any) => p.provider === 'stripe')
    const paypalIntegration = paymentIntegrations.find((p: any) => p.provider === 'paypal')

    let paymentUrl: string | null = null
    let paymentProvider: string | null = null
    const paymentToken = generateToken()

    // Prepare invoice data for payment
    const invoiceData = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      total: invoice.total,
      client_email: client.email,
      company_name: company?.name
    }

    // Try Stripe first
    if (stripeIntegration) {
      try {
        const credentials = JSON.parse(await decrypt(stripeIntegration.credentials_encrypted))
        const result = await createStripeCheckout(credentials, invoiceData, paymentToken)
        
        if ('checkoutUrl' in result) {
          paymentUrl = result.checkoutUrl
          paymentProvider = 'stripe'
        }
      } catch (e) {
        console.error('Stripe payment creation failed:', e)
      }
    }

    // Try PayPal if Stripe failed or not available
    if (!paymentUrl && paypalIntegration) {
      try {
        const credentials = JSON.parse(await decrypt(paypalIntegration.credentials_encrypted))
        const result = await createPayPalOrder(
          credentials, 
          paypalIntegration.is_sandbox, 
          invoiceData, 
          paymentToken
        )
        
        if ('approvalUrl' in result) {
          paymentUrl = result.approvalUrl
          paymentProvider = 'paypal'
        }
      } catch (e) {
        console.error('PayPal payment creation failed:', e)
      }
    }

    // Update invoice with payment link token if we got a URL
    if (paymentUrl) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)
      
      await supabase.from('invoices').update({
        payment_link_token: paymentToken,
        payment_link_expires_at: expiresAt.toISOString(),
        payment_link_provider: paymentProvider,
      }).eq('id', invoice.id)

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          data: { 
            quote,
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            payment_url: paymentUrl,
            payment_provider: paymentProvider,
            message: 'Redirigiendo al pago...'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // No payment URL could be generated - fallback
    return new Response(
      JSON.stringify({ 
        success: true, 
        action: 'contract',
        fallback: true,
        data: { 
          quote,
          invoice_id: invoiceId,
          invoice_number: invoice.invoice_number,
          message: 'Factura generada correctamente. Te enviaremos los datos de pago por email.'
        } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in client-request-service:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
