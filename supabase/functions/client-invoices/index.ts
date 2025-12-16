// @ts-nocheck
// Edge Function: client-invoices
// Returns invoices visible to the authenticated client user using mapping via client_portal_users.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function cors(origin?: string){
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS')||'false').toLowerCase()==='true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || (origin && allowed.includes(origin));
  return { 'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Vary':'Origin' } as Record<string,string>;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'GET' && req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status:405, headers:{...headers,'Content-Type':'application/json'}});

  try{
    const authHeader = req.headers.get('authorization') || '';
    const token = (authHeader.match(/^Bearer\s+(.+)$/i)||[])[1];
    if (!token) return new Response(JSON.stringify({ error:'Missing Bearer token'}), { status:401, headers:{...headers,'Content-Type':'application/json'}});

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')||'';
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')||'';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error:'Supabase not configured' }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false }});
    
    // Get authenticated user
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error:'Invalid or expired token' }), { status:401, headers:{...headers,'Content-Type':'application/json'}});
    
    // Try to find user in users table first (for client role users)
    let appUser: any = null;
    let clientId: string | null = null;
    
    const { data: userData, error: userErr } = await admin
      .from('users')
      .select('id, email, role, company_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    
    if (userData && userData.role === 'client') {
      appUser = userData;
    } else {
      // If not found in users or not client role, try clients table
      const { data: clientData, error: clientErr } = await admin
        .from('clients')
        .select('id, email, company_id, is_active')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (clientData && clientData.is_active) {
        appUser = {
          id: clientData.id,
          email: clientData.email,
          role: 'client',
          company_id: clientData.company_id
        };
        clientId = clientData.id; // Direct client ID
      }
    }
    
    if (!appUser) return new Response(JSON.stringify({ error:'User profile not found' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});
    if (appUser.role !== 'client') return new Response(JSON.stringify({ error:'Forbidden: only client users' }), { status:403, headers:{...headers,'Content-Type':'application/json'}});

    // Resolve client_id mapping if not already set
    if (!clientId) {
      const { data: mapRow } = await admin
        .from('client_portal_users')
        .select('client_id, is_active')
        .eq('company_id', appUser.company_id)
        .eq('email', (appUser.email||'').toLowerCase())
        .eq('is_active', true)
        .maybeSingle();
      if (mapRow && (mapRow as any).client_id) clientId = (mapRow as any).client_id as string;
    }
    
    if (!clientId) {
      const { data: c } = await admin
        .from('clients')
        .select('id')
        .eq('company_id', appUser.company_id)
        .eq('email', (appUser.email||'').toLowerCase())
        .maybeSingle();
      if (c?.id) clientId = c.id as string;
    }

    if (!clientId) return new Response(JSON.stringify({ data: [] }), { status:200, headers:{...headers,'Content-Type':'application/json'}});

    // Read requested id and action
    let requestedId: string | null = null;
    let action: string | null = null;
    try {
      if (req.method === 'GET') {
        const u = new URL(req.url);
        requestedId = u.searchParams.get('id');
      } else if (req.method === 'POST') {
        const body = await req.json().catch(()=>({}));
        if (body && typeof body.id === 'string') requestedId = body.id;
        if (body && typeof body.action === 'string') action = body.action;
      }
    } catch(_) {}

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
        return new Response(JSON.stringify({ error: 'Invoice not found or access denied' }), { status:404, headers:{...headers,'Content-Type':'application/json'}});
      }
      
      if (invoice.payment_status === 'paid') {
        return new Response(JSON.stringify({ error: 'Invoice is already paid' }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      }
      
      // Update invoice to pending_local status
      const { error: updateError } = await admin
        .from('invoices')
        .update({ 
          payment_status: 'pending_local',
          updated_at: new Date().toISOString()
        })
        .eq('id', requestedId);
      
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Invoice marked for local payment' }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    if (requestedId) {
      const { data, error } = await admin
        .from('invoices')
        .select('id, company_id, client_id, full_invoice_number, invoice_series, invoice_number, status, payment_status, payment_link_token, payment_link_expires_at, stripe_payment_url, paypal_payment_url, invoice_date, due_date, total, currency, items:invoice_items(id,line_order,description,quantity,unit_price,tax_rate,total)')
        .eq('company_id', appUser.company_id)
        .eq('client_id', clientId)
        .eq('id', requestedId)
        .single();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
      
      // Add payment URLs if payment is pending
      let paymentUrl: string | null = null;
      
      if (data && data.payment_status !== 'paid') {
        const expiresAt = new Date(data.payment_link_expires_at);
        if (expiresAt > new Date()) {
          const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://simplifica.digitalizamostupyme.es";
          
          // Use payment_link_token to generate URL
          if (data.payment_link_token) {
            paymentUrl = `${PUBLIC_SITE_URL}/pago/${data.payment_link_token}`;
          }
        }
      }
      
      return new Response(JSON.stringify({ 
        data: { 
          ...data, 
          pending_payment_url: paymentUrl
        } 
      }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
    }

    const { data, error } = await admin
      .from('invoices')
      .select('id, company_id, client_id, full_invoice_number, invoice_series, invoice_number, status, payment_status, payment_link_token, payment_link_expires_at, stripe_payment_url, paypal_payment_url, invoice_date, total, currency')
      .eq('company_id', appUser.company_id)
      .eq('client_id', clientId)
      .order('invoice_date', { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status:400, headers:{...headers,'Content-Type':'application/json'}});
    
    // Add payment URLs to invoices with pending payments
    const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://simplifica.digitalizamostupyme.es";
    const now = new Date();
    const enrichedData = (data || []).map(inv => {
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
        pending_payment_url
      };
    });

    return new Response(JSON.stringify({ data: enrichedData }), { status:200, headers:{...headers,'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status:500, headers:{...headers,'Content-Type':'application/json'}});
  }
});
