import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import {
  Route53DomainsClient,
  CheckDomainAvailabilityCommand,
  RegisterDomainCommand,
} from 'npm:@aws-sdk/client-route-53-domains@3.583.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP } from '../_shared/security.ts';

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  // Rate limiting: 30 req/min per IP (admin-only AWS operations)
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`aws-manager:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ success: false, error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  try {
    const { action, payload } = await req.json();
    if (!action) {
      return new Response(JSON.stringify({ success: false, error: 'Missing action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authentication — verify JWT server-side via Supabase Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const token = authHeader.replace('Bearer ', '');

    // SECURITY: Verify JWT via Supabase Auth API — never trust unverified claims
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = user.id;

    console.log(`[aws-manager] user=${userId} action=${action}`);

    // BLOCK register-domain: require super_admin role OR paid domain_orders entry
    if (action === 'register-domain') {
      const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: isAdmin } = await supabaseService.rpc('is_super_admin_by_id', {
        p_user_id: userId,
      });
      if (!isAdmin) {
        // Validate domain format
        if (
          !payload?.domain ||
          !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i.test(payload.domain)
        ) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid domain format' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // IDOR fix: verify the paid order belongs to the authenticated user
        const normalizedDomain = payload.domain.toLowerCase();
        const { data: order } = await supabaseService
          .from('domain_orders')
          .select('id, domain_name')
          .eq('domain_name', normalizedDomain)
          .eq('user_id', userId)
          .eq('payment_status', 'paid')
          .single();
        if (!order) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'El dominio debe ser pagado y aprobado antes de registrarse.',
            }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }
    }

    // AWS credentials
    const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')?.replace(/\s/g, '');
    const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')?.replace(/\s/g, '');

    if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'AWS credentials not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const creds = { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY };
    const client = new Route53DomainsClient({ region: 'us-east-1', credentials: creds });

    switch (action) {
      case 'check-availability': {
        const { domain } = payload ?? {};
        if (!domain) {
          return new Response(JSON.stringify({ success: false, error: 'domain is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Validate domain format to prevent passing arbitrary strings to AWS API
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i.test(domain)) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid domain format' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        console.log(`[aws-manager] Checking availability for: ${domain}`);
        try {
          const response = await client.send(
            new CheckDomainAvailabilityCommand({ DomainName: domain }),
          );
          console.log(`[aws-manager] Availability: ${response.Availability}`);
          return new Response(JSON.stringify({ Availability: response.Availability }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (awsErr: any) {
          console.error(
            '[aws-manager] CheckDomainAvailability failed:',
            awsErr.name,
            awsErr.message,
          );
          return new Response(
            JSON.stringify({ success: false, error: 'Domain availability check failed' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      case 'register-domain': {
        const { domain, contactInfo } = payload ?? {};
        if (!domain) {
          return new Response(JSON.stringify({ success: false, error: 'domain is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const contact = {
          FirstName: contactInfo?.firstName || 'Admin',
          LastName: contactInfo?.lastName || 'User',
          ContactType: 'COMPANY',
          OrganizationName: contactInfo?.company || 'Simplifica',
          AddressLine1: contactInfo?.address || '123 Calle Principal',
          City: contactInfo?.city || 'Madrid',
          State: contactInfo?.state || 'MD',
          CountryCode: 'ES',
          ZipCode: contactInfo?.zip || '28001',
          PhoneNumber: contactInfo?.phone || '+34.910000000',
          Email: contactInfo?.email || 'admin@simplifica.com',
        };
        console.log(`[aws-manager] Registering domain: ${domain}`);
        try {
          const response = await client.send(
            new RegisterDomainCommand({
              DomainName: domain,
              DurationInYears: 1,
              AutoRenew: true,
              AdminContact: contact,
              RegistrantContact: contact,
              TechContact: contact,
              PrivacyProtectAdminContact: true,
              PrivacyProtectRegistrantContact: true,
              PrivacyProtectTechContact: true,
            }),
          );
          return new Response(JSON.stringify({ OperationId: response.OperationId }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (regErr: any) {
          console.error('[aws-manager] Register domain failed:', regErr.name, regErr.message);
          return new Response(
            JSON.stringify({ success: false, error: 'Domain registration failed' }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
    }
  } catch (error: any) {
    console.error('[aws-manager] Unhandled error:', error?.name, error?.message);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
