// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id y user_role al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks
//
// PERFORMANCE: v3 — eliminado supabase-js (causa cold-start >5s → timeout 422).
// Ahora usa fetch directo a la REST API con un único RPC get_user_jwt_claims.
//
// SEC-JWT-01, SEC-JWT-03: validateJWTHook() sigue siendo llamado PRIMERO.
// NOTE: validateJWTHook() consume el body del request (necesario para HMAC).
// Usa result.body en lugar de volver a leer req.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { validateJWTHook } from '../_shared/jwt-hook-validator.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  // SEC-JWT-03: Validation order — signature check BEFORE any payload processing.
  // SEC-JWT-04: On failure, return HTTP 200 with empty claims (Supabase hook requirement).
  const { valid, reason, body } = await validateJWTHook(req);
  if (!valid) {
    console.error('[custom-access-token] JWT hook validation failed:', reason);
    return new Response(JSON.stringify({ claims: {} }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  let incomingClaims: Record<string, unknown> | undefined;
  try {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body!);
    } catch (parseError) {
      console.error('[custom-access-token] Failed to parse body:', parseError);
      return new Response(JSON.stringify({ claims: {} }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const userId = payload?.user_id as string | undefined;
    incomingClaims = payload?.claims as Record<string, unknown> | undefined;

    if (!userId || !incomingClaims) {
      console.error('[custom-access-token] Missing user_id/claims in hook payload');
      return new Response(JSON.stringify({ claims: incomingClaims ?? {} }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[custom-access-token] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ claims: incomingClaims }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Single RPC call — replaces two sequential supabase-js queries.
    // get_user_jwt_claims checks public.users first, then clients, in one DB round-trip.
    let companyId: string | null = null;
    let userRole: string | null = null;

    try {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_user_jwt_claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ p_auth_user_id: userId }),
      });

      if (rpcRes.ok) {
        const claims = await rpcRes.json();
        companyId = claims?.company_id ?? null;
        userRole = claims?.user_role ?? null;
        console.log('[custom-access-token] Claims resolved:', { userRole, hasCompany: !!companyId });
      } else {
        const errText = await rpcRes.text();
        console.error('[custom-access-token] RPC error', rpcRes.status, errText);
      }
    } catch (lookupError) {
      console.error('[custom-access-token] DB lookup failed:', lookupError);
      // Continue without extra claims on error
    }

    return new Response(
      JSON.stringify({
        claims: {
          ...incomingClaims,
          company_id: companyId,
          user_role: userRole,
        },
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('[custom-access-token] Unexpected error:', error);
    return new Response(
      JSON.stringify({ claims: incomingClaims ?? {} }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});
