// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ALLOW_ALL_ORIGINS = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);

const FUNCTION_NAME = 'create-service-variant';
const FUNCTION_VERSION = '2025-11-09-1';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`[${FUNCTION_NAME}] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars`);
}

const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '', {
  auth: { persistSession: false }
});

interface VariantPricing {
  billing_period: 'one_time' | 'monthly' | 'quarterly' | 'biannual' | 'annual';
  base_price: number;
  estimated_hours?: number;
  cost_price?: number;
  profit_margin?: number;
  discount_percentage?: number;
}

interface ServiceVariant {
  id?: string;
  service_id: string;
  variant_name: string;
  
  // NUEVO: Array de precios por periodicidad
  pricing: VariantPricing[];
  
  // DEPRECATED: Mantener para backwards compatibility
  billing_period?: 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'one_time';
  base_price?: number;
  estimated_hours?: number;
  cost_price?: number;
  profit_margin?: number;
  discount_percentage?: number;
  
  features?: {
    included: string[];
    excluded: string[];
    limits: Record<string, any>;
  };
  display_config?: {
    highlight: boolean;
    badge: string | null;
    color: string | null;
  };
  is_active?: boolean;
  sort_order?: number;
}

function jsonResponse(status: number, body: any, originAllowedHeader = '*') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Origin', originAllowedHeader);
  headers.set('X-Function-Name', FUNCTION_NAME);
  headers.set('X-Function-Version', FUNCTION_VERSION);
  return new Response(JSON.stringify(body), { status, headers });
}

function isOriginAllowed(origin: string | null) {
  if (!origin) return false;
  if (ALLOW_ALL_ORIGINS) return true;
  if (ALLOWED_ORIGINS.length === 0) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    const allow = (ALLOW_ALL_ORIGINS || isOriginAllowed(origin)) ? (origin || '*') : '';
    if (!allow) return jsonResponse(403, { error: 'Origin not allowed' }, '');
    const headers = new Headers();
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Origin', allow);
    return new Response('ok', { status: 200, headers });
  }

  const allowedOrigin = (ALLOW_ALL_ORIGINS || isOriginAllowed(origin)) ? (origin || '*') : '';
  if (!allowedOrigin) {
    console.error(`[${FUNCTION_NAME}] Origin not allowed:`, origin);
    return jsonResponse(403, { error: 'Origin not allowed' }, '');
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error(`[${FUNCTION_NAME}] Missing authorization header`);
      return jsonResponse(401, { error: 'Missing authorization header' }, allowedOrigin);
    }

    // Create Supabase client with user's auth token
    const supabaseClient = createClient(
      SUPABASE_URL || '',
      SUPABASE_SERVICE_ROLE_KEY || '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
        auth: { persistSession: false }
      }
    );

    // Verify authentication
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error(`[${FUNCTION_NAME}] Unauthorized:`, userError);
      return jsonResponse(401, { error: 'Unauthorized' }, allowedOrigin);
    }

    // Parse request body
    const variant: ServiceVariant = await req.json();

    console.log(`[${FUNCTION_NAME}] Processing variant:`, {
      variant_name: variant.variant_name,
      service_id: variant.service_id,
      has_id: !!variant.id,
      has_pricing: !!variant.pricing,
      pricing_length: variant.pricing?.length,
      pricing_sample: variant.pricing?.[0],
      user_id: user.id,
    });

    // Validate required fields
    if (!variant.variant_name) {
      return jsonResponse(400, { 
        error: 'Missing required field: variant_name' 
      }, allowedOrigin);
    }

    // Validate pricing array
    if (!variant.pricing || !Array.isArray(variant.pricing) || variant.pricing.length === 0) {
      return jsonResponse(400, { 
        error: 'Missing or empty pricing array. At least one price configuration is required.',
        received: {
          has_pricing: !!variant.pricing,
          is_array: Array.isArray(variant.pricing),
          length: variant.pricing?.length,
          type: typeof variant.pricing
        }
      }, allowedOrigin);
    }

    // Validate each pricing entry
    for (const price of variant.pricing) {
      if (!price.billing_period || price.base_price === undefined) {
        return jsonResponse(400, { 
          error: 'Each pricing entry must have billing_period and base_price' 
        }, allowedOrigin);
      }
    }

    // Validate service_id is a valid UUID (empty string not allowed for direct creation)
    if (!variant.service_id || variant.service_id === '') {
      return jsonResponse(400, { 
        error: 'Cannot create variant without service_id. Use pending variants on client side.' 
      }, allowedOrigin);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(variant.service_id)) {
      return jsonResponse(400, { 
        error: `Invalid service_id format: ${variant.service_id}` 
      }, allowedOrigin);
    }

    let result;

    if (variant.id) {
      // UPDATE existing variant
      console.log(`[${FUNCTION_NAME}] Updating variant:`, variant.id);

      const { data, error } = await supabaseAdmin
        .from('service_variants')
        .update({
          variant_name: variant.variant_name,
          pricing: variant.pricing,
          features: variant.features || { included: [], excluded: [], limits: {} },
          display_config: variant.display_config || { highlight: false, badge: null, color: null },
          is_active: variant.is_active !== undefined ? variant.is_active : true,
          sort_order: variant.sort_order || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', variant.id)
        .select()
        .single();

      if (error) {
        console.error(`[${FUNCTION_NAME}] Error updating variant:`, error);
        return jsonResponse(400, { error: error.message, details: error }, allowedOrigin);
      }

      result = data;
      console.log(`[${FUNCTION_NAME}] Variant updated successfully:`, result.id);
    } else {
      // CREATE new variant
      console.log(`[${FUNCTION_NAME}] Creating new variant`);

      const { data, error } = await supabaseAdmin
        .from('service_variants')
        .insert({
          service_id: variant.service_id,
          variant_name: variant.variant_name,
          pricing: variant.pricing,
          features: variant.features || { included: [], excluded: [], limits: {} },
          display_config: variant.display_config || { highlight: false, badge: null, color: null },
          is_active: variant.is_active !== undefined ? variant.is_active : true,
          sort_order: variant.sort_order || 0,
        })
        .select()
        .single();

      if (error) {
        console.error(`[${FUNCTION_NAME}] Error creating variant:`, error);
        return jsonResponse(400, { error: error.message, details: error }, allowedOrigin);
      }

      result = data;
      console.log(`[${FUNCTION_NAME}] Variant created successfully:`, result.id);
    }

    return jsonResponse(200, result, allowedOrigin);
  } catch (error) {
    console.error(`[${FUNCTION_NAME}] Error:`, error);
    return jsonResponse(500, {
      error: error.message || 'Internal server error',
      details: error,
    }, allowedOrigin);
  }
});
