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
    // Note: we no longer bail out early on missing awsConfig. Cancellations
    // and waitlist promotion don't need it (cancellation delegates to
    // send-branded-email which uses the company's configured email
    // account, waitlist uses the same path). The legacy direct-SES path
    // is only needed for INSERT (confirmation) and UPDATE→rescheduled
    // emails, which check awsConfig below.
    // ── Check email preferences ──────────────────────────────────────────
    const { data: emailPrefsData } = await supabase.from('company_settings').select('email_preferences').eq('company_id', companyId).maybeSingle();
    const emailPrefs = emailPrefsData?.email_preferences || {};
    const sendClientConfirmation = emailPrefs.booking_confirmation_client !== false; // default true
    const sendClientCancellation = emailPrefs.booking_cancellation_client !== false;
    const sendOwnerNotification = emailPrefs.booking_notification_owner !== false;
    const sendProfessionalNotification = emailPrefs.booking_notification_professional !== false;
    console.log('[booking-notifier] email preferences:', {
      sendClientConfirmation,
      sendClientCancellation,
      sendOwnerNotification,
      sendProfessionalNotification
    }); // Fallback?
    // ── Cancellation → delegate to send-branded-email (new flow) ───────
    // The legacy path used `aws_ses_config` from `companies.settings`, but
    // most tenants never set that up — they configured their email account
    // via the new Email Accounts admin panel (`company_email_accounts`
    // table, used by `send-branded-email`). So the old path always
    // returned "Skipped: No AWS Config" for those tenants and the client
    // never received the cancellation email.
    //
    // When the cancellation toggle is on, forward the call to
    // `send-branded-email` which knows how to use the company's configured
    // email account (SES shared, SES IAM, Google Workspace SMTP/OAuth, etc.).
    // The waitlist promotion still happens locally (it also delegates to
    // send-branded-email via the same path below).
    if (type === 'UPDATE' && record.status === 'cancelled' && old_record?.status !== 'cancelled') {
      console.log('[booking-notifier] CANCELLATION flow start. companyId:', companyId, 'bookingId:', record.id);
      console.log('[booking-notifier] email preferences raw:', JSON.stringify(emailPrefs));
      console.log('[booking-notifier] sendClientCancellation flag:', sendClientCancellation);

      // 1. Waitlist promotion — only if tenant has waitlist enabled
      await checkAndNotifyWaitlist(supabase, record, companyId);

      // 2. Cancellation email via the new branded sender.
      //    Always try to send unless the tenant has explicitly disabled the
      //    cancellation toggle. The previous "default off if missing"
      //    semantics was too strict — most tenants never open the
      //    preferences tab, so a missing record meant their cancellation
      //    emails silently dropped. Now: undefined → send (opt-out).
      if (sendClientCancellation) {
        const sendUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-branded-email`;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        console.log('[booking-notifier] forwarding cancellation to:', sendUrl);
        try {
          // Look up client + service for the email body
          const { data: bookingData } = await supabase.from('bookings').select(`
                *,
                client:client_id(email, name),
                service:service_id(name)
              `).eq('id', record.id).single();
          console.log('[booking-notifier] booking lookup result:', {
            found: !!bookingData,
            clientEmail: bookingData?.client?.email,
            serviceName: bookingData?.service?.name,
          });
          if (bookingData?.client?.email) {
            const startDate = new Date(record.start_time);
            const dateFormatter = new Intl.DateTimeFormat('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            });
            const timeFormatter = new Intl.DateTimeFormat('es-ES', {
              hour: '2-digit',
              minute: '2-digit'
            });
            const endDate = new Date(record.end_time || record.start_time);
            const res = await fetch(sendUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`
              },
              body: JSON.stringify({
                companyId,
                emailType: 'booking_cancellation',
                to: [
                  {
                    email: bookingData.client.email,
                    name: bookingData.client.name || ''
                  }
                ],
                data: {
                  servicio: bookingData.service?.name || 'Servicio',
                  fecha: dateFormatter.format(startDate),
                  hora: `${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`,
                  empresa: ''
                }
              })
            });
            const result = await res.json().catch(()=>({}));
            console.log('[booking-notifier] send-branded-email result:', res.status, JSON.stringify(result));
            if (!res.ok) {
              console.error('[booking-notifier] send-branded-email FAILED:', res.status, JSON.stringify(result));
            }
          } else {
            console.log('[booking-notifier] cancellation: no client email on booking, skipping');
          }
        } catch (sendErr) {
          console.error('[booking-notifier] Failed to forward to send-branded-email:', sendErr?.message);
        }
      } else {
        console.log('[booking-notifier] Cancellation email disabled in preferences, skipping');
      }
      return new Response(JSON.stringify({
        success: true,
        type: 'cancellation_handled'
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // From here on we need the legacy AWS SES path (used by INSERT
    // confirmations and reschedule notifications).
    if (!awsConfig || !awsConfig.access_key_id || !awsConfig.secret_access_key) {
      console.log('No AWS SES config for company, skipping legacy direct-SES path');
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
    // --- Standard Booking Notifications (legacy direct-SES) ---
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
        return new Response(JSON.stringify({
          message: 'Skipped: email preference disabled'
        }), {
          status: 200
        });
      }
      subject = 'Confirmación de Reserva';
      bodyHtml = `<h1>Hola ${clientName}</h1><p>Tu reserva para ${serviceName} el ${dateStr} está confirmada.</p>`;
    } else if (type === 'UPDATE' && record.status === 'cancelled') {
      if (!sendClientCancellation) {
        console.log('[booking-notifier] Skipping client cancellation email (disabled in preferences)');
        return new Response(JSON.stringify({
          message: 'Skipped: email preference disabled'
        }), {
          status: 200
        });
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
// Sends waitlist promotion emails via the new send-branded-email Edge Function
// (same flow as cancellations) so we use the company's configured email
// account instead of the legacy aws_ses_config blob.
async function checkAndNotifyWaitlist(supabase, booking, companyId) {
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
  const sendUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-branded-email`;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const startDate = new Date(booking.start_time);
  const dateStr = startDate.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    dateStyle: 'long',
    timeStyle: 'short'
  });
  for (const entry of entries){
    if (!entry.client?.email) continue;
    try {
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`
        },
        body: JSON.stringify({
          companyId,
          emailType: 'waitlist',
          to: [
            {
              email: entry.client.email,
              name: entry.client.name || ''
            }
          ],
          data: {
            servicio: entry.service?.name || 'Servicio',
            fecha: dateStr,
            empresa: '',
            heading: '¡Hueco disponible!',
            body_text: `Se ha liberado un hueco para ${entry.service?.name || 'el servicio'}. Entra al portal para reservarlo antes de que se ocupe.`
          }
        })
      });
      console.log(`[booking-notifier] waitlist email for ${entry.client.email}: status=${res.status}`);
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
