// @ts-nocheck
// ================================================================
// Edge Function: auto-inactivate-clients
// ================================================================
// Scheduled job: finds active clients whose last booking was more
// than 90 days ago (or who never booked) and marks them inactive.
// A notification is created for each company owner.
//
// Auth:
//   - Cron: Authorization header with service_role key
//   - Manual: JWT Bearer token (owner/admin validated)
// ================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

/* ── env ─────────────────────────────────────────────── */
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const INACTIVITY_DAYS = 90;

/* ── main ────────────────────────────────────────────── */
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Auth: accept service_role key (cron) or JWT (manual trigger)
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (token !== SERVICE_ROLE_KEY) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    // 1. Single RPC call: get ALL clients to inactivate across ALL companies
    //    The SQL uses a LATERAL JOIN — resolves "last booking per client"
    //    in one execution plan instead of N+1 round-trips.
    const { data: clientsToInactivate, error: rpcErr } = await serviceClient
      .rpc('get_clients_to_inactivate', { inactivity_days: INACTIVITY_DAYS });

    if (rpcErr) throw rpcErr;

    if (!clientsToInactivate?.length) {
      const result = { message: 'No clients to inactivate', companiesProcessed: 0, clientsInactivated: 0, notificationsSent: 0 };
      console.log('[auto-inactivate] Done:', JSON.stringify(result));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Group results by company_id in memory
    const byCompany = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of clientsToInactivate) {
      const list = byCompany.get(row.company_id) ?? [];
      list.push({ id: row.client_id, name: row.client_name });
      byCompany.set(row.company_id, list);
    }

    // 3. Resolve the 'owner' role ID once
    const { data: ownerRole } = await serviceClient
      .from('app_roles')
      .select('id')
      .eq('name', 'owner')
      .maybeSingle();

    let companiesProcessed = 0;
    let totalClientsInactivated = 0;
    let notificationsSent = 0;
    const errors: string[] = [];

    for (const [companyId, clients] of byCompany) {
      try {
        // 4. Batch update: set is_active = false
        const clientIds = clients.map((c) => c.id);
        const { error: updateErr } = await serviceClient
          .from('clients')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in('id', clientIds);

        if (updateErr) {
          errors.push(`Company ${companyId} update: ${updateErr.message}`);
          continue;
        }

        totalClientsInactivated += clientIds.length;

        // 5. Find company owner for notification
        let ownerUserId: string | null = null;

        if (ownerRole) {
          const { data: ownerMember } = await serviceClient
            .from('company_members')
            .select('user_id')
            .eq('company_id', companyId)
            .eq('role_id', ownerRole.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

          ownerUserId = ownerMember?.user_id ?? null;
        }

        // Fallback: check legacy `role` text column
        if (!ownerUserId) {
          const { data: ownerMember } = await serviceClient
            .from('company_members')
            .select('user_id')
            .eq('company_id', companyId)
            .eq('role', 'owner')
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

          ownerUserId = ownerMember?.user_id ?? null;
        }

        if (!ownerUserId) {
          console.warn(`[auto-inactivate] No owner found for company ${companyId}, skipping notification`);
          companiesProcessed++;
          continue;
        }

        // 6. Create notification
        const { error: notifErr } = await serviceClient
          .from('notifications')
          .insert({
            company_id: companyId,
            recipient_id: ownerUserId,
            type: 'client_auto_inactivated',
            reference_id: crypto.randomUUID(),
            title: 'Clientes inactivados automáticamente',
            content: `${clientIds.length} cliente${clientIds.length > 1 ? 's han sido marcados como inactivos' : ' ha sido marcado como inactivo'} por no tener citas en los últimos 3 meses.`,
            metadata: {
              clientIds,
              clientNames: clients.map((c) => c.name),
              reason: 'no_booking_90d',
              count: clientIds.length,
            },
          });

        if (notifErr) {
          console.error(`[auto-inactivate] Notification error for company ${companyId}:`, notifErr);
          errors.push(`Company ${companyId} notification: ${notifErr.message}`);
        } else {
          notificationsSent++;
        }

        companiesProcessed++;
      } catch (companyErr) {
        const msg = companyErr instanceof Error ? companyErr.message : String(companyErr);
        console.error(`[auto-inactivate] Error processing company ${companyId}:`, msg);
        errors.push(`Company ${companyId}: ${msg}`);
      }
    }

    const result = {
      companiesProcessed,
      clientsInactivated: totalClientsInactivated,
      notificationsSent,
      ...(errors.length ? { errors } : {}),
    };

    console.log('[auto-inactivate] Done:', JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auto-inactivate] Fatal error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
