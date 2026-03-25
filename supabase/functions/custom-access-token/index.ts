// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks
//
// SECURITY VECTORS REMEDIATION — Phase 1 (v2: Standard Webhooks)
// SEC-JWT-01, SEC-JWT-03: validateJWTHook() is now called FIRST, before any
// RLS or tenant-based logic, using the Standard Webhooks HMAC protocol.
//
// NOTE: validateJWTHook() consumes the request body internally (needed to
// verify the HMAC signature). Use result.body instead of re-reading req.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateJWTHook } from '../_shared/jwt-hook-validator.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  // SEC-JWT-03: Validation order — signature check BEFORE any payload processing or RLS.
  // SEC-JWT-04: On failure, return HTTP 200 with empty claims (Supabase hook requirement).
  //             NEVER expose secret details in the response body.
  //
  // validateJWTHook reads req.text() internally. The raw body is returned in
  // result.body so we don't try to read a consumed stream again.
  const { valid, reason, body } = await validateJWTHook(req);
  if (!valid) {
    console.error('[custom-access-token] JWT hook validation failed:', reason);
    return new Response(JSON.stringify({ claims: {} }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  console.log(
    '[custom-access-token] Request received, method:',
    req.method,
    'content-type:',
    req.headers.get('content-type'),
  );

  let incomingClaims: Record<string, unknown> | undefined;
  try {
    // body is already read by validateJWTHook — do NOT call req.text() again
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(body!);
    } catch (parseError) {
      console.error(
        '[custom-access-token] Failed to parse body:',
        parseError,
        'Raw body:',
        body?.substring(0, 200),
      );
      return new Response(JSON.stringify({ claims: {} }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log('[custom-access-token] Payload keys:', Object.keys(payload || {}));
    console.log(
      '[custom-access-token] Has user_id:',
      !!payload?.user_id,
      'Has claims:',
      !!payload?.claims,
    );

    // Bug fix: Supabase hook payload has `user_id` at the root (string),
    // NOT `user.id` nested inside a user object.
    const userId = payload?.user_id as string | undefined;
    incomingClaims = payload?.claims as Record<string, unknown> | undefined;

    // If this hook is mis-invoked or payload is malformed, fail closed but keep 200.
    if (!userId || !incomingClaims) {
      console.error('[custom-access-token] Missing user_id/claims in hook payload');
      return new Response(JSON.stringify({ claims: incomingClaims ?? {} }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log('[custom-access-token] Processing token customization for user_id:', userId);

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[custom-access-token] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ claims: incomingClaims }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Crear cliente Supabase con service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar company_id y role del usuario
    let companyId: string | null = null;
    let userRole: string | null = null;

    try {
      // 1. Try Internal Users
      const { data: userData } = await supabase
        .from('users')
        .select(`company_id, app_role:app_roles(name)`)
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (userData) {
        companyId = userData.company_id;
        // @ts-ignore
        userRole = userData.app_role?.name || null;
        console.log('[custom-access-token] Found user data');
      } else {
        // 2. Try Clients
        const { data: clientData } = await supabase
          .from('clients')
          .select('company_id')
          .eq('auth_user_id', userId)
          .maybeSingle();

        if (clientData?.company_id) {
          companyId = clientData.company_id;
          userRole = 'client';
          console.log('[custom-access-token] Found client data');
        }
      }
    } catch (lookupError) {
      console.error('[custom-access-token] DB lookup failed:', lookupError);
      // Continue without extra claims on error
    }

    // Retornar claims
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
    // Auth hooks must always return 200, even on error
    return new Response(
      JSON.stringify({
        claims: incomingClaims ?? {},
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});
