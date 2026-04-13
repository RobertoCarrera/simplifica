import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SYNC - Booking Sync Edge Function (Private Project)
 * Security: HMAC Signature Verification
 * Purpose: Receives new bookings from the Public DMZ via Webhook and syncs them to the private DB.
 */

const WEBHOOK_SECRET = Deno.env.get('SYNC_WEBHOOK_SECRET');

async function verifySignature(body: string, signature: string | null) {
    if (!signature || !WEBHOOK_SECRET) return false;
    
    // Cloudflare/Supabase Webhook format is usually 'sha256=hex'
    const [algo, sig] = signature.split('=');
    if (algo !== 'sha256') return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
    );

    const isVerified = await crypto.subtle.verify(
        "HMAC",
        key,
        // Conversion from hex string to Uint8Array
        new Uint8Array(sig.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))),
        encoder.encode(body)
    );

    return isVerified;
}

serve(async (req) => {
    const userAgent = req.headers.get('user-agent') || '';
    
    // Capa de seguridad 0: Solo tráfico que emane de la infraestructura de Supabase
    if (!userAgent.includes('Supabase-Hooks')) {
        console.error('Forbidden: Invalid Request Origin Agent');
        return new Response(JSON.stringify({ error: 'Access denied: Invalid source' }), { status: 403 });
    }

    const signature = req.headers.get('x-supabase-signature') || req.headers.get('x-webhook-signature');
    const bodyText = await req.text();

    // 1. Verify HMAC Signature
    if (!await verifySignature(bodyText, signature)) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid signature' }), { status: 401 });
    }

    try {
        const payload = JSON.parse(bodyText);
        const { record } = payload; // Supabase Webhook payload structure

        if (!record || record.status !== 'pending') {
            return new Response(JSON.stringify({ message: 'No action needed' }), { status: 200 });
        }

        // 2. Map Public Data to Private Schema
        // Initialize private client with service role
        const supabasePrivate = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Find company_id by slug
        const { data: company } = await supabasePrivate
            .from('companies')
            .select('id')
            .eq('slug', record.company_slug)
            .single();

        if (!company) throw new Error(`Company slug ${record.company_slug} not found`);

        // 3. Insert into real bookings table
        const { data: newBooking, error: bookingError } = await supabasePrivate.from('bookings').insert({
            company_id: company.id,
            booking_type_id: record.booking_type_id,
            client_name: record.client_name,
            client_email: record.client_email,
            client_phone: record.client_phone,
            start_time: `${record.requested_date}T${record.requested_time}`,
            professional_id: record.professional_id,
            source: 'public_portal',
            status: 'pending'
        }).select().single();

        if (bookingError) throw bookingError;

        // 3b. Auto-generate quote from booking
        try {
          const { data: quoteResult, error: quoteError } = await supabasePrivate.rpc(
            'generate_quote_from_booking',
            { p_booking_id: newBooking.id, p_trigger_source: 'sync_booking' }
          );
          if (quoteError) {
            console.error('⚠️ Quote auto-generation failed (non-blocking):', quoteError.message);
          } else if (quoteResult?.success) {
            console.log('✅ Quote auto-generated from sync-booking:', quoteResult.quote_id);
          }
        } catch (quoteErr: any) {
          console.error('⚠️ Quote generation exception (non-blocking):', quoteErr.message);
        }

        // 4. Update Public Record (Callback to DMZ)
        // You'll need to configure PUBLIC_SUPABASE_URL/KEY in private project secrets
        const supabasePublic = createClient(
            Deno.env.get('PUBLIC_SUPABASE_URL') ?? '',
            Deno.env.get('PUBLIC_SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        await supabasePublic.from('public_bookings').update({
            status: 'synced',
            synced_at: new Date().toISOString()
        }).eq('id', record.id);

        return new Response(JSON.stringify({ success: true, booking_id: newBooking.id }), { status: 200 });

    } catch (error: any) {
        console.error('Sync Error:', error.message);
        return new Response(JSON.stringify({ error: 'Internal sync error', details: error.message }), { status: 500 });
    }
});
