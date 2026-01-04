import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.19"

console.log("Hello from aws-domains! (aws4fetch version)")

serve(async (req) => {
    // CORS Helper
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            }
        })
    }

    try {
        const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')
        const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')
        // Route53 Domains is a global service ONLY available in us-east-1.
        // We ignore the global AWS_REGION (used for SES in eu-west-3) for this specific client.
        const REGION = 'us-east-1';

        if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
            throw new Error('AWS Credentials not configured in Secrets.')
        }

        const aws = new AwsClient({
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
            region: REGION,
            service: 'route53domains', // Critical: correct service name
        });

        // Route53 Domains API
        // Endpoint format: https://route53domains.<region>.amazonaws.com/
        // Action: ListDomains
        // Protocol: AWS JSON 1.1

        const response = await aws.fetch(`https://route53domains.${REGION}.amazonaws.com/`, {
            method: 'POST',
            headers: {
                'X-Amz-Target': 'Route53Domains_v20140515.ListDomains',
                'Content-Type': 'application/x-amz-json-1.1'
            },
            body: JSON.stringify({ MaxItems: 50 })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`AWS API Error ${response.status}: ${text}`);
        }

        const data = await response.json();
        const domains = data.Domains || [];

        return new Response(
            JSON.stringify({ domains }),
            {
                headers: {
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*',
                }
            },
        )
    } catch (error: any) {
        console.error("Error executing aws-domains:", error.message, error.stack);
        return new Response(
            JSON.stringify({
                error: error.message,
                details: error.stack
            }),
            {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    'Access-Control-Allow-Origin': '*',
                }
            },
        )
    }
})
