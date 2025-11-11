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

    // Buscar company_id del usuario en la tabla users
    const { data: userData, error } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single()

    if (error) {
      console.error('[custom-access-token] Error fetching user:', error)
      // Si no encuentra el usuario, no agregar claim (permitir continuar)
      return new Response(
        JSON.stringify({ 
          app_metadata: {}, 
          user_metadata: {} 
        }),
        { 
          headers: { 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    console.log('[custom-access-token] Found company_id:', userData?.company_id)

    // Retornar company_id como custom claim
    return new Response(
      JSON.stringify({
        app_metadata: {
          company_id: userData?.company_id || null
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
