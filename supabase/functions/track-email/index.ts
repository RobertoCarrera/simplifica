import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1x1 Transparent GIF
const PIXEL_GIF = Uint8Array.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
    0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
]);

serve(async (req) => {
    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        // tracking_id can be passed as path param or query param
        // e.g. /track-email?id=123
        const trackingId = url.searchParams.get('id');

        if (trackingId) {
            // Log the open event in background (don't block response)
            logOpen(trackingId).catch(err => console.error('Tracking Error:', err));
        }

        return new Response(PIXEL_GIF, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'image/gif',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
        });

    } catch (error: any) {
        // Even on error, return the pixel to not break image in email client
        console.error('Tracking Handler Error:', error);
        return new Response(PIXEL_GIF, {
            headers: { 'Content-Type': 'image/gif' },
        });
    }
});

async function logOpen(trackingId: string) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Check if it's a Marketing Log (Campaign)
    // We assume trackingId matches database ID in 'marketing_logs' OR 'mail_messages'

    // First try marketing_logs
    const { data: mLog, error: mError } = await supabase
        .from('marketing_logs')
        .select('id, status, opened_at')
        .eq('id', trackingId)
        .single();

    if (mLog) {
        // Update marketing log
        if (!mLog.opened_at) {
            await supabase
                .from('marketing_logs')
                .update({
                    status: 'opened',
                    opened_at: new Date().toISOString()
                })
                .eq('id', trackingId);
        }
        return;
    }

    // 2. Try mail_messages (if we track individual one-off emails)
    // We need a 'tracking_id' metadata check or just ID check if we expose message ID directly (risky?)
    // Better to use a dedicated tracking table or metadata
}
