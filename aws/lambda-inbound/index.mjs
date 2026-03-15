import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { simpleParser } from 'mailparser';

const ses = new SESClient({ region: 'eu-west-3' });
const s3 = new S3Client({ region: 'eu-west-3' });

// CONFIGURATION
const config = {
  supabaseUrl: process.env['SUPABASE_URL'],
  supabaseServiceKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_ANON_KEY'], // Service Role Key is preferred to bypass RLS
  inboundSecret: (() => {
    const secret = process.env['INBOUND_WEBHOOK_SECRET'];
    if (!secret) {
      console.error('CRITICAL: INBOUND_WEBHOOK_SECRET environment variable is not set!');
      throw new Error('Missing required INBOUND_WEBHOOK_SECRET');
    }
    return secret;
  })(),
  // No longer hardcoding specific emails here.
  // We will dynamically forward based on the recipient domain.
  defaultForwardTarget: 'robertocarreratech@gmail.com',
};

export const handler = async (event) => {
  console.log('Received SES event:', JSON.stringify(event, null, 2));

  const record = event.Records[0];
  const sesNotification = record.ses;
  const mailMetadata = sesNotification.mail;
  const messageId = mailMetadata.messageId;
  const receipt = sesNotification.receipt;

  // Use the primary recipient from SES metadata as the source for forwarding
  // This avoids hardcoding "roberto@..."
  const primaryRecipient = receipt.recipients[0];

  const bucket = 'simplifica-inbound-emails';
  const key = `incoming/${messageId}`;

  try {
    // 1. Get raw email from S3
    const s3Response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const rawEmailString = await s3Response.Body.transformToString();

    // Fix Duplicate header issue for SES SendRawEmail
    // SES rejects forwards with multiple DKIM-Signature headers or existing Message-ID/Return-Path
    const safeRawEmailString = rawEmailString
      .replace(/^DKIM-Signature:/gim, 'X-Original-DKIM-Signature:')
      .replace(/^Message-ID:/gim, 'X-Original-Message-ID:')
      .replace(/^Return-Path:/gim, 'X-Original-Return-Path:');

    const safeRawEmailBuffer = Buffer.from(safeRawEmailString, 'utf-8');

    // 2. FORWARD to Gmail (Dynamic based on recipients)
    for (const recipient of receipt.recipients) {
      // We can still use a mapping if needed, but for now we forward everything
      // arriving at this domain to your master inbox to ensure 2FA always works.
      console.log(`Forwarding email received at ${recipient} to ${config.defaultForwardTarget}`);
      try {
        await ses.send(
          new SendRawEmailCommand({
            RawMessage: { Data: safeRawEmailBuffer },
            Destinations: [config.defaultForwardTarget],
            Source: recipient, // Use the actual recipient as source (authorized domain)
          }),
        );
      } catch (sesErr) {
        console.error(`SES Forwarding failed for ${recipient}:`, sesErr);
      }
    }

    // 3. PARSE and SEND to Supabase
    // mailparser expects a string or Buffer, not a Uint8Array
    const parsedEmail = await simpleParser(rawEmailString);
    const payload = {
      to: receipt.recipients[0],
      from: {
        name: parsedEmail.from?.value[0]?.name || '',
        email: parsedEmail.from?.value[0]?.address || parsedEmail.from?.text,
      },
      subject: parsedEmail.subject || 'Sin Asunto',
      body: parsedEmail.text || '',
      html_body: parsedEmail.html || '',
      messageId: messageId,
      inReplyTo: parsedEmail.inReplyTo,
      s3_key: key,
    };

    const edgeUrl = `${config.supabaseUrl}/functions/v1/process-inbound-email`;
    console.log('Sending to Supabase Edge Function:', edgeUrl);

    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.supabaseServiceKey}`,
        'x-inbound-secret': config.inboundSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      console.error(`Supabase error (${response.status}):`, errorDetail);
      // We don't throw here to avoid SES retries if we already forwarded to Gmail
    } else {
      console.log('Successfully integrated in CRM database.');
    }

    return { statusCode: 200, body: 'Processed' };
  } catch (error) {
    console.error('Global Lambda Error:', error);
    // Only throw if critical, otherwise SES might keep retrying
    return { statusCode: 500, body: error.message };
  }
};
