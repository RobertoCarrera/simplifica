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

    // Fetch paid invoices for the company
    const { data: invoices, error: invoicesError } = await supabaseClient
      .from('invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'paid'); // Only paid invoices

    if (invoicesError) throw invoicesError;

    if (!invoices || invoices.length === 0) {
      return new Response(JSON.stringify({ topProducts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Retrieve line items from invoice_items table for the selected invoices
    const invoiceIds = invoices.map((i: any) => i.id);
    // Chunk to avoid overly long URL (PostgREST supports up to some length)
    const chunkSize = 200;
    const productMap = new Map<string, { name: string; quantity: number }>();
    for (let i = 0; i < invoiceIds.length; i += chunkSize) {
      const chunk = invoiceIds.slice(i, i + chunkSize);
      const { data: items, error: itemsError } = await supabaseClient
        .from('invoice_items')
        .select('product_id,name,quantity,description,invoice_id')
        .in('invoice_id', chunk);
      if (itemsError) throw itemsError;

      for (const it of items || []) {
        const prodId = it.product_id || `name:${it.name || it.description || 'Producto sin nombre'}`;
        const prodName = it.name || it.description || 'Producto sin nombre';
        const qty = Number(it.quantity) || 0;
        const prev = productMap.get(prodId);
        if (prev) prev.quantity += qty; else productMap.set(prodId, { name: prodName, quantity: qty });
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
