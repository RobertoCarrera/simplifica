// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.19"

const FUNCTION_NAME = "aws-domains";

serve(async (req) => {
    const origin = req.headers.get("origin") || "*";

    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            }
        });
    }

    try {
        const ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
        const SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
        const REGION = "us-east-1";

        if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
            throw new Error("AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not found in secrets.");
        }

        const aws = new AwsClient({
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
            region: REGION,
            service: "route53domains",
        });

        console.log(`[${FUNCTION_NAME}] Fetching domains from Route53Domains...`);

        const response = await aws.fetch(`https://route53domains.${REGION}.amazonaws.com/`, {
            method: "POST",
            headers: {
                "X-Amz-Target": "Route53Domains_v20140515.ListDomains",
                "Content-Type": "application/x-amz-json-1.1"
            },
            body: JSON.stringify({ MaxItems: 100 })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${FUNCTION_NAME}] AWS Error ${response.status}: ${errorText}`);
            return new Response(JSON.stringify({ 
                error: "AWS_API_ERROR", 
                status: response.status,
                details: errorText 
            }), {
                status: 400,
                headers: { 
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": origin
                }
            });
        }

        const data = await response.json();
        return new Response(JSON.stringify({ domains: data.Domains || [] }), {
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": origin
            }
        });

    } catch (error: any) {
        console.error(`[${FUNCTION_NAME}] Fatal Error:`, error.message);
        return new Response(JSON.stringify({ 
            error: "INTERNAL_ERROR", 
            message: error.message 
        }), {
            status: 400,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": origin
            }
        });
    }
});
