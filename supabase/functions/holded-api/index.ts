import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
// Allowed origins for CORS — production domains only
const ALLOWED_ORIGINS = [
  'https://app.simplificacrm.es',
  'https://simplifica-agenda.vercel.app',
  'https://portal.simplificacrm.es',
];

function isOriginAllowed(origin: string | null): boolean {
  return origin !== null && ALLOWED_ORIGINS.includes(origin);
}

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
});
const HOLDED_API_URL = "https://api.holded.com/api/invoicing/v1";
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(req.headers.get('origin'))
    });
  }
  try {
    // Auth: use service role to properly verify the JWT token
    // (ANON_KEY client may not correctly validate tokens in all cases)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error('Missing Authorization header');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized: invalid or expired token');

    // Get Payload
    const { action, payload } = await req.json();
    // Secure API Key Retrieval
    // For MVP, we use a global secret. In multi-tenant, fetch from company_settings (encrypted).
    const HOLDED_KEY = Deno.env.get('HOLDED_API_KEY');
    if (!HOLDED_KEY) {
      throw new Error('HOLDED_API_KEY not configured in secrets.');
    }
    let result;
    switch(action){
      case 'ping':
        // Test connection
        // Usually GET /contacts is good enough or just verifying key
        // Holded doesn't have a specific ping, we can try generic GET
        result = {
          status: 'Configured'
        };
        break;
      case 'sync_contact':
        // Payload: { name, email, code, vat, ... }
        // 1. Check if exists (by email or customId) - optional optimization
        // 2. Create or Update
        result = await fetch(`${HOLDED_API_URL}/contacts`, {
          method: 'POST',
          headers: {
            'key': HOLDED_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).then((res)=>res.json());
        break;
      case 'create_invoice':
        // Payload: { contactId, items: [], ... }
        result = await fetch(`${HOLDED_API_URL}/documents/invoice`, {
          method: 'POST',
          headers: {
            'key': HOLDED_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).then((res)=>res.json());
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders(req.headers.get('origin')),
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Holded API Error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders(req.headers.get('origin')),
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
