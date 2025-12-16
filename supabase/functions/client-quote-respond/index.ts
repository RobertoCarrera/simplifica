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
    const { id: quoteId, action, rejection_reason } = await req.json();

    if (!quoteId || !action || !['accept', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid parameters. Provide id and action (accept/reject)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if (action === 'reject' && !rejection_reason) {
      return new Response(JSON.stringify({ error: 'Rejection reason is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    console.log(`📝 User ${user.email} attempting to ${action} quote ${quoteId}`);

    // Align with client-quotes: resolve app user and client mapping
    // Use admin client to bypass RLS and ensure we find the user by auth_user_id
    let appUser: any = null;

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('id, email, role, company_id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (userData && userData.role === 'client') {
      appUser = userData;
    } else {
      // Fallback to clients table
      const { data: clientData } = await supabaseAdmin
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
      }
    }

    if (!appUser) {
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

    const userEmailLower = ((appUser as any).email || '').toLowerCase();

    // IMPORTANT: Match the SQL portal functions.
    // Derive company_id + client_id primarily from client_portal_users by JWT email,
    // not from users.company_id (which may be unset/mismatched for client accounts).
    let company_id: string | null = null;
    let client_id: string | null = null;
    {
      const { data: mapRow } = await supabaseAdmin
        .from('client_portal_users')
        .select('company_id, client_id')
        .ilike('email', userEmailLower)
        .eq('is_active', true)
        .maybeSingle();
      if (mapRow) {
        company_id = (mapRow as any).company_id ?? null;
        client_id = (mapRow as any).client_id ?? null;
      }
    }

    // Optional fallback for legacy setups: if there's no mapping row but user has company_id set,
    // try resolving client by email within that company.
    if ((!company_id || !client_id) && (appUser as any).company_id) {
      const fallbackCompanyId = String((appUser as any).company_id);
      const { data: c } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('company_id', fallbackCompanyId)
        .ilike('email', userEmailLower)
        .maybeSingle();
      if (c?.id) {
        company_id = fallbackCompanyId;
        client_id = c.id as string;
      }
    }

    if (!company_id || !client_id) {
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

    // Check if quote can be responded to (must be in 'sent', 'viewed' or 'pending' status)
    if (!['sent', 'viewed', 'pending'].includes(currentStatus || '')) {
      return new Response(JSON.stringify({
        error: `Quote cannot be ${action}ed in current status: ${currentStatus}`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Update quote status (+ accepted_at when applicable)
    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    const updatePayload: any = { status: newStatus };
    if (action === 'accept') updatePayload.accepted_at = new Date().toISOString();
    if (action === 'reject') updatePayload.rejection_reason = rejection_reason;

    const { data: updatedQuote, error: updateError } = await supabaseAdmin
      .from('quotes')
      .update(updatePayload)
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

    // If accepted, resolve automation rules and optionally schedule conversion
    // If accepted, resolve automation rules and optionally schedule conversion OR convert immediately
    if (action === 'accept') {
      try {
        console.log(`🤖 Resolving automation rules for quote ${quoteId}...`);

        // Effective policy precedence: app_settings.enforce_globally -> company_settings.enforce_company_defaults -> quote.convert_policy -> company_settings.convert_policy -> app_settings.default_convert_policy
        const [{ data: appSettings }, { data: compSettings }] = await Promise.all([
          supabaseAdmin.from('app_settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
          supabaseAdmin.from('company_settings').select('*').eq('company_id', company_id as string).maybeSingle(),
        ]);

        // Fetch quote-specific fields needed
        const { data: qFields } = await supabaseAdmin
          .from('quotes')
          .select('id, convert_policy, deposit_percentage, invoice_on_date')
          .eq('id', quoteId)
          .single();

        const app = (appSettings || {}) as any;
        const cmp = (compSettings || {}) as any;
        const q = (qFields || {}) as any;

        const appPolicy = app.default_convert_policy || 'manual';
        const cmpPolicy = cmp.convert_policy || null;
        const quotePolicy = q.convert_policy || null;

        let effectivePolicy = appPolicy as string;
        let askBefore = true;
        let delayDays: number = 0;

        if (app.enforce_globally === true) {
          effectivePolicy = appPolicy;
          askBefore = app.ask_before_convert ?? true;
          delayDays = Number(app.default_invoice_delay_days || 0);
        } else if (cmp.enforce_company_defaults === true) {
          effectivePolicy = (cmpPolicy || appPolicy);
          askBefore = (cmp.ask_before_convert ?? app.ask_before_convert ?? true);
          delayDays = Number(cmp.default_invoice_delay_days ?? app.default_invoice_delay_days ?? 0);
        } else {
          effectivePolicy = (quotePolicy || cmpPolicy || appPolicy);
          askBefore = (cmp.ask_before_convert ?? app.ask_before_convert ?? true);
          delayDays = Number(cmp.default_invoice_delay_days ?? app.default_invoice_delay_days ?? 0);
        }

        console.log(`📋 Effective Policy: ${effectivePolicy}, AskBefore: ${askBefore}`);

        // Handle Automatic (Immediate) Conversion
        // Note: 'automática' or 'automatic' overrides 'askBefore' if the intention is full automation, 
        // but traditionally we respect askBefore. However, for "Automatic Mode" in UI, it usually implies immediate.
        // Let's assume if policy is 'automatic', we skip 'askBefore' or assume client just accepted so "asking" is done?
        // Actually, 'askBefore' is usually for the ADMIN when they accept manually. 
        // For CLIENT portal acceptance, if policy is automatic, it should just happen.

        if (effectivePolicy === 'automatic' || effectivePolicy === 'automática' || effectivePolicy === 'on_accept') {
          console.log(`🚀 Executing IMMEDIATE conversion for quote ${quoteId} (Policy: ${effectivePolicy})`);

          // 1. Convert to Invoice
          const { data: invoiceId, error: convertError } = await supabaseAdmin.rpc('convert_quote_to_invoice', {
            p_quote_id: quoteId
          });

          if (convertError) {
            console.error('Immediate conversion failed:', convertError);
          } else if (invoiceId) {
            console.log(`✅ Invoice created: ${invoiceId}`);

            // 2. Generate Payment Link (Random Token)
            const paymentToken = crypto.randomUUID().replace(/-/g, '');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30); // 30 days validity default

            // 3. Update Invoice with Token
            await supabaseAdmin.from('invoices').update({
              payment_link_token: paymentToken,
              payment_link_expires_at: expiresAt.toISOString(),
            }).eq('id', invoiceId);

            console.log(`🔗 Payment link generated for invoice ${invoiceId}`);
          }
        }
        // Handle Scheduled Conversion
        else if (effectivePolicy === 'scheduled') {
          if (!askBefore) { // Only schedule if we don't need to ask admin (or maybe we schedule it anyway? Logic says if askBefore is true, we do nothing and wait for admin)
            // Date precedence: quote.invoice_on_date -> company_settings.invoice_on_date -> now + delayDays
            let when: Date | null = null;
            if (q.invoice_on_date) when = new Date(q.invoice_on_date);
            else if (cmp.invoice_on_date) when = new Date(cmp.invoice_on_date);
            else {
              when = new Date();
              when.setUTCDate(when.getUTCDate() + delayDays);
            }
            const payload = { quote_id: quoteId, policy: effectivePolicy, delay_days: delayDays };
            await supabaseAdmin.from('scheduled_jobs').insert({
              scheduled_at: when!.toISOString(),
              job_type: 'convert_quote_to_invoice',
              payload,
            });
            await supabaseAdmin
              .from('quotes')
              .update({ conversion_status: 'scheduled' })
              .eq('id', quoteId);
            console.log(`⏰ Conversion scheduled for ${when.toISOString()}`);
          } else {
            console.log('ℹ️ Conversion pending manual approval (ask_before_convert is true)');
          }
        }
        else {
          // Manual or other policies: do nothing
          console.log(`ℹ️ No auto-conversion action for policy: ${effectivePolicy}`);
        }

      } catch (scheduleErr) {
        console.error('Automation logic failed (non-blocking):', scheduleErr);
      }
    }

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
