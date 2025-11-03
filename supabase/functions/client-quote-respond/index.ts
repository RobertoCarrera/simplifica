import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  } as const;

  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Get authenticated user from Supabase Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    // Create two clients: admin (service role) and user-scoped (RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const email = (user.email || '').trim();

    // Parse request body
    const { id: quoteId, action } = await req.json();
    
    if (!quoteId || !action || !['accept', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid parameters. Provide id and action (accept/reject)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    console.log(`📝 User ${user.email} attempting to ${action} quote ${quoteId}`);

    // Align with client-quotes: resolve app user and client mapping
    const { data: appUser, error: uErr } = await supabaseUser
      .from('users')
      .select('id, email, role, company_id')
      .single();
    if (uErr || !appUser) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
    if ((appUser as any).role !== 'client') {
      return new Response(JSON.stringify({ error: 'Forbidden: only client users' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const company_id = (appUser as any).company_id as string;
    const userEmailLower = ((appUser as any).email || '').toLowerCase();

    // Resolve client_id via mapping first (company + email), then fallback to clients.email
    let client_id: string | null = null;
    {
      const { data: mapRow } = await supabaseAdmin
        .from('client_portal_users')
        .select('client_id')
        .eq('company_id', company_id)
        .eq('email', userEmailLower)
        .eq('is_active', true)
        .maybeSingle();
      if (mapRow && (mapRow as any).client_id) client_id = (mapRow as any).client_id as string;
    }
    if (!client_id) {
      const { data: c } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('company_id', company_id)
        .eq('email', userEmailLower)
        .maybeSingle();
      if (c?.id) client_id = c.id as string;
    }
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'No client mapping found for user' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Verify ownership and fetch current status
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('quotes')
      .select('id, client_id, company_id, status, full_quote_number')
      .eq('id', quoteId)
      .eq('client_id', client_id)
      .eq('company_id', company_id)
      .maybeSingle();
    if (quoteError || !quote) {
      console.error('Quote access error:', quoteError);
      return new Response(JSON.stringify({ error: 'Quote not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
    const currentStatus: string | null = (quote as any).status ?? null;

    // Check if quote can be responded to (must be in 'sent' or 'viewed' status)
    if (!['sent', 'viewed'].includes(currentStatus || '')) {
      return new Response(JSON.stringify({ 
        error: `Quote cannot be ${action}ed in current status: ${currentStatus}` 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Update quote status
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const { data: updatedQuote, error: updateError } = await supabaseAdmin
      .from('quotes')
      .update({ status: newStatus })
      .eq('id', quoteId)
      .select('id, full_quote_number, title, status, quote_date, valid_until, total_amount')
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to update quote status' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    console.log(`✅ Quote ${quoteId} ${action}ed successfully by ${user.email}`);

    // Fetch full quote with items
    const { data: fullQuote } = await supabaseAdmin
      .from('quotes')
      .select(`
        id,
        company_id,
        client_id,
        full_quote_number,
        title,
        status,
        quote_date,
        valid_until,
        total_amount,
        items:quote_items(*)
      `)
      .eq('id', quoteId)
      .single();

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: fullQuote,
        message: `Presupuesto ${action === 'accept' ? 'aceptado' : 'rechazado'} correctamente`
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      }
    );
  } catch (err: any) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      }
    );
  }
});
