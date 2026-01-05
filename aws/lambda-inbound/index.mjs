
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { simpleParser } from "mailparser";
import https from "https";

const s3Client = new S3Client({});

export const handler = async (event) => {
  console.log("Event received:", JSON.stringify(event));

  const record = event.Records[0];
  let bucket, key;

  if (record.s3) {
    bucket = record.s3.bucket.name;
    key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  } else if (record.ses) {
    bucket = 'simplifica-inbound-emails'; 
    key = 'incoming/' + record.ses.mail.messageId;
    console.log(`Processing SES Event for MessageID: ${record.ses.mail.messageId}`);
  } else {
    throw new Error('Unknown event format');
  }

  try {
    console.log(`Fetching email from S3: ${bucket}/${key}`);
    
    // AWS SDK v3
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    
    // Parse Email (response.Body is a stream)
    const parsed = await simpleParser(response.Body);
    
    // Construct Payload
    const payload = {
      to: parsed.to?.text, 
      from: parsed.from?.text,
      subject: parsed.subject,
      body: parsed.text, 
      html_body: parsed.html || parsed.textAsHtml, 
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      date: parsed.date
    };

    console.log('Parsed Payload:', JSON.stringify(payload));

    // Send to Supabase
    const result = await postToSupabase(payload);
    console.log('Supabase Result:', result);
    
    return { statusCode: 200, body: 'Email processed' };

  } catch (err) {
    console.error('Error processing email:', err);
    throw err;
  }
};

function postToSupabase(payload) {
  return new Promise((resolve, reject) => {
    const url = process.env.SUPABASE_URL; 
    const apiKey = process.env.SUPABASE_KEY;

    if (!url) return reject(new Error('Missing SUPABASE_URL env var'));

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Supabase returned ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(JSON.stringify(payload));
    req.end();
  });
}
