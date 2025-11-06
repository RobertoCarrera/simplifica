// @ts-nocheck
// Deno runtime Edge Function for Supabase
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TopProduct {
  productId: string;
  productName: string;
  totalQuantitySold: number;
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

    // Get current user and company
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Usuario no autenticado');
    }

    const { data: userData } = await supabaseClient
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single();

    const companyId = userData?.company_id;

    if (!companyId) {
      throw new Error('Usuario sin compañía asignada');
    }

    // Get all invoice items for the company
    // We'll aggregate by product_id from invoice_items
    const { data: invoices, error: invoicesError } = await supabaseClient
      .from('invoices')
      .select('id, items')
      .eq('company_id', companyId)
      .eq('status', 'paid'); // Only paid invoices

    if (invoicesError) throw invoicesError;

    // Aggregate products
    const productMap = new Map<string, { name: string; quantity: number }>();

    for (const invoice of invoices || []) {
      const items = (invoice.items || []) as any[];
      for (const item of items) {
        const prodId = item.product_id;
        const prodName = item.name || item.description || 'Producto sin nombre';
        const qty = Number(item.quantity) || 0;

        if (prodId) {
          const existing = productMap.get(prodId);
          if (existing) {
            existing.quantity += qty;
          } else {
            productMap.set(prodId, { name: prodName, quantity: qty });
          }
        }
      }
    }

    // Convert to array and sort by quantity
    const topProducts: TopProduct[] = Array.from(productMap.entries())
      .map(([id, data]) => ({
        productId: id,
        productName: data.name,
        totalQuantitySold: data.quantity,
      }))
      .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
      .slice(0, 3); // Top 3

    return new Response(JSON.stringify({ topProducts }), {
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
