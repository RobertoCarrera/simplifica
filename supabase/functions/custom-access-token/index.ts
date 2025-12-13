// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  try {
    const payload = await req.json()
    const user = payload?.user
    const incomingClaims = payload?.claims

    // If this hook is mis-invoked or payload is malformed, fail closed but keep 200.
    // Returning invalid claims will fail auth anyway, but this avoids throwing here.
    if (!user || !user.id || !incomingClaims) {
      console.error('[custom-access-token] Missing user/claims in hook payload')
      return new Response(
        JSON.stringify({ claims: incomingClaims ?? {} }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }
    
    console.log('[custom-access-token] Processing for user:', user.id)

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[custom-access-token] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      return new Response(
        JSON.stringify({ claims: incomingClaims }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Crear cliente Supabase con service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar company_id del usuario en la tabla users primero
    let companyId: string | null = null;

    try {
      const { data: userData } = await supabase
        .from('users')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (userData?.company_id) {
        companyId = userData.company_id;
        console.log('[custom-access-token] Found company_id in users:', companyId)
      } else {
        // Si no está en users, buscar en clients (portal de clientes)
        const { data: clientData } = await supabase
          .from('clients')
          .select('company_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (clientData?.company_id) {
          companyId = clientData.company_id;
          console.log('[custom-access-token] Found company_id in clients:', companyId)
        }
      }
    } catch (lookupError) {
      console.error('[custom-access-token] Company lookup failed:', lookupError)
      // Never break auth if lookup fails; just omit company_id.
      companyId = null
    }

    // Retornar claims originales + company_id
    return new Response(
      JSON.stringify({
        claims: {
          ...incomingClaims,
          company_id: companyId
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
    return new Response(
      JSON.stringify({ 
        claims: {} 
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  }
})
