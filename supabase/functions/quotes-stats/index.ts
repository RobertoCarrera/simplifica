// @ts-nocheck
// Deno runtime Edge Function for Supabase
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuoteStats {
  pendingTotal: number;
  acceptedSinceLastSession: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Usuario no autenticado');
    }

    // Get user's last session timestamp from user metadata or profiles
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('last_session_at')
      .eq('id', user.id)
      .single();

    const lastSessionAt = profile?.last_session_at 
      ? new Date(profile.last_session_at)
      : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h

    // Get user's company_id
    const { data: userData } = await supabaseClient
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single();

    const companyId = userData?.company_id;

    if (!companyId) {
      throw new Error('Usuario sin compañía asignada');
    }

    // Count pending quotes (total, regardless of last session)
    const { count: pendingTotal, error: pendingError } = await supabaseClient
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['draft', 'sent']);

    if (pendingError) throw pendingError;

    // Count accepted quotes since last session
    const { count: acceptedCount, error: acceptedError } = await supabaseClient
      .from('quotes')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'accepted')
      .gte('updated_at', lastSessionAt.toISOString());

    if (acceptedError) throw acceptedError;

    // Update last_session_at for next time
    await supabaseClient
      .from('profiles')
      .update({ last_session_at: new Date().toISOString() })
      .eq('id', user.id);

    const stats: QuoteStats = {
      pendingTotal: pendingTotal || 0,
      acceptedSinceLastSession: acceptedCount || 0,
    };

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
