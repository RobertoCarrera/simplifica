// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const { companyId, serviceId, date, professionalId } = payload;

        if (!companyId || !serviceId || !date) {
            return new Response(JSON.stringify({ error: 'Faltan datos.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Fetch Service Details
        const { data: service, error: sErr } = await supabase
            .from('services')
            .select('duration_minutes, buffer_minutes, min_notice_minutes, max_lead_days, required_resource_type')
            .eq('id', serviceId)
            .single();

        if (sErr || !service) {
            return new Response(JSON.stringify({ error: 'Servicio no encontrado.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const duration = service.duration_minutes || 60;
        const buffer = service.buffer_minutes || 0;

        // 2. Define Day Range
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0); // Start of day provided? Assuming date string YYYY-MM-DD or similar
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        // Define Business Hours (Hardcoded MVP: 09:00 - 21:00)
        // Ideally fetch from company_settings
        const businessStartHour = 9;
        const businessEndHour = 21;

        // 3. Fetch Bookings & Exceptions for this Day
        const { data: bookings } = await supabase
            .from('bookings')
            .select('start_time, end_time, service:services(buffer_minutes)')
            .eq('company_id', companyId)
            // Filter by resource if specialized
            .neq('status', 'cancelled')
            .lt('start_time', dayEnd.toISOString())
            .gt('end_time', dayStart.toISOString());

        // Fetch Blocks
        let blockQuery = supabase
            .from('availability_exceptions')
            .select('start_time, end_time')
            .eq('company_id', companyId)
            .lt('start_time', dayEnd.toISOString())
            .gt('end_time', dayStart.toISOString());

        if (professionalId) {
            // If a specific pro is requested, check their blocks OR global blocks
            blockQuery = blockQuery.or(`user_id.eq.${professionalId},user_id.is.null`);
        }

        const { data: blocks } = await blockQuery;

        // 4. Generate & Filter Slots
        const slots: string[] = [];
        const slotResults: any[] = [];

        let current = new Date(dayStart);
        current.setHours(businessStartHour, 0, 0, 0);

        const endLimit = new Date(dayStart);
        endLimit.setHours(businessEndHour, 0, 0, 0);

        const now = new Date(); // For Min Notice check

        while (current.getTime() + (duration * 60000) <= endLimit.getTime()) {
            const slotStart = new Date(current);
            const slotEnd = new Date(current.getTime() + (duration * 60000));
            const slotEffectiveEnd = new Date(slotEnd.getTime() + (buffer * 60000));

            // Rule: Min Notice
            if (service.min_notice_minutes) {
                if (slotStart.getTime() < now.getTime() + (service.min_notice_minutes * 60000)) {
                    current.setMinutes(current.getMinutes() + 15); // Step 15m
                    continue;
                }
            }

            // Rule: Max Lead Time
            if (service.max_lead_days) {
                const maxLeadMs = service.max_lead_days * 24 * 60 * 60 * 1000;
                if (slotStart.getTime() > now.getTime() + maxLeadMs) {
                    current.setMinutes(current.getMinutes() + 15);
                    continue;
                }
            }

            let isFree = true;

            // Check Bookings Overlap
            if (bookings) {
                for (const b of bookings) {
                    const bStart = new Date(b.start_time).getTime();
                    const bEnd = new Date(b.end_time).getTime();
                    const bBuf = (b.service as any)?.buffer_minutes || 0;
                    const bEffectiveEnd = bEnd + (bBuf * 60000);

                    // Overlap: (SlotStart < B_EffEnd) AND (SlotEffEnd > B_Start)
                    if (slotStart.getTime() < bEffectiveEnd && slotEffectiveEnd.getTime() > bStart) {
                        isFree = false;
                        break;
                    }
                }
            }

            // Check Blocks Overlap
            if (isFree && blocks) {
                for (const bl of blocks) {
                    const blStart = new Date(bl.start_time).getTime();
                    const blEnd = new Date(bl.end_time).getTime();

                    if (slotStart.getTime() < blEnd && slotEffectiveEnd.getTime() > blStart) {
                        isFree = false;
                        break;
                    }
                }
            }

            if (isFree) {
                slots.push(slotStart.toISOString());
            }

            // Step increment (e.g., every 15 mins or duration?) 
            // Usually step is 15 or 30 mins to allow flexibility
            current.setMinutes(current.getMinutes() + 15);
        }

        return new Response(JSON.stringify({ slots }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
