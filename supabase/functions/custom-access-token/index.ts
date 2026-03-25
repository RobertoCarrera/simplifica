// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks
//
// SECURITY VECTORS REMEDIATION — Phase 1
// SEC-JWT-01, SEC-JWT-03: validateJWTHook() is now called FIRST, before any
// RLS or tenant-based logic, using the secret stored in Supabase Vault.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateJWTHook } from '../_shared/jwt-hook-validator.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req) => {
  // SEC-JWT-03: Validation order — secret check BEFORE any payload processing or RLS.
  // SEC-JWT-04: On failure, return HTTP 200 with empty claims (Supabase hook requirement).
  //             NEVER expose secret details in the response body.
  const { valid, reason } = await validateJWTHook(req);
  if (!valid) {
    console.error('[custom-access-token] JWT hook validation failed:', reason);
    return new Response(JSON.stringify({ claims: {} }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }

  let incomingClaims: Record<string, unknown> | undefined;
  try {
    const payload = await req.json();
    const user = payload?.user;
    incomingClaims = payload?.claims;

    // If this hook is mis-invoked or payload is malformed, fail closed but keep 200.
    if (!user || !user.id || !incomingClaims) {
      console.error('[custom-access-token] Missing user/claims in hook payload');
      return new Response(JSON.stringify({ claims: incomingClaims ?? {} }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log('[custom-access-token] Processing token customization');

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
        .eq('auth_user_id', user.id)
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
          .eq('auth_user_id', user.id)
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
