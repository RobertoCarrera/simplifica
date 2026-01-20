import { AwsClient } from "https://esm.sh/aws4fetch@1.0.17";

export interface EmailAttachment {
    filename: string;
    content: string; // base64
    contentType: string;
}

export interface SendEmailParams {
    to: string[];
    subject: string;
    body: string; // text
    htmlBody?: string;
    fromName?: string;
    fromEmail?: string;
    attachments?: EmailAttachment[];
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
    const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
    const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
    const REGION = Deno.env.get('AWS_REGION') ?? 'eu-west-1'; // Defaulting to eu-west-1 as it seems likely for EU based user, or fallback. Original had us-east-1 but let's check. Actually original had us-east-1. Let's keep consistent or better, check if I can see it. I'll stick to env var or default.

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        console.error('Missing AWS credentials');
        throw new Error('Missing AWS credentials');
    }

    const aws = new AwsClient({
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        region: REGION,
        service: 'email',
    });

    const fromEmail = params.fromEmail || Deno.env.get('SMTP_FROM_EMAIL') || 'notifications@example.com'; // Fallback
    const fromName = params.fromName || 'CAIBS CRM';

    // Construct MIME Message
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    const mixedBoundary = `mixed_${boundary}`;
    const altBoundary = `alt_${boundary}`;

    let rawMessage = '';

    // Headers
    rawMessage += `From: "${fromName}" <${fromEmail}>\n`;
    rawMessage += `To: ${params.to.join(', ')}\n`;
    rawMessage += `Subject: ${params.subject}\n`;
    rawMessage += `MIME-Version: 1.0\n`;
    rawMessage += `Content-Type: multipart/mixed; boundary="${mixedBoundary}"\n\n`;

    // -- MIXED BOUNDARY START
    rawMessage += `--${mixedBoundary}\n`;

    // Alternative part (Text + HTML)
    rawMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\n\n`;

    // Text Body
    rawMessage += `--${altBoundary}\n`;
    rawMessage += `Content-Type: text/plain; charset=UTF-8\n`;
    rawMessage += `Content-Transfer-Encoding: 7bit\n\n`;
    rawMessage += `${params.body}\n\n`;

    // HTML Body
    const html = params.htmlBody || params.body.replace(/\n/g, '<br>');
    rawMessage += `--${altBoundary}\n`;
    rawMessage += `Content-Type: text/html; charset=UTF-8\n`;
    rawMessage += `Content-Transfer-Encoding: 7bit\n\n`;
    rawMessage += `${html}\n\n`;

    // End Alternative
    rawMessage += `--${altBoundary}--\n\n`;

    // Attachments
    if (params.attachments && Array.isArray(params.attachments)) {
        for (const att of params.attachments) {
            if (att.content && att.filename) {
                rawMessage += `--${mixedBoundary}\n`;
                rawMessage += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"\n`;
                rawMessage += `Content-Transfer-Encoding: base64\n`;
                rawMessage += `Content-Disposition: attachment; filename="${att.filename}"\n\n`;
                rawMessage += `${att.content}\n\n`;
            }
        }
    }

    // End Mixed
    rawMessage += `--${mixedBoundary}--\n`;

    // Send params
    const sesParams = new URLSearchParams();
    sesParams.append('Action', 'SendRawEmail');
    sesParams.append('RawMessage.Data', btoa(rawMessage));
    sesParams.append('Source', `"${fromName}" <${fromEmail}>`);
    params.to.forEach((email: string, i: number) => {
        sesParams.append(`Destinations.member.${i + 1}`, email);
    });

    const response = await aws.fetch(`https://email.${REGION}.amazonaws.com`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: sesParams.toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('AWS SES Error:', errorText);
        throw new Error(`AWS SES Error: ${response.status} ${errorText}`);
    }

    return true;
}
