import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Route53DomainsClient, CheckDomainAvailabilityCommand, RegisterDomainCommand } from "npm:@aws-sdk/client-route-53-domains@3.583.0";

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
        const { action, payload } = await req.json();

        if (!action) {
            return new Response(JSON.stringify({ success: false, error: 'Missing action' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')?.replace(/\s/g, '');
        const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')?.replace(/\s/g, '');

        if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
            console.error('[aws-manager] Missing AWS credentials');
            return new Response(JSON.stringify({ success: false, error: 'AWS credentials not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const creds = { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY };
        const client = new Route53DomainsClient({ region: 'us-east-1', credentials: creds });

        switch (action) {
            case 'check-availability': {
                const { domain } = payload ?? {};
                if (!domain) {
                    return new Response(JSON.stringify({ success: false, error: 'domain is required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                console.log(`[aws-manager] Checking availability for: ${domain}`);
                try {
                    const response = await client.send(new CheckDomainAvailabilityCommand({ DomainName: domain }));
                    console.log(`[aws-manager] Availability: ${response.Availability}`);
                    return new Response(JSON.stringify({ Availability: response.Availability }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (awsErr: any) {
                    console.error('[aws-manager] CheckDomainAvailability failed:', awsErr.name, awsErr.message);
                    // Return 200 so the client can read the actual AWS error message
                    return new Response(JSON.stringify({
                        success: false,
                        awsError: awsErr.name,
                        message: awsErr.message,
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            case 'register-domain': {
                const { domain, contactInfo } = payload ?? {};
                if (!domain) {
                    return new Response(JSON.stringify({ success: false, error: 'domain is required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const contact = {
                    FirstName: contactInfo?.firstName || 'Admin',
                    LastName: contactInfo?.lastName || 'User',
                    ContactType: 'COMPANY' as const,
                    OrganizationName: contactInfo?.company || 'Simplifica',
                    AddressLine1: contactInfo?.address || '123 Calle Principal',
                    City: contactInfo?.city || 'Madrid',
                    State: contactInfo?.state || 'MD',
                    CountryCode: 'ES' as const,
                    ZipCode: contactInfo?.zip || '28001',
                    PhoneNumber: contactInfo?.phone || '+34.910000000',
                    Email: contactInfo?.email || 'admin@simplifica.com',
                };

                console.log(`[aws-manager] Registering domain: ${domain}`);
                const response = await client.send(new RegisterDomainCommand({
                    DomainName: domain,
                    DurationInYears: 1,
                    AutoRenew: true,
                    AdminContact: contact,
                    RegistrantContact: contact,
                    TechContact: contact,
                    PrivacyProtectAdminContact: true,
                    PrivacyProtectRegistrantContact: true,
                    PrivacyProtectTechContact: true,
                }));
                return new Response(JSON.stringify({ OperationId: response.OperationId }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            default:
                return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
        }

    } catch (error: any) {
        console.error('[aws-manager] Unhandled error:', error.name, error.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.name || 'UnknownError',
            message: error.message,
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
