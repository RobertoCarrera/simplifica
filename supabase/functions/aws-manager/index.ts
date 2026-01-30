import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Route53DomainsClient, CheckDomainAvailabilityCommand, RegisterDomainCommand } from "npm:@aws-sdk/client-route-53-domains";
import { SESv2Client, CreateEmailIdentityCommand } from "npm:@aws-sdk/client-sesv2";
import { Route53Client, ChangeResourceRecordSetsCommand } from "npm:@aws-sdk/client-route-53";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // 1. SECURITY CHECK: Verify Authentication
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new Error('Missing Authorization header');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        // Get user from the token
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // 2. Parse Request
        const { action, payload } = await req.json();

        // AWS Config
        const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
        const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');

        if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
             throw new Error('AWS credentials not configured');
        }

        // Route53 Domains is GLOBAL (us-east-1)
        const r53DomainsClient = new Route53DomainsClient({
            region: "us-east-1",
            credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! }
        });

        // SES & Route53 DNS are REGIONAL (eu-west-3 as per our setup)
        const SES_REGION = 'eu-west-3';
        const sesClient = new SESv2Client({
            region: SES_REGION,
            credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! }
        });

        const route53Client = new Route53Client({
            region: "us-east-1", // Route53 global endpoint
            credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! }
        });

        switch (action) {
            case 'check-availability': {
                const { domain } = payload;
                if (!domain) throw new Error('Domain is required');

                const command = new CheckDomainAvailabilityCommand({ DomainName: domain });
                const response = await r53DomainsClient.send(command);

                return new Response(JSON.stringify(response), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'register-domain': {
                // Critical action: ensure the user is allowed to register domains.
                // Ideally, we should check company_id and payment status here.
                // For now, at least we know who they are (authenticated).

                const { domain } = payload;
                if (!domain) throw new Error('Domain is required');

                // DEFAULT CONTACT - In a real app, this should come from Company Profile
                // AWS requires valid fields.
                const defaultContact = {
                    FirstName: 'Admin',
                    LastName: 'User',
                    ContactType: 'COMPANY',
                    OrganizationName: 'Simplifica Test',
                    AddressLine1: '123 Test Street',
                    City: 'Test City',
                    State: 'NY',
                    CountryCode: 'US',
                    ZipCode: '10001',
                    PhoneNumber: '+1.5555555555',
                    Email: user.email || 'admin@simplifica.com' // Use authenticated user email if available
                };

                const command = new RegisterDomainCommand({
                    DomainName: domain,
                    DurationInYears: 1,
                    AutoRenew: true,
                    AdminContact: defaultContact,
                    RegistrantContact: defaultContact,
                    TechContact: defaultContact,
                    PrivacyProtectAdminContact: true,
                    PrivacyProtectRegistrantContact: true,
                    PrivacyProtectTechContact: true,
                });

                const response = await r53DomainsClient.send(command);

                return new Response(JSON.stringify(response), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            default:
                throw new Error(`Unknown action: ${action}`);
        }

    } catch (error: any) {
        console.error('Error in aws-manager:', error);
        // Do not expose stack trace to client
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
