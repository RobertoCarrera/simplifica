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
        // Initialize Supabase Client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        // Verify User
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error('Unauthorized');

        // Verify Permission (Must be Admin/Owner of at least one active company)
        const { data: publicUser } = await supabaseClient
            .from('users')
            .select('id')
            .eq('auth_user_id', user.id)
            .single();

        if (!publicUser) throw new Error('User profile not found');

        const { data: memberships } = await supabaseClient
            .from('company_members')
            .select('id')
            .eq('user_id', publicUser.id)
            .eq('status', 'active')
            .in('role', ['owner', 'admin'])
            .limit(1);

        if (!memberships || memberships.length === 0) {
            throw new Error('Forbidden: Insufficient permissions');
        }

        const { action, payload } = await req.json();

        // AWS Config
        const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
        const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');

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
                const { domain, contact } = payload;
                if (!domain) throw new Error('Domain is required');

                // DEFAULT CONTACT - In a real app, this should come from Company Profile
                // AWS requires valid fields.
                const defaultContact = contact || {
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
                    Email: 'admin@simplifica.com' // Should be the user's email
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
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
