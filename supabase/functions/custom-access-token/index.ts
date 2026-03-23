// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// SECURITY: Hook signing secret — must match the value set in Supabase Auth Hook settings.
// Without this check any caller with a valid user.id can obtain company_id/role data.
const HOOK_SECRET = Deno.env.get('SUPABASE_AUTH_HOOK_SECRET') ?? ''

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to avoid short-circuit timing leak on length alone
    let dummy = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) dummy |= 0;
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req) => {
  // SECURITY: Verify hook signing secret before processing any payload.
  // Auth hooks MUST always return 200, so we return empty claims on failure
  // rather than a non-200 status (which could break sign-in flows).
  if (HOOK_SECRET) {
    const authHeader = req.headers.get('Authorization') ?? '';
    const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!timingSafeEqual(providedSecret, HOOK_SECRET)) {
      console.error('[custom-access-token] Invalid hook signing secret — rejecting request')
      return new Response(
        JSON.stringify({ claims: {} }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }
  } else {
    console.error('[custom-access-token] CRITICAL: SUPABASE_AUTH_HOOK_SECRET is not configured. Refusing to process hook.')
    return new Response(
      JSON.stringify({ claims: {} }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
  }

  let incomingClaims: Record<string, any> | undefined;
  try {
    const payload = await req.json()
    const user = payload?.user
    incomingClaims = payload?.claims

    // If this hook is mis-invoked or payload is malformed, fail closed but keep 200.
    // Returning invalid claims will fail auth anyway, but this avoids throwing here.
    if (!user || !user.id || !incomingClaims) {
      console.error('[custom-access-token] Missing user/claims in hook payload')
      return new Response(
        JSON.stringify({ claims: incomingClaims ?? {} }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log('[custom-access-token] Processing token customization')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[custom-access-token] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      return new Response(
        JSON.stringify({ claims: incomingClaims }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Crear cliente Supabase con service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar company_id y role del usuario
    let companyId: string | null = null;
    let userRole: string | null = null;

    try {
      // 1. Try Internal Users
      const { data: userData } = await supabase
        .from('users')
        .select(`company_id, app_role:app_roles(name)`)
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (userData) {
        companyId = userData.company_id;
        // @ts-ignore
        userRole = userData.app_role?.name || null;
        console.log('[custom-access-token] Found user data')
      } else {
        // 2. Try Clients
        const { data: clientData } = await supabase
          .from('clients')
          .select('company_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (clientData?.company_id) {
          companyId = clientData.company_id;
          userRole = 'client';
          console.log('[custom-access-token] Found client data')
        }
      }
    } catch (lookupError) {
      console.error('[custom-access-token] DB lookup failed:', lookupError)
      // Continue without extra claims on error
    }

    // Retornar claims
    return new Response(
      JSON.stringify({
        claims: {
          ...incomingClaims,
          company_id: companyId,
          user_role: userRole
        }
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[custom-access-token] Unexpected error:', error)
    // Auth hooks must always return 200, even on error
    // Preserve incoming claims so we don't wipe JWT data
    return new Response(
      JSON.stringify({
        claims: incomingClaims ?? {}
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  }
})
