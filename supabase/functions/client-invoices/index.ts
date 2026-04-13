// @ts-nocheck
// Edge Function: client-invoices
// Returns invoices visible to the authenticated client user using mapping via client_portal_users.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

function cors(origin?: string) {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAllowed = origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  } as Record<string, string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET' && req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  // Rate limiting: 60 req/min per IP
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`client-invoices:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...headers, ...getRateLimitHeaders(rl), 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
    if (!token)
      return new Response(JSON.stringify({ error: 'Missing Bearer token' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Get authenticated user
    const {
      data: { user },
      error: authErr,
    } = await admin.auth.getUser(token);
    if (authErr || !user)
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Try to find user in clients table (portal-facing function)
    let appUser: any = null;
    let clientId: string | null = null;

    const { data: clientData } = await admin
      .from('clients')
      .select('id, email, company_id, is_active')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (clientData && clientData.is_active) {
      appUser = {
        id: clientData.id,
        email: clientData.email,
        company_id: clientData.company_id,
      };
      clientId = clientData.id;
    }

    if (!appUser)
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Resolve client_id mapping if not already set
    if (!clientId) {
      const { data: mapRow } = await admin
        .from('client_portal_users')
        .select('client_id, is_active')
        .eq('company_id', appUser.company_id)
        .eq('email', (appUser.email || '').toLowerCase())
        .eq('is_active', true)
        .maybeSingle();
      if (mapRow && (mapRow as any).client_id) clientId = (mapRow as any).client_id as string;
    }

    if (!clientId) {
      const { data: c } = await admin
        .from('clients')
        .select('id')
        .eq('company_id', appUser.company_id)
        .eq('email', (appUser.email || '').toLowerCase())
        .maybeSingle();
      if (c?.id) clientId = c.id as string;
    }

    if (!clientId)
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Read requested id and action
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let requestedId: string | null = null;
    let action: string | null = null;
    try {
      if (req.method === 'GET') {
        const u = new URL(req.url);
        const raw = u.searchParams.get('id');
        if (raw && UUID_RE.test(raw)) requestedId = raw;
      } else if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        // SECURITY: Validate UUID format before using in DB query
        if (body && typeof body.id === 'string' && UUID_RE.test(body.id)) requestedId = body.id;
        if (body && typeof body.action === 'string') action = body.action;
      }
    } catch (_) {}

    // Handle mark_local_payment action
    if (action === 'mark_local_payment' && requestedId) {
      // Verify the invoice belongs to this client
      const { data: invoice, error: invError } = await admin
        .from('invoices')
        .select('id, client_id, company_id, payment_status')
        .eq('id', requestedId)
        .eq('client_id', clientId)
        .eq('company_id', appUser.company_id)
        .single();

      if (invError || !invoice) {
        return new Response(JSON.stringify({ error: 'Invoice not found or access denied' }), {
          status: 404,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      if (invoice.payment_status === 'paid') {
        return new Response(JSON.stringify({ error: 'Invoice is already paid' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      // Update invoice to pending_local status
      const { error: updateError } = await admin
        .from('invoices')
        .update({
          payment_status: 'pending_local',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestedId)
        .eq('client_id', clientId)
        .eq('company_id', appUser.company_id);

      if (updateError) {
        console.error('[client-invoices] Update error:', updateError.message);
        return new Response(JSON.stringify({ error: 'Failed to update invoice' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Invoice marked for local payment' }),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    if (requestedId) {
      const { data, error } = await admin
        .from('invoices')
        .select(
          'id, company_id, client_id, full_invoice_number, invoice_series, invoice_number, status, payment_status, payment_link_token, payment_link_expires_at, stripe_payment_url, paypal_payment_url, invoice_date, due_date, total, currency, items:invoice_items(id,line_order,description,quantity,unit_price,tax_rate,total)',
        )
        .eq('company_id', appUser.company_id)
        .eq('client_id', clientId)
        .eq('id', requestedId)
        .single();
      if (error)
        return new Response(JSON.stringify({ error: 'Failed to fetch invoice' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        });

      // Add payment URLs if payment is pending
      let paymentUrl: string | null = null;

      if (data && data.payment_status !== 'paid') {
        const expiresAt = new Date(data.payment_link_expires_at);
        if (expiresAt > new Date()) {
          const PUBLIC_SITE_URL =
            Deno.env.get('PUBLIC_SITE_URL') || 'https://simplifica.digitalizamostupyme.es';

          // Use payment_link_token to generate URL
          if (data.payment_link_token) {
            paymentUrl = `${PUBLIC_SITE_URL}/pago/${data.payment_link_token}`;
          }
        }
      }

      return new Response(
        JSON.stringify({
          data: {
            ...data,
            pending_payment_url: paymentUrl,
          },
        }),
        { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    }

    const { data, error } = await admin
      .from('invoices')
      .select(
        'id, company_id, client_id, full_invoice_number, invoice_series, invoice_number, status, payment_status, payment_link_token, payment_link_expires_at, stripe_payment_url, paypal_payment_url, invoice_date, total, currency',
      )
      .eq('company_id', appUser.company_id)
      .eq('client_id', clientId)
      .order('invoice_date', { ascending: false });
    if (error)
      return new Response(JSON.stringify({ error: 'Failed to fetch invoices' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    // Add payment URLs to invoices with pending payments
    const PUBLIC_SITE_URL =
      Deno.env.get('PUBLIC_SITE_URL') || 'https://simplifica.digitalizamostupyme.es';
    const now = new Date();
    const enrichedData = (data || []).map((inv) => {
      let pending_payment_url = null;

      if (inv.payment_status !== 'paid') {
        const expiresAt = new Date(inv.payment_link_expires_at);
        if (expiresAt > now) {
          // Use payment_link_token to generate URL
          if (inv.payment_link_token) {
            pending_payment_url = `${PUBLIC_SITE_URL}/pago/${inv.payment_link_token}`;
          }
        }
      }
      return {
        ...inv,
        pending_payment_url,
      };
    });

    return new Response(JSON.stringify({ data: enrichedData }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[client-invoices] Unhandled error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
