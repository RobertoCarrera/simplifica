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
    const params = new URLSearchParams({
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
      // Force EUR only - disable currency conversion
      "currency": "eur",
    })

    // Add payment method types explicitly
    params.append("payment_method_types[]", "card")
    // Uncomment to enable more payment methods:
    // params.append("payment_method_types[]", "link")

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
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

    const { serviceId, variantId, action, preferredPaymentMethod } = await req.json()

    if (!serviceId || !['request', 'contract'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get client_id and company_id from clients table using auth_user_id
    console.log('[client-request-service] Looking up client for user:', user.id)
    
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, company_id, name, email')
      .eq('auth_user_id', user.id)
      .single()

    console.log('[client-request-service] Client lookup result:', JSON.stringify({ client, clientError }))

    if (!client?.id || !client?.company_id) {
      return new Response(
        JSON.stringify({ error: 'User has no associated client profile or company' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const clientId = client.id
    const companyId = client.company_id

    console.log('[client-request-service] Client ID:', clientId, 'Company ID:', companyId)

    // Get company settings for tax configuration
    const { data: companySettings, error: settingsError } = await supabase
      .from('company_settings')
      .select('iva_rate, irpf_rate, prices_include_tax, iva_enabled, irpf_enabled')
      .eq('company_id', companyId)
      .single()

    console.log('[client-request-service] Company settings:', JSON.stringify({ companySettings, settingsError }))

    // Get company name
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()

    // Use company settings or defaults (21% IVA, 0% IRPF for clients)
    const taxRate = companySettings?.iva_enabled !== false ? (companySettings?.iva_rate ?? 21) : 0
    const irpfRate = companySettings?.irpf_enabled === true ? (companySettings?.irpf_rate ?? 0) : 0
    const pricesIncludeTax = companySettings?.prices_include_tax ?? false

    console.log('[client-request-service] Tax config - taxRate:', taxRate, 'irpfRate:', irpfRate, 'pricesIncludeTax:', pricesIncludeTax)

    // Get service
    console.log('[client-request-service] Looking up service:', serviceId)
    
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single()

    console.log('[client-request-service] Service lookup result:', JSON.stringify({ serviceName: service?.name, serviceError }))

    if (!service) {
      return new Response(
        JSON.stringify({ error: 'Service not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[client-request-service] Full service data:', JSON.stringify(service))

    // Handle Variant - check if variantId was actually provided
    // Ensure basePrice is always a valid number - check multiple possible price fields
    let basePrice = Number(service.base_price) || Number(service.price) || Number(service.price_cents) / 100 || 0
    let variantName: string | null = null
    let title = service.name || 'Servicio'
    let description = service.description || service.name || 'Servicio solicitado'

    console.log('[client-request-service] Initial basePrice:', basePrice, 'from service fields:', {
      base_price: service.base_price,
      price: service.price,
      price_cents: service.price_cents
    })

    // Discount percentage to apply (from variant pricing or variant level)
    let discountPercent = 0

    // Only look for variant if variantId is provided and not empty
    if (variantId && variantId !== 'undefined' && variantId !== 'null') {
      console.log('[client-request-service] Looking up variant:', variantId)
      
      const { data: variant, error: variantError } = await supabase
        .from('service_variants')
        .select('*')
        .eq('id', variantId)
        .eq('service_id', serviceId)
        .single()
      
      console.log('[client-request-service] Variant lookup result:', JSON.stringify({ variant, variantError }))
      
      if (variant) {
        // Price is in the pricing array (variant.pricing[0].base_price)
        // Also check direct fields as fallback
        let variantPrice = 0
        if (variant.pricing && Array.isArray(variant.pricing) && variant.pricing.length > 0) {
          // Get first pricing option (usually one_time or monthly)
          const pricing = variant.pricing[0]
          variantPrice = Number(pricing.base_price) || Number(pricing.price) || 0
          // Get discount from pricing (NOT applied to price - will be applied as line discount)
          discountPercent = Number(pricing.discount_percentage) || 0
          console.log('[client-request-service] Got price from variant.pricing:', variantPrice, 'discount:', discountPercent)
        } else {
          // Fallback to direct fields
          variantPrice = Number(variant.base_price) || Number(variant.price) || Number(variant.price_cents) / 100 || 0
          discountPercent = Number(variant.discount_percentage) || 0
          console.log('[client-request-service] Got price from variant direct fields:', variantPrice, 'discount:', discountPercent)
        }
        
        // Use the BASE price (before any discount) - discount will be applied as line discount
        basePrice = variantPrice
        variantName = variant.variant_name || variant.name  // Field is variant_name in schema
        title = `${service.name} - ${variantName}`
        description = variant.description || `${service.description || service.name} (${variantName})`
      }
    }

    // If no variant was found/requested, don't add "undefined" to title
    // Title should just be the service name
    if (!variantName) {
      title = service.name || 'Servicio'
      description = service.description || service.name || 'Servicio solicitado'
    }

    console.log('[client-request-service] Final basePrice:', basePrice, 'title:', title, 'discountPercent:', discountPercent)

    // Calculate prices based on tax configuration
    // The basePrice from the variant is the DISPLAY price (what the customer sees)
    
    const validBasePrice = Number(basePrice) || 0
    
    let unitPrice: number  // Price per unit shown on quote (DISPLAY PRICE)
    let lineSubtotal: number  // Subtotal for this line (accounting base, before tax)
    let taxAmount: number
    let irpfAmount: number
    let lineTotal: number  // Total the client pays
    let discountAmount: number  // Amount of discount (in display price terms)

    if (pricesIncludeTax) {
      // When prices include tax, the display price (250€) is what the customer sees and pays
      // We need to:
      // 1. Show unit_price = 250€ (the display price)
      // 2. Apply discount to the display price: 250€ - 15% = 212.50€
      // 3. For accounting: extract the base and IVA from the final price
      
      // The display price already includes tax
      unitPrice = validBasePrice  // Show the full display price (250€)
      
      // Apply discount to get the final price the customer pays
      discountAmount = validBasePrice * (discountPercent / 100)  // 250 * 0.15 = 37.50€
      const finalPrice = validBasePrice - discountAmount  // 250 - 37.50 = 212.50€
      
      // For accounting, extract base from final price (final price includes tax)
      // finalPrice = base + (base * taxRate/100) = base * (1 + taxRate/100)
      // base = finalPrice / (1 + taxRate/100)
      const accountingBase = finalPrice / (1 + taxRate / 100)  // 212.50 / 1.21 = 175.62€
      
      lineSubtotal = accountingBase  // 175.62€ (for accounting)
      taxAmount = finalPrice - accountingBase  // 212.50 - 175.62 = 36.88€
      irpfAmount = accountingBase * (irpfRate / 100)
      lineTotal = finalPrice  // 212.50€ (what customer pays)
      
      console.log('[client-request-service] pricesIncludeTax=true: displayPrice:', validBasePrice, 
        'discountedFinal:', finalPrice, 'accountingBase:', accountingBase.toFixed(2))
    } else {
      // Price does NOT include tax - it's the base price
      unitPrice = validBasePrice
      
      // Apply discount to get subtotal
      discountAmount = validBasePrice * (discountPercent / 100)
      lineSubtotal = validBasePrice - discountAmount
      
      // Calculate taxes on discounted subtotal  
      taxAmount = lineSubtotal * (taxRate / 100)
      irpfAmount = lineSubtotal * (irpfRate / 100)
      lineTotal = lineSubtotal + taxAmount - irpfAmount
    }

    // Round to 2 decimals and ensure valid numbers (not NaN)
    unitPrice = Math.round((unitPrice || 0) * 100) / 100
    discountAmount = Math.round((discountAmount || 0) * 100) / 100
    lineSubtotal = Math.round((lineSubtotal || 0) * 100) / 100
    taxAmount = Math.round((taxAmount || 0) * 100) / 100
    irpfAmount = Math.round((irpfAmount || 0) * 100) / 100
    lineTotal = Math.round((lineTotal || 0) * 100) / 100

    // For the quote header, we use the line values since there's only 1 line
    const subtotal = lineSubtotal
    const total = lineTotal

    console.log('[client-request-service] Calculated prices:', { 
      unitPrice, discountPercent, discountAmount, subtotal, taxAmount, total 
    })

    // Check settings for contract
    if (action === 'contract') {
      if (!service.allow_direct_contracting) {
        return new Response(
          JSON.stringify({ error: 'Direct contracting is not enabled for this service' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Use 'request' for service information requests (editable by company)
    // Use 'accepted' for direct contract
    const quoteStatus = action === 'contract' ? 'accepted' : 'request'

    // Get current year for quote number
    const quoteDate = new Date().toISOString().split('T')[0]
    const year = new Date().getFullYear()

    // Get next sequence number using RPC
    const { data: nextNumber, error: seqError } = await supabase
      .rpc('get_next_quote_number', {
        p_company_id: companyId,
        p_year: year
      })

    console.log('[client-request-service] RPC result - nextNumber:', nextNumber, 'error:', seqError)

    if (seqError) {
      console.error('Error getting next quote number:', seqError)
      throw new Error('Failed to generate quote number')
    }

    // Validate we got a valid sequence number
    if (nextNumber === null || nextNumber === undefined) {
      console.error('[client-request-service] RPC returned null/undefined sequence number')
      throw new Error('Failed to get valid sequence number from RPC')
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
      title: title || service.name || 'Solicitud de servicio',  // Ensure NOT NULL
      description: description || '',  // Allow empty but not null
      status: quoteStatus,
      quote_date: quoteDate,
      valid_until: validUntil,
      currency: 'EUR',
      language: 'es',
      discount_percent: discountPercent,  // Apply discount at quote level too
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: total,
      created_by: user.id
    }

    // Validate all NOT NULL fields before insert
    const requiredFields = ['company_id', 'client_id', 'year', 'sequence_number', 'quote_number', 'title', 'status', 'quote_date', 'valid_until']
    for (const field of requiredFields) {
      if (quoteData[field] === null || quoteData[field] === undefined) {
        console.error(`[client-request-service] Required field ${field} is null/undefined`)
        throw new Error(`Required field ${field} is missing`)
      }
    }

    console.log('[client-request-service] Inserting quote with data:', JSON.stringify(quoteData))

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert(quoteData)
      .select()
      .single()

    if (quoteError) {
      console.error('[client-request-service] Error creating quote:', JSON.stringify(quoteError))
      throw new Error(`Quote creation failed: ${quoteError.message || quoteError.code}`)
    }

    console.log('[client-request-service] Quote created successfully:', quote.id)

    // Insert Quote Item - make it safe by only including guaranteed columns
    // The line item shows: unit_price (base price), discount, subtotal (after discount), tax, total
    const quoteItemData: any = {
      quote_id: quote.id,
      company_id: companyId,
      line_number: 1,
      description: description,
      quantity: 1,
      unit_price: unitPrice,  // Base price per unit (without discount, without tax)
      tax_rate: taxRate,
      tax_amount: taxAmount,
      subtotal: subtotal,  // After discount, before tax
      total: lineTotal,  // Final with tax
      discount_percent: discountPercent  // Line-level discount
    }

    // Only add service_id if valid
    if (serviceId) {
      quoteItemData.service_id = serviceId
    }
    
    // Only add variant_id if valid
    if (variantId && variantId !== 'undefined' && variantId !== 'null') {
      quoteItemData.variant_id = variantId
    }

    console.log('[client-request-service] Inserting quote item:', JSON.stringify(quoteItemData))

    const { error: itemError } = await supabase
      .from('quote_items')
      .insert(quoteItemData)

    if (itemError) {
      console.error('[client-request-service] Error inserting quote item:', JSON.stringify(itemError))
      // Don't fail the whole operation if item fails
    } else {
      console.log('[client-request-service] Quote item created successfully')
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
    console.log('[client-request-service] Starting contract flow - converting quote to invoice')
    
    // Step 1: Convert quote to invoice using the SQL function
    const { data: invoiceId, error: convertError } = await supabase
      .rpc('convert_quote_to_invoice', {
        p_quote_id: quote.id
      })

    console.log('[client-request-service] convert_quote_to_invoice result:', { invoiceId, convertError })

    if (convertError) {
      console.error('[client-request-service] Error converting quote to invoice:', JSON.stringify(convertError))
      
      // If the RPC function tried to use 'facturado', update the quote manually with correct status
      if (convertError.message?.includes('facturado') || convertError.code === '22P02') {
        // Update quote status to 'invoiced' (correct enum value)
        await supabase
          .from('quotes')
          .update({ status: 'invoiced' })
          .eq('id', quote.id)
        console.log('[client-request-service] Updated quote status to invoiced')
      }
      
      // Fallback: return quote with contact info
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          fallback: true,
          error_detail: convertError.message,
          data: { 
            quote,
            message: 'El presupuesto ha sido aceptado. Nos pondremos en contacto contigo para completar el pago.'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[client-request-service] Invoice created successfully:', invoiceId)

    // Step 2: Get the created invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_series, total, company_id, status, series_id')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      console.error('[client-request-service] Error fetching invoice:', invoiceError)
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          fallback: true,
          data: { 
            quote,
            invoice_id: invoiceId,
            message: 'El presupuesto ha sido aceptado y la factura generada. Nos pondremos en contacto contigo para el pago.'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[client-request-service] Invoice fetched:', JSON.stringify(invoice))

    // Step 2.5: Check if Verifactu is enabled and auto-submit the invoice
    if (invoice.series_id) {
      const { data: series } = await supabase
        .from('invoice_series')
        .select('verifactu_enabled')
        .eq('id', invoice.series_id)
        .single()

      if (series?.verifactu_enabled) {
        console.log('[client-request-service] Verifactu is enabled for this series, attempting to finalize...')
        try {
          // Call the verifactu finalize function
          const { error: vfError } = await supabase.rpc('verifactu.finalize_invoice', {
            p_invoice_id: invoiceId,
            p_series: invoice.invoice_series?.split('-')[0] || '',
            p_device_id: 'CLIENT-PORTAL-AUTO',
            p_software_id: 'SIMPLIFICA-VF-001'
          })
          
          if (vfError) {
            console.error('[client-request-service] Verifactu finalization error:', vfError)
          } else {
            console.log('[client-request-service] Invoice successfully submitted to Verifactu')
          }
        } catch (vfErr: any) {
          console.error('[client-request-service] Verifactu error:', vfErr)
          // Don't fail the whole process, just log the error
        }
      }
    }

    // Step 3: Check for payment integrations
    console.log('[client-request-service] Checking payment integrations for company:', companyId)
    
    const { data: paymentIntegrations, error: paymentError } = await supabase
      .from('payment_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)

    console.log('[client-request-service] Payment integrations:', JSON.stringify({ 
      count: paymentIntegrations?.length, 
      providers: paymentIntegrations?.map((p: any) => p.provider),
      error: paymentError 
    }))

    if (!paymentIntegrations || paymentIntegrations.length === 0) {
      // No payment integrations configured - fallback
      console.log('[client-request-service] No payment integrations found')
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          fallback: true,
          no_payment_integration: true,
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

    // Step 4: Check available payment methods and handle selection
    const stripeIntegration = paymentIntegrations.find((p: any) => p.provider === 'stripe')
    const paypalIntegration = paymentIntegrations.find((p: any) => p.provider === 'paypal')

    const availableProviders: string[] = []
    if (stripeIntegration) availableProviders.push('stripe')
    if (paypalIntegration) availableProviders.push('paypal')

    console.log('[client-request-service] Payment providers available:', {
      stripe: !!stripeIntegration,
      paypal: !!paypalIntegration,
      preferredPaymentMethod
    })

    // If multiple providers and no preference specified, return options for selection
    if (availableProviders.length > 1 && !preferredPaymentMethod) {
      console.log('[client-request-service] Multiple payment methods available, returning selection options')
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'contract',
          requires_payment_selection: true,
          data: { 
            quote,
            invoice_id: invoiceId,
            invoice_number: invoice.invoice_number,
            total: invoice.total,
            available_providers: availableProviders,
            message: 'Selecciona tu método de pago preferido'
          } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Determine which provider to use
    let selectedProvider = preferredPaymentMethod
    if (!selectedProvider) {
      // Auto-select if only one available
      selectedProvider = stripeIntegration ? 'stripe' : (paypalIntegration ? 'paypal' : null)
    }

    // Validate selected provider is available
    if (selectedProvider && !availableProviders.includes(selectedProvider)) {
      console.error('[client-request-service] Selected provider not available:', selectedProvider)
      selectedProvider = availableProviders[0] || null
    }

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

    console.log('[client-request-service] Invoice data for payment:', JSON.stringify(invoiceData))
    console.log('[client-request-service] Selected provider:', selectedProvider)

    // Try selected provider first, then fallback
    if (selectedProvider === 'stripe' && stripeIntegration) {
      console.log('[client-request-service] Attempting Stripe checkout...')
      try {
        const credentials = JSON.parse(await decrypt(stripeIntegration.credentials_encrypted))
        console.log('[client-request-service] Stripe credentials decrypted, creating checkout...')
        const result = await createStripeCheckout(credentials, invoiceData, paymentToken)
        console.log('[client-request-service] Stripe result:', JSON.stringify(result))
        
        if ('checkoutUrl' in result) {
          paymentUrl = result.checkoutUrl
          paymentProvider = 'stripe'
          console.log('[client-request-service] Stripe checkout URL created:', paymentUrl)
        }
      } catch (e: any) {
        console.error('[client-request-service] Stripe payment creation failed:', e?.message || e)
      }
    }

    // Try PayPal if selected or Stripe failed
    if (!paymentUrl && (selectedProvider === 'paypal' || !selectedProvider) && paypalIntegration) {
      console.log('[client-request-service] Attempting PayPal checkout...')
      try {
        const credentials = JSON.parse(await decrypt(paypalIntegration.credentials_encrypted))
        console.log('[client-request-service] PayPal credentials decrypted, creating order...')
        const result = await createPayPalOrder(
          credentials, 
          paypalIntegration.is_sandbox, 
          invoiceData, 
          paymentToken
        )
        console.log('[client-request-service] PayPal result:', JSON.stringify(result))
        
        if ('approvalUrl' in result) {
          paymentUrl = result.approvalUrl
          paymentProvider = 'paypal'
          console.log('[client-request-service] PayPal approval URL created:', paymentUrl)
        }
      } catch (e: any) {
        console.error('[client-request-service] PayPal payment creation failed:', e?.message || e)
      }
    }

    console.log('[client-request-service] Final payment result:', { paymentUrl, paymentProvider })

    // Update invoice with payment link token if we got a URL
    if (paymentUrl) {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)
      
      const { error: updateError } = await supabase.from('invoices').update({
        payment_link_token: paymentToken,
        payment_link_expires_at: expiresAt.toISOString(),
        payment_link_provider: paymentProvider,
      }).eq('id', invoice.id)

      if (updateError) {
        console.error('[client-request-service] Error updating invoice with payment link:', updateError)
      }

      console.log('[client-request-service] Contract flow completed with payment URL')

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
