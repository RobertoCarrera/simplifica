// @ts-nocheck
// Edge Function: booking-notifier
// Purpose: Listen to Database Webhooks on 'bookings' table and send email notifications via AWS SES.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// --- AWS SES Signing Logic (Reused) ---
const te = new TextEncoder();
function toHex(buf) {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map((b)=>b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(data) {
  const uint8 = typeof data === 'string' ? te.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', uint8);
  return toHex(hash);
}
async function hmacSha256Raw(key, data) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, {
    name: 'HMAC',
    hash: 'SHA-256'
  }, false, [
    'sign'
  ]);
  const uint8 = typeof data === 'string' ? te.encode(data) : data;
  return await crypto.subtle.sign('HMAC', cryptoKey, uint8);
}
async function deriveSigningKey(secretKey, dateStamp, region, service) {
  const kDate = await hmacSha256Raw(te.encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  return await hmacSha256Raw(kService, 'aws4_request');
}
async function signAwsRequest({ method, url, region, service, accessKeyId, secretAccessKey, body }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = url.pathname;
  const canonicalQuery = url.search.slice(1);
  const host = url.host;
  const payloadHash = await sha256Hex(body);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;
  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256Raw(signingKey, stringToSign));
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    authorization,
    amzDate,
    payloadHash
  };
}
// --- Main Handler ---
serve(async (req)=>{
  try {
    const { type, record, old_record } = await req.json();
    // Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Fetch Company Settings (AWS Creds)
    const companyId = record.company_id;
    const { data: company, error: companyError } = await supabase.from('companies').select('settings').eq('id', companyId).single();
    if (companyError || !company) {
      console.error('Company not found');
      return new Response(JSON.stringify({
        error: 'Company not found'
      }), {
        status: 400
      });
    }
    const settings = company.settings || {};
    const awsConfig = settings.aws_ses_config;
    if (!awsConfig || !awsConfig.access_key_id || !awsConfig.secret_access_key) {
      console.log('No AWS SES config for company');
      return new Response(JSON.stringify({
        message: 'Skipped: No AWS Config'
      }), {
        status: 200
      });
    }
    const region = awsConfig.region || 'eu-west-1';
    const accessKeyId = awsConfig.access_key_id;
    const secretAccessKey = awsConfig.secret_access_key;
    const fromEmail = awsConfig.from_email || 'notifications@simplifica.com';

    // ── Check email preferences ──────────────────────────────────────────
    const { data: emailPrefsData } = await supabase
      .from('company_settings')
      .select('email_preferences')
      .eq('company_id', companyId)
      .maybeSingle();
    const emailPrefs = emailPrefsData?.email_preferences || {};
    const sendClientConfirmation = emailPrefs.booking_confirmation_client !== false; // default true
    const sendClientCancellation = emailPrefs.booking_cancellation_client !== false;
    const sendOwnerNotification = emailPrefs.booking_notification_owner !== false;
    const sendProfessionalNotification = emailPrefs.booking_notification_professional !== false;

    console.log('[booking-notifier] email preferences:', { sendClientConfirmation, sendClientCancellation, sendOwnerNotification, sendProfessionalNotification }); // Fallback?
    // --- Waitlist Logic (Cancellation) ---
    if (type === 'UPDATE' && record.status === 'cancelled' && old_record?.status !== 'cancelled') {
      await checkAndNotifyWaitlist(supabase, record, region, accessKeyId, secretAccessKey, fromEmail);
      return new Response(JSON.stringify({
        success: true,
        type: 'waitlist_check'
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // --- Standard Booking Notifications ---
    if (record.status === 'cancelled') {
    // Cancellation Email Logic (already existed or generic)
    // For now assume generic logic below handles "Booking Cancelled" email to the user himself
    }
    // Fetch Client & Service
    const { data: bookingData } = await supabase.from('bookings').select(`
                *,
                client:client_id(email, name),
                service:service_id(name)
            `).eq('id', record.id).single();
    if (!bookingData?.client?.email) {
      return new Response(JSON.stringify({
        message: 'No client email'
      }), {
        status: 200
      });
    }
    const clientEmail = bookingData.client.email;
    const clientName = bookingData.client.name;
    const serviceName = bookingData.service?.name || 'Servicio';
    const dateStr = new Date(record.start_time).toLocaleString();
    let subject = '';
    let bodyHtml = '';
        if (type === 'INSERT') {
            if (!sendClientConfirmation) {
              console.log('[booking-notifier] Skipping client confirmation email (disabled in preferences)');
              return new Response(JSON.stringify({ message: 'Skipped: email preference disabled' }), { status: 200 });
            }
            subject = 'Confirmación de Reserva';
      bodyHtml = `<h1>Hola ${clientName}</h1><p>Tu reserva para ${serviceName} el ${dateStr} está confirmada.</p>`;
        } else if (type === 'UPDATE' && record.status === 'cancelled') {
             if (!sendClientCancellation) {
               console.log('[booking-notifier] Skipping client cancellation email (disabled in preferences)');
               return new Response(JSON.stringify({ message: 'Skipped: email preference disabled' }), { status: 200 });
             }
             subject = 'Reserva Cancelada';
      bodyHtml = `<h1>Hola ${clientName}</h1><p>Tu reserva para ${serviceName} el ${dateStr} ha sido cancelada.</p>`;
    } else if (type === 'UPDATE' && record.status === 'rescheduled') {
      subject = 'Reserva Reprogramada';
      bodyHtml = `<h1>Hola ${clientName}</h1><p>Tu reserva ha sido cambiada a: ${serviceName} el ${dateStr}.</p>`;
    } else {
      return new Response(JSON.stringify({
        message: 'No notification needed'
      }), {
        status: 200
      });
    }
    // Send Email
    const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
    const sesBody = JSON.stringify({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [
          clientEmail
        ]
      },
      Content: {
        Simple: {
          Subject: {
            Data: subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: bodyHtml,
              Charset: 'UTF-8'
            }
          }
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
      throw new Error('SES Failed: ' + errText);
    }
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
// --- Helper to Notify Waitlist ---
async function checkAndNotifyWaitlist(supabase, booking, region, accessKeyId, secretAccessKey, fromEmail) {
  console.log('Checking waitlist for cancelled booking:', booking.id);
  // 1. Find matching waitlist entries
  // Overlap: (Waitlist.Start < Booking.End) AND (Waitlist.End > Booking.Start)
  const { data: entries, error } = await supabase.from('waitlist').select(`
            *,
            client:client_id (email, name),
            service:service_id (name)
        `).eq('company_id', booking.company_id).eq('service_id', booking.service_id).eq('status', 'pending').lt('start_time', booking.end_time).gt('end_time', booking.start_time);
  if (error) {
    console.error('Error fetching waitlist:', error);
    return;
  }
  if (!entries || entries.length === 0) {
    console.log('No waitlist entries found for this slot.');
    return;
  }
  console.log(`Found ${entries.length} waitlist entries. sending emails...`);
  // 2. Send Email to each
  for (const entry of entries){
    if (!entry.client?.email) continue;
    const subject = `¡Hueco disponible! Tu cita de espera para ${entry.service?.name || 'Servicio'}`;
    const dateStr = new Date(booking.start_time).toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'long',
      timeStyle: 'short'
    });
    const bodyHtml = `
            <h2>¡Buenas noticias, ${entry.client.name || 'Cliente'}!</h2>
            <p>Se ha liberado un hueco para <strong>${entry.service?.name || 'el servicio'}</strong>.</p>
            <p><strong>Fecha:</strong> ${dateStr}</p>
            <p>Este hueco ahora está disponible. Por favor, entra al portal para reservarlo antes de que se ocupe.</p>
            <br>
            <a href="https://app.simplifica.com/portal" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir al Portal</a>
        `;
    try {
      await sendSesEmail(region, accessKeyId, secretAccessKey, fromEmail, entry.client.email, subject, bodyHtml);
      // Optional: Mark as notified? 
      await supabase.from('waitlist').update({
        status: 'notified',
        updated_at: new Date()
      }).eq('id', entry.id);
    } catch (e) {
      console.error(`Failed to send waitlist email to ${entry.client.email}`, e);
    }
  }
}
async function sendSesEmail(region, accessKeyId, secretAccessKey, from, to, subject, html) {
  const endpoint = new URL(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
  const sesBody = JSON.stringify({
    FromEmailAddress: from,
    Destination: {
      ToAddresses: [
        to
      ]
    },
    Content: {
      Simple: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: html,
            Charset: 'UTF-8'
          }
        }
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
  const res = await fetch(endpoint.toString(), {
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
  if (!res.ok) throw new Error(await res.text());
}
