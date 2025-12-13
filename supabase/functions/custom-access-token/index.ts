// Edge Function: custom-access-token
// Supabase Auth Hook para agregar company_id al JWT
// Documentación: https://supabase.com/docs/guides/auth/auth-hooks

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  try {
    const { user } = await req.json()
    
    console.log('[custom-access-token] Processing for user:', user.id)

    // Crear cliente Supabase con service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar company_id del usuario en la tabla users primero
    let companyId: string | null = null;
    
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (userData?.company_id) {
      companyId = userData.company_id;
      console.log('[custom-access-token] Found company_id in users:', companyId)
    } else {
      // Si no está en users, buscar en clients (portal de clientes)
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      
      if (clientData?.company_id) {
        companyId = clientData.company_id;
        console.log('[custom-access-token] Found company_id in clients:', companyId)
      }
    }

    // Retornar company_id como custom claim
    return new Response(
      JSON.stringify({
        app_metadata: {
          company_id: companyId
        },
        user_metadata: {}
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[custom-access-token] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
