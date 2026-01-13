// @ts-nocheck
// Edge Function: booking-notifier
// Purpose: Listen to Database Webhooks on 'bookings' table and send email notifications via AWS SES.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- AWS SES Signing Logic (Reused) ---
const te = new TextEncoder();
function toHex(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(data: string | Uint8Array): Promise<string> {
    const uint8 = typeof data === 'string' ? te.encode(data) : data;
    const hash = await crypto.subtle.digest('SHA-256', uint8);
    return toHex(hash);
}
async function hmacSha256Raw(key: ArrayBuffer, data: string | Uint8Array): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const uint8 = typeof data === 'string' ? te.encode(data) : data;
    return await crypto.subtle.sign('HMAC', cryptoKey, uint8);
}
async function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
    const kDate = await hmacSha256Raw(te.encode('AWS4' + secretKey), dateStamp);
    const kRegion = await hmacSha256Raw(kDate, region);
    const kService = await hmacSha256Raw(kRegion, service);
    const kSigning = await hmacSha256Raw(kService, 'aws4_request');
    return kSigning;
}
function amzDates(now: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = now.getUTCFullYear();
    const MM = pad(now.getUTCMonth() + 1);
    const dd = pad(now.getUTCDate());
    const HH = pad(now.getUTCHours());
    const mm = pad(now.getUTCMinutes());
    const ss = pad(now.getUTCSeconds());
    const amzDate = `${yyyy}${MM}${dd}T${HH}${mm}${ss}Z`;
    const dateStamp = `${yyyy}${MM}${dd}`;
    return { amzDate, dateStamp };
}
async function signAwsRequest(opts: {
    method: string; url: URL; region: string; service: string; accessKeyId: string; secretAccessKey: string; body?: string;
}) {
    const { method, url, region, service, accessKeyId, secretAccessKey } = opts;
    const body = opts.body ?? '';
    const { amzDate, dateStamp } = amzDates(new Date());
    const host = url.host;
    const payloadHash = await sha256Hex(body);
    const headers: Record<string, string> = { host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
    const sortedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
    const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k] !== undefined ? String(headers[k]).trim().replace(/\s+/g, ' ') : ''}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');
    const canonicalQuery = url.searchParams.toString() ?
        Array.from(url.searchParams.entries())
            .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
            .sort((a, b) => a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : (a[0] < b[0] ? -1 : 1))
            .map(([k, v]) => `${k}=${v}`)
            .join('&') : '';
    const canonicalRequest = [method.toUpperCase(), url.pathname || '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const canonicalRequestHash = await sha256Hex(canonicalRequest);
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
    const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
    const signature = toHex(await hmacSha256Raw(signingKey, stringToSign));
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { authorization, amzDate, payloadHash };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    try {
        // --- Security Check ---
        // Verify the request comes from our Database Trigger (or trusted source)
        const secret = req.headers.get('x-webhook-secret');
        const expectedSecret = Deno.env.get('WEBHOOK_SECRET') || 'simplifica-booking-webhook-secret';

        if (secret !== expectedSecret) {
            return new Response('Unauthorized', { status: 401 });
        }

        const payload = await req.json();
        // Payload structure from pg_net webhook: { type: 'INSERT'|'UPDATE', table: 'bookings', record: {...}, old_record: {...}, schema: 'public' }

        const { type, record, old_record } = payload;

        if (!record) {
            return new Response('No record found', { status: 400 });
        }

        // --- Determine Notification Type ---
        let notificationType = null; // 'confirmation', 'cancellation', 'reschedule'

        if (type === 'INSERT') {
            notificationType = 'confirmation';
        } else if (type === 'UPDATE') {
            if (record.status === 'cancelled' && old_record.status !== 'cancelled') {
                notificationType = 'cancellation';
            } else if (
                record.status !== 'cancelled' &&
                (record.start_time !== old_record.start_time || record.end_time !== old_record.end_time)
            ) {
                notificationType = 'reschedule';
            }
        }

        if (!notificationType) {
            return new Response('No notification required', { status: 200 });
        }

        // --- Fetch Context Data ---
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // Webhook uses service role usually, or anon if configured

        // We need service role to read company settings if RLS blocks us
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch Service Details
        const { data: service } = await supabase.from('services').select('name').eq('id', record.service_id).single();

        // Fetch Company Settings (for Branding)
        const { data: company } = await supabase.from('companies').select('name').eq('id', record.company_id).single();
        if (!company) throw new Error("Company found");

        // Recipient
        const toEmail = record.customer_email;
        const toName = record.customer_name;

        if (!toEmail) return new Response('No customer email', { status: 200 });

        // --- Format Data ---
        const serviceName = service?.name || 'Servicio';
        const companyName = company.name || 'Simplifica';

        // Date Formatting
        const startDate = new Date(record.start_time);
        const dateStr = startDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        // --- Email Content Construction ---
        let subject = '';
        let bodyHtml = '';

        const commonStyle = `font-family: Arial, sans-serif; line-height: 1.6; color: #333;`;
        const containerStyle = `max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;`;
        const headerStyle = `font-size: 20px; font-weight: bold; color: #000; margin-bottom: 20px;`;
        const detailsStyle = `background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;`;

        if (notificationType === 'confirmation') {
            subject = `✅ Reserva Confirmada: ${serviceName}`;
            bodyHtml = `
                <div style="${commonStyle}">
                    <div style="${containerStyle}">
                        <div style="${headerStyle}">¡Tu reserva está confirmada!</div>
                        <p>Hola ${toName},</p>
                        <p>Tu cita para <strong>${serviceName}</strong> en <strong>${companyName}</strong> ha sido reservada con éxito.</p>
                        <div style="${detailsStyle}">
                            <p><strong>Fecha:</strong> ${dateStr}</p>
                            <p><strong>Hora:</strong> ${timeStr}</p>
                            <p><strong>Lugar:</strong> ${companyName}</p>
                        </div>
                        <p>Si necesitas modificar o cancelar tu cita, puedes hacerlo desde tu panel de cliente.</p>
                        <p>¡Te esperamos!</p>
                    </div>
                </div>
            `;
        } else if (notificationType === 'cancellation') {
            subject = `❌ Reserva Cancelada: ${serviceName}`;
            bodyHtml = `
                <div style="${commonStyle}">
                    <div style="${containerStyle}">
                        <div style="${headerStyle}">Reserva Cancelada</div>
                        <p>Hola ${toName},</p>
                        <p>Te confirmamos que tu cita para <strong>${serviceName}</strong> el <strong>${dateStr}</strong> a las <strong>${timeStr}</strong> ha sido cancelada.</p>
                        <p>Si esto ha sido un error o deseas programar una nueva cita, por favor visita nuestro portal.</p>
                    </div>
                </div>
            `;
        } else if (notificationType === 'reschedule') {
            subject = `📅 Reserva Reprogramada: ${serviceName}`;
            bodyHtml = `
                <div style="${commonStyle}">
                    <div style="${containerStyle}">
                        <div style="${headerStyle}">Cambio de cita confirmado</div>
                        <p>Hola ${toName},</p>
                        <p>Tu cita para <strong>${serviceName}</strong> ha sido actualizada.</p>
                        <div style="${detailsStyle}">
                            <p><strong>Nueva Fecha:</strong> ${dateStr}</p>
                            <p><strong>Nueva Hora:</strong> ${timeStr}</p>
                        </div>
                        <p>¡Gracias!</p>
                    </div>
                </div>
            `;
        }

        // --- AWS SES Sending ---
        const region = Deno.env.get('AWS_REGION') ?? 'us-east-1';
        const accessKeyId = Deno.env.get('AWS_ACCESS_KEY_ID');
        const secretAccessKey = Deno.env.get('AWS_SECRET_ACCESS_KEY');
        const fromEmail = Deno.env.get('SES_FROM_ADDRESS') || 'notifications@example.com';

        if (!accessKeyId || !secretAccessKey) throw new Error("Missing AWS Credentials");

        const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
        const sesBody = JSON.stringify({
            FromEmailAddress: fromEmail,
            Destination: { ToAddresses: [toEmail] },
            Content: {
                Simple: {
                    Subject: { Data: subject, Charset: 'UTF-8' },
                    Body: { Html: { Data: bodyHtml, Charset: 'UTF-8' } }
                }
            }
        });

        const { authorization, amzDate, payloadHash } = await signAwsRequest({
            method: 'POST',
            url: endpoint,
            region,
            service: 'ses',
            accessKeyId,
            secretAccessKey,
            body: sesBody
        });

        const sesRes = await fetch(endpoint.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authorization,
                'x-amz-date': amzDate,
                'x-amz-content-sha256': payloadHash,
                'Host': endpoint.host
            },
            body: sesBody
        });

        if (!sesRes.ok) {
            const errText = await sesRes.text();
            console.error('AWS SES Failed:', errText);
            throw new Error('SES Failed: ' + errText);
        }

        return new Response(JSON.stringify({ success: true, type: notificationType }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err: any) {
        console.error(err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});
