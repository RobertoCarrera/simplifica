import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get client_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('client_id')
      .eq('id', user.id)
      .single()

    if (!profile?.client_id) {
      return new Response(
        JSON.stringify({ error: 'User has no associated client profile' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Handle Variant
    let price = service.base_price;
    let title = service.name;
    let description = service.description || service.name;

    if (variantId) {
        const { data: variant } = await supabase
            .from('service_variants')
            .select('*')
            .eq('id', variantId)
            .eq('service_id', serviceId)
            .single();
        
        if (variant) {
            price = variant.price;
            title = `${service.name} - ${variant.name}`;
            description = `${service.description || service.name} (${variant.name})`;
        }
    }

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

    const quoteData = {
      client_id: profile.client_id,
      title: title,
      status: quoteStatus,
      quote_date: new Date().toISOString(),
      total_amount: price,
      subtotal: price,
      tax_amount: 0,
      currency: 'EUR',
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      recurrence_type: recurrenceType,
      recurrence_interval: recurrenceInterval,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert(quoteData)
      .select()
      .single()

    if (quoteError) throw quoteError

    // Insert Item
    const { error: itemError } = await supabase
      .from('quote_items')
      .insert({
        quote_id: quote.id,
        description: description,
        quantity: 1,
        unit_price: price,
        total: price,
        tax_rate: 0
      })

    if (itemError) {
        console.error('Error inserting item', itemError)
    }

    return new Response(
      JSON.stringify({ success: true, data: { quote } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
