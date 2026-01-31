import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Route53DomainsClient, CheckDomainAvailabilityCommand, RegisterDomainCommand } from "npm:@aws-sdk/client-route-53-domains";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        const { action, payload } = await req.json();

        // 1. Authentication & Authorization
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Missing Supabase configuration');
            throw new Error('Server configuration error');
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } }
        });

        // Get User
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
             return new Response(JSON.stringify({ error: 'Invalid Token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // AWS Config
        const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
        const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');

        if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
             console.error('Missing AWS credentials');
             throw new Error('Server configuration error');
        }

        // Route53 Domains is GLOBAL (us-east-1)
        const r53DomainsClient = new Route53DomainsClient({
            region: "us-east-1",
            credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY }
        });

        switch (action) {
            case 'check-availability': {
                // Allowed for any authenticated user
                const { domain } = payload;
                if (!domain) throw new Error('Domain is required');

                const command = new CheckDomainAvailabilityCommand({ DomainName: domain });
                const response = await r53DomainsClient.send(command);

                return new Response(JSON.stringify(response), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            case 'register-domain': {
                // Restricted to super_admin or owner
                // We fetch the role only when needed to save DB calls on simpler actions
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select(`app_role:app_roles(name)`)
                    .eq('auth_user_id', user.id)
                    .single();

                if (userError || !userData) {
                     console.error('Error fetching user role:', userError);
                     return new Response(JSON.stringify({ error: 'Unauthorized: Could not verify role' }), {
                        status: 403,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // @ts-ignore
                const userRole = userData.app_role?.name;

                if (userRole !== 'super_admin' && userRole !== 'owner') {
                    return new Response(JSON.stringify({ error: 'Unauthorized: Insufficient privileges' }), {
                        status: 403,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const { domain } = payload;
                if (!domain) throw new Error('Domain is required');

                // DEFAULT CONTACT - In a real app, this should come from Company Profile
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
                    Email: user.email || 'admin@simplifica.com'
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
        // SECURITY: Do not leak stack traces
        return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
