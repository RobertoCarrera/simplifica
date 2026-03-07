import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Route53DomainsClient, ListDomainsCommand } from "npm:@aws-sdk/client-route-53-domains";
import { Route53Client, ListHostedZonesCommand } from "npm:@aws-sdk/client-route-53";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')?.trim();
        const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')?.trim();
        const REGION = "us-east-1"; // Route53 operations are typically managed via us-east-1 (global endpoint)

        if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
            throw new Error("AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not found in secrets.");
        }

        const creds = {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        };

        // 1. Fetch Registered Domains
        let registeredDomains = [];
        try {
            const domainsClient = new Route53DomainsClient({ region: REGION, credentials: creds });
            const listDomainsCmd = new ListDomainsCommand({ MaxItems: 100 });
            const domainsData = await domainsClient.send(listDomainsCmd);
            registeredDomains = domainsData.Domains || [];
            console.log(`[aws-domains] Found ${registeredDomains.length} registered domains.`);
        } catch (domainErr: any) {
            console.warn(`[aws-domains] Skip ListDomains: ${domainErr.message}`);
            // We don't throw yet, maybe Hosted Zones will work
        }

        // 2. Fetch Hosted Zones (DNS)
        let hostedZones = [];
        try {
            const r53Client = new Route53Client({ region: REGION, credentials: creds });
            const listZonesCmd = new ListHostedZonesCommand({ MaxItems: 100 });
            const zonesData = await r53Client.send(listZonesCmd);
            hostedZones = zonesData.HostedZones || [];
            console.log(`[aws-domains] Found ${hostedZones.length} hosted zones.`);
        } catch (zoneErr: any) {
            console.warn(`[aws-domains] Skip ListHostedZones: ${zoneErr.message}`);
        }

        // 3. Merge and Normalize for Frontend
        // Frontend expects { DomainName: string }
        const domainNames = new Set<string>();
        
        registeredDomains.forEach((d: any) => {
            if (d.DomainName) domainNames.add(d.DomainName.toLowerCase());
        });

        hostedZones.forEach((z: any) => {
            if (z.Name) {
                // Route53 Hosted Zones end with a dot, e.g. "example.com."
                let name = z.Name.toLowerCase();
                if (name.endsWith('.')) name = name.slice(0, -1);
                domainNames.add(name);
            }
        });

        const finalDomains = Array.from(domainNames).map(name => ({
            DomainName: name,
            Source: 'aws'
        }));

        return new Response(JSON.stringify({ domains: finalDomains }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error(`[aws-domains] Fatal Error:`, error.message);
        return new Response(JSON.stringify({ 
            error: "AWS_API_ERROR", 
            message: error.message,
            details: error.stack 
        }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
