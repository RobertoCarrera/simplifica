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
        const {
            companyId,
            serviceId,
            professionalId, // Optional, generic resource otherwise
            startTime,
            customerName,
            customerEmail,
            customerPhone,
            notes
        } = payload;

        if (!companyId || !serviceId || !startTime || !customerEmail || !customerName) {
            return new Response(JSON.stringify({ error: 'Faltan datos obligatorios.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 1. Fetch Service & Config
        const { data: service, error: sErr } = await supabase
            .from('services')
            .select('*')
            .eq('id', serviceId)
            .single();

        if (sErr || !service) {
            return new Response(JSON.stringify({ error: 'Servicio no encontrado.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const start = new Date(startTime);
        const end = new Date(start.getTime() + (service.duration_minutes * 60000));
        const now = new Date();

        // 2. Validate Rules (Min Notice / Max Lead)
        if (service.min_notice_minutes) {
            const minNoticeMs = service.min_notice_minutes * 60000;
            if (start.getTime() < now.getTime() + minNoticeMs) {
                return new Response(JSON.stringify({ error: `Se requiere una antelación mínima de ${service.min_notice_minutes} minutos.` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        if (service.max_lead_days) {
            const maxLeadMs = service.max_lead_days * 24 * 60 * 60 * 1000;
            if (start.getTime() > now.getTime() + maxLeadMs) {
                return new Response(JSON.stringify({ error: `No se puede reservar con más de ${service.max_lead_days} días de antelación.` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        // 3. Assign Professional / Resource
        let assignedResourceId = professionalId;

        if (!assignedResourceId && service.required_resource_type) {
            // Find available resource logic (Simplified for MVP, ideally assume UI passed a valid slot/pro)
            // If the UI is "Widget", it usually asks user to pick a time, which implies picking a pro implicitly if logic is smart.
            // For now, if no pro is sent, we error or pick random?
            // Let's assume the Frontend sends the ID.
            return new Response(JSON.stringify({ error: 'No se ha seleccionado un profesional.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 4. Check Conflicts (Server Side Authority)
        // Re-implement checkProfessionalConflict logic
        const startStr = start.toISOString();
        const endStr = end.toISOString();
        const bufferMinutes = service.buffer_minutes || 0;

        // Effective End for New Booking
        const effectiveEndMs = end.getTime() + (bufferMinutes * 60000);
        const effectiveEndStr = new Date(effectiveEndMs).toISOString();

        // Search Window
        const searchStart = new Date(start.getTime() - 7200000).toISOString(); // -2h
        const searchEnd = effectiveEndStr;

        // Check availability exceptions (Blocks)
        const { data: blocks } = await supabase
            .from('availability_exceptions')
            .select('id')
            .eq('company_id', companyId)
            .or(`user_id.eq.${assignedResourceId},user_id.is.null`)
            .lt('start_time', effectiveEndStr)
            .gt('end_time', startStr);

        if (blocks && blocks.length > 0) {
            return new Response(JSON.stringify({ error: 'El horario seleccionado ya no está disponible (Bloqueo).' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Check existing bookings
        const { data: bookings } = await supabase
            .from('bookings')
            .select('start_time, end_time, service:services(buffer_minutes)')
            .eq('company_id', companyId)
            .eq('professional_id', assignedResourceId)
            .neq('status', 'cancelled')
            .lt('start_time', searchEnd)
            .gt('end_time', searchStart);

        if (bookings && bookings.length > 0) {
            for (const b of bookings) {
                const bStart = new Date(b.start_time).getTime();
                const bEnd = new Date(b.end_time).getTime();
                const bBuffer = (b.service as any)?.buffer_minutes || 0;
                const bEffectiveEnd = bEnd + (bBuffer * 60000);

                if (start.getTime() < bEffectiveEnd && effectiveEndMs > bStart) {
                    return new Response(JSON.stringify({ error: 'El horario seleccionado ya no está disponible (Conflicto).' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
            }
        }

        // 5. Create Client (Get or Create)
        let clientId = null;
        const { data: existingClient } = await supabase
            .from('clients')
            .select('id')
            .eq('company_id', companyId)
            .eq('email', customerEmail)
            .single();

        if (existingClient) {
            clientId = existingClient.id;
        } else {
            // Create new client
            const { data: newClient, error: cErr } = await supabase
                .from('clients')
                .insert({
                    company_id: companyId,
                    email: customerEmail,
                    first_name: customerName,
                    phone: customerPhone,
                    source: 'widget'
                })
                .select('id')
                .single();

            if (!cErr && newClient) clientId = newClient.id;
        }

        // 6. Insert Booking
        const { data: booking, error: bErr } = await supabase
            .from('bookings')
            .insert({
                company_id: companyId,
                service_id: serviceId,
                professional_id: assignedResourceId,
                client_id: clientId,
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                status: service.requires_confirmation ? 'pending' : 'confirmed',
                notes: notes,
                origin: 'widget'
            })
            .select()
            .single();

        if (bErr) throw bErr;

        return new Response(JSON.stringify(booking), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
});
